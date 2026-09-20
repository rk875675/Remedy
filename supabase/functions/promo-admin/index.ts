import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3';
import { checkRateLimitFixedWindow } from '../_shared/ratelimit.ts';

// Promo admin — mint/manage creator codes from the static admin page
// (website/promo-admin.html). Auth is a single shared password in the
// x-admin-password header, compared in constant time against the
// PROMO_ADMIN_PASSWORD function secret. verify_jwt = false in config.toml
// (no Supabase JWT exists on this surface); if the secret is unset every
// request is refused with 503.
//
// The service-role key never leaves this function — the HTML only ever holds
// the admin password.

// Local CORS (not _shared/cors.ts): this surface must also allow the
// x-admin-password header, and only this function should.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-admin-password',
};

function json(body: unknown, status: number, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function clientIp(req: Request): string | null {
  const cf = req.headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const xff = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (xff) return xff;
  const real = req.headers.get('x-real-ip')?.trim();
  return real || null;
}

// Constant-time comparison over SHA-256 digests: fixed-length inputs, full-loop
// XOR — no early exit, no length leak.
async function passwordMatches(candidate: string, secret: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(candidate)),
    crypto.subtle.digest('SHA-256', enc.encode(secret)),
  ]);
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const creatorSchema = z.object({ name: z.string().min(1).max(120) }).strict();

const mintSchema = z
  .object({
    code: z.string().min(1).max(64),
    type: z.enum(['months_free', 'weeks_free', 'minutes_free', 'lifetime']),
    months: z.number().int().positive().optional(),
    weeks: z.number().int().positive().optional(),
    minutes: z.number().int().positive().optional(),
    creator_id: z.string().uuid(),
    is_personal: z.boolean().optional(),
    max_redemptions: z.number().int().positive().optional(),
    expires_at: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .refine(
    (b) => {
      const hasMonths = b.months !== undefined;
      const hasWeeks = b.weeks !== undefined;
      const hasMinutes = b.minutes !== undefined;
      if (b.type === 'months_free') return hasMonths && !hasWeeks && !hasMinutes;
      if (b.type === 'weeks_free') return hasWeeks && !hasMonths && !hasMinutes;
      if (b.type === 'minutes_free') return hasMinutes && !hasMonths && !hasWeeks;
      return !hasMonths && !hasWeeks && !hasMinutes;
    },
    { message: 'duration_required_iff_matching_type' },
  );

const toggleSchema = z
  .object({ id: z.string().uuid(), active: z.boolean() })
  .strict();

const deleteSchema = z.object({ id: z.string().uuid() }).strict();

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ success: false, error: 'method_not_allowed' }, 405);
  }

  try {
    const secret = Deno.env.get('PROMO_ADMIN_PASSWORD');
    if (!secret) {
      // Unset secret = admin surface disabled entirely, never open.
      return json({ success: false, error: 'admin_disabled' }, 503);
    }

    const redisUrl = Deno.env.get('UPSTASH_REDIS_REST_URL');
    const redisToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');
    const ip = clientIp(req) ?? 'unknown';

    const candidate = req.headers.get('x-admin-password') ?? '';
    const authed = candidate.length > 0 && (await passwordMatches(candidate, secret));

    if (!authed) {
      // Tight per-IP limit on failed attempts: 10 per 5 minutes.
      if (redisUrl && redisToken) {
        const rl = await checkRateLimitFixedWindow(
          `ratelimit:promo-admin-fail-ip:${ip}`,
          10,
          300,
        );
        if (!rl.allowed) {
          return json({ success: false, error: 'rate_limited', retryAfter: rl.retryAfter }, 429, {
            'Retry-After': String(rl.retryAfter ?? 300),
          });
        }
      }
      return json({ success: false, error: 'unauthorized' }, 401);
    }

    // Roomier per-IP limit for the authenticated admin: 60 per minute.
    if (redisUrl && redisToken) {
      const rl = await checkRateLimitFixedWindow(
        `ratelimit:promo-admin-ip:${ip}`,
        60,
        60,
      );
      if (!rl.allowed) {
        return json({ success: false, error: 'rate_limited', retryAfter: rl.retryAfter }, 429, {
          'Retry-After': String(rl.retryAfter ?? 60),
        });
      }
    }

    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const adminIdx = parts.lastIndexOf('promo-admin');
    const route = parts.slice(adminIdx + 1).join('/');

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let rawBody: unknown = {};
    const text = await req.text();
    if (text.length > 0) {
      try {
        rawBody = JSON.parse(text);
      } catch {
        return json({ success: false, error: 'invalid_json' }, 400);
      }
    }

    switch (route) {
      case 'login':
        return json({ ok: true }, 200);

      case 'overview': {
        const [{ data: creators, error: cErr }, { data: codes, error: kErr }] = await Promise.all([
          supabaseAdmin
            .from('creators')
            .select('id, name, slug, active, created_at')
            .order('created_at', { ascending: true }),
          supabaseAdmin
            .from('promo_codes')
            .select(
              'id, code, type, months, weeks, minutes, creator_id, is_personal, max_redemptions, redemption_count, active, expires_at, created_at, creators(name, slug)',
            )
            .order('created_at', { ascending: false }),
        ]);
        if (cErr || kErr) return json({ success: false, error: 'internal_error' }, 500);
        return json({ creators: creators ?? [], codes: codes ?? [] }, 200);
      }

      case 'creators': {
        const parsed = creatorSchema.safeParse(rawBody);
        if (!parsed.success) return json({ success: false, error: 'invalid_body' }, 400);
        const name = parsed.data.name.trim();
        // Name must contain at least one letter or number, or the slug is empty.
        if (!/[a-zA-Z0-9]/.test(name)) {
          return json({ success: false, error: 'invalid_body' }, 400);
        }
        const slug = slugify(name);
        const { data, error } = await supabaseAdmin
          .from('creators')
          .insert({ name, slug })
          .select('id, name, slug, active, created_at')
          .single();
        if (error) {
          if (error.code === '23505') {
            return json({ success: false, error: 'DUPLICATE_SLUG' }, 409);
          }
          return json({ success: false, error: 'internal_error' }, 500);
        }
        return json({ creator: data }, 200);
      }

      case 'codes': {
        const parsed = mintSchema.safeParse(rawBody);
        if (!parsed.success) return json({ success: false, error: 'invalid_body' }, 400);
        const b = parsed.data;
        const code = b.code.trim();
        if (code.length === 0) return json({ success: false, error: 'invalid_body' }, 400);

        const { data: creator } = await supabaseAdmin
          .from('creators')
          .select('id')
          .eq('id', b.creator_id)
          .maybeSingle();
        if (!creator) return json({ success: false, error: 'UNKNOWN_CREATOR' }, 400);

        const { data, error } = await supabaseAdmin
          .from('promo_codes')
          .insert({
            code,
            type: b.type,
            months: b.type === 'months_free' ? b.months : null,
            weeks: b.type === 'weeks_free' ? b.weeks : null,
            minutes: b.type === 'minutes_free' ? b.minutes : null,
            creator_id: b.creator_id,
            is_personal: b.is_personal ?? false,
            max_redemptions: b.max_redemptions ?? null,
            expires_at: b.expires_at ?? null,
          })
          .select('id, code, type, months, weeks, minutes, creator_id, is_personal, max_redemptions, redemption_count, active, expires_at, created_at')
          .single();
        if (error) {
          // Unique index on lower(code).
          if (error.code === '23505') {
            return json({ success: false, error: 'DUPLICATE_CODE' }, 409);
          }
          return json({ success: false, error: 'internal_error' }, 500);
        }
        return json({ code: data }, 200);
      }

      case 'codes/toggle': {
        const parsed = toggleSchema.safeParse(rawBody);
        if (!parsed.success) return json({ success: false, error: 'invalid_body' }, 400);
        const { data, error } = await supabaseAdmin
          .from('promo_codes')
          .update({ active: parsed.data.active })
          .eq('id', parsed.data.id)
          .select('id, active')
          .maybeSingle();
        if (error) return json({ success: false, error: 'internal_error' }, 500);
        if (!data) return json({ success: false, error: 'NOT_FOUND' }, 404);
        return json({ ok: true, id: data.id, active: data.active }, 200);
      }

      case 'codes/delete': {
        const parsed = deleteSchema.safeParse(rawBody);
        if (!parsed.success) return json({ success: false, error: 'invalid_body' }, 400);
        const { data: existing, error: readErr } = await supabaseAdmin
          .from('promo_codes')
          .select('id, redemption_count')
          .eq('id', parsed.data.id)
          .maybeSingle();
        if (readErr) return json({ success: false, error: 'internal_error' }, 500);
        if (!existing) return json({ success: false, error: 'NOT_FOUND' }, 404);
        if (existing.redemption_count > 0) {
          return json(
            {
              success: false,
              error: 'HAS_REDEMPTIONS',
              message: 'Cannot delete a code that has been redeemed. Deactivate it instead.',
            },
            409,
          );
        }
        const { error } = await supabaseAdmin
          .from('promo_codes')
          .delete()
          .eq('id', parsed.data.id);
        if (error) {
          // FK from promo_code_redemptions — a redemption raced the counter check.
          if (error.code === '23503') {
            return json(
              {
                success: false,
                error: 'HAS_REDEMPTIONS',
                message: 'Cannot delete a code that has been redeemed. Deactivate it instead.',
              },
              409,
            );
          }
          return json({ success: false, error: 'internal_error' }, 500);
        }
        return json({ ok: true }, 200);
      }

      default:
        return json({ success: false, error: 'not_found' }, 404);
    }
  } catch {
    return json({ success: false, error: 'internal_error' }, 500);
  }
});
