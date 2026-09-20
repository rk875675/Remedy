import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3';
import { corsHeaders } from '../_shared/cors.ts';
import { checkRateLimitFixedWindow } from '../_shared/ratelimit.ts';
import { captureServerEvent } from '../_shared/analytics.ts';

// Creator promo codes — user-facing half. Two routes in one function:
//
//   POST /promo-codes/validate  (pre-auth)  — is this string a live backend code?
//   POST /promo-codes/redeem    (Bearer)    — grant access via redeem_promo_code RPC
//
// verify_jwt = false in config.toml: validate runs before the user has an account,
// so the gateway JWT check would reject it. Redeem enforces auth itself (getUser).
//
// Validate returns a uniform { valid: false } for every failure (missing, inactive,
// expired, exhausted, creator inactive) so near-miss codes cannot be probed apart.
// Only a { valid: false } may send the client to the Apple offer-code fallback.

const bodySchema = z
  .object({
    code: z.string().min(1).max(64),
  })
  .strict();

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

// Fallback limiter for the public validate route when Upstash secrets are unset.
// Per-isolate (in-memory), so it is best-effort — the Upstash path is the real one.
const memoryHits = new Map<string, number[]>();
function memoryRateLimit(key: string, limit: number, windowSeconds: number): boolean {
  const now = Date.now();
  const cutoff = now - windowSeconds * 1000;
  const hits = (memoryHits.get(key) ?? []).filter((t) => t > cutoff);
  hits.push(now);
  memoryHits.set(key, hits);
  if (memoryHits.size > 10_000) memoryHits.clear(); // unbounded-growth guard
  return hits.length <= limit;
}

// Escape ilike wildcards so the lookup is a case-insensitive EQUALITY match, never
// a pattern: a code of "%" must not match everything.
function escapeIlike(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

type PromoType = 'months_free' | 'weeks_free' | 'minutes_free' | 'lifetime';

type CodeRow = {
  id: string;
  code: string;
  type: PromoType;
  months: number | null;
  weeks: number | null;
  minutes: number | null;
  active: boolean;
  expires_at: string | null;
  max_redemptions: number | null;
  redemption_count: number;
  creators: { name: string; slug: string; active: boolean };
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ success: false, error: 'method_not_allowed' }, 405);
  }

  const url = new URL(req.url);
  const route = url.pathname.endsWith('/redeem')
    ? 'redeem'
    : url.pathname.endsWith('/validate')
      ? 'validate'
      : null;
  if (!route) return json({ success: false, error: 'not_found' }, 404);

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const redisUrl = Deno.env.get('UPSTASH_REDIS_REST_URL');
    const redisToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return json({ success: false, error: 'invalid_json' }, 400);
    }
    const parsed = bodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return json({ success: false, error: 'invalid_body' }, 400);
    }
    const code = parsed.data.code.trim();
    if (code.length === 0 || code.length > 64) {
      return json({ success: false, error: 'invalid_body' }, 400);
    }

    if (route === 'validate') {
      // Pre-auth: rate limit by IP. 20 checks/minute is generous for a human
      // typing codes and useless for enumeration.
      const ip = clientIp(req) ?? 'unknown';
      if (redisUrl && redisToken) {
        const rl = await checkRateLimitFixedWindow(
          `ratelimit:promo-codes-validate-ip:${ip}`,
          20,
          60,
        );
        if (!rl.allowed) {
          return json({ success: false, error: 'rate_limited', retryAfter: rl.retryAfter }, 429, {
            'Retry-After': String(rl.retryAfter ?? 60),
          });
        }
      } else if (!memoryRateLimit(`validate:${ip}`, 20, 60)) {
        return json({ success: false, error: 'rate_limited', retryAfter: 60 }, 429, {
          'Retry-After': '60',
        });
      }

      const { data, error } = await supabaseAdmin
        .from('promo_codes')
        .select(
          'id, code, type, months, weeks, minutes, active, expires_at, max_redemptions, redemption_count, creators!inner(name, slug, active)',
        )
        .ilike('code', escapeIlike(code))
        .maybeSingle<CodeRow>();

      if (error) return json({ success: false, error: 'internal_error' }, 500);

      // Signed-in caller who already used this code: do not fall through to
      // Apple. Live access → treat as valid (redeem is idempotent). Lapsed
      // grant → already_used. Anonymous callers still get a uniform { valid: false }.
      const validateAuth = req.headers.get('Authorization');
      if (data && validateAuth) {
        const token = validateAuth.replace('Bearer ', '');
        const { data: { user: validateUser } } = await supabaseAdmin.auth.getUser(token);
        if (validateUser) {
          const { data: prior } = await supabaseAdmin
            .from('promo_code_redemptions')
            .select('id')
            .eq('promo_code_id', data.id)
            .eq('user_id', validateUser.id)
            .maybeSingle();
          if (prior) {
            const { data: ent } = await supabaseAdmin
              .from('entitlements')
              .select('is_premium, subscription_status, expires_at')
              .eq('user_id', validateUser.id)
              .maybeSingle();
            const entitled =
              !!ent &&
              ent.is_premium === true &&
              (!ent.expires_at || new Date(ent.expires_at).getTime() > Date.now()) &&
              ['active', 'trial', 'dev_trial', 'cancelled'].includes(ent.subscription_status);
            if (!entitled) return json({ valid: false, already_used: true }, 200);
            return json(
              {
                valid: true,
                code: data.code,
                type: data.type,
                months: data.months,
                weeks: data.weeks,
                minutes: data.minutes,
                creator: { name: data.creators.name, slug: data.creators.slug },
              },
              200,
            );
          }
        }
      }

      const live =
        !!data &&
        data.active &&
        data.creators.active &&
        (!data.expires_at || new Date(data.expires_at).getTime() > Date.now()) &&
        (data.max_redemptions === null || data.redemption_count < data.max_redemptions);

      if (!live) return json({ valid: false }, 200);

      return json(
        {
          valid: true,
          code: data.code,
          type: data.type,
          months: data.months,
          weeks: data.weeks,
          minutes: data.minutes,
          creator: { name: data.creators.name, slug: data.creators.slug },
        },
        200,
      );
    }

    // --- redeem -------------------------------------------------------------
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ success: false, error: 'missing_auth' }, 401);

    // Server-authoritative identity: derive the user from the verified JWT.
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return json({ success: false, error: 'invalid_auth' }, 401);

    if (redisUrl && redisToken) {
      const rl = await checkRateLimitFixedWindow(
        `ratelimit:promo-codes-redeem:${user.id}`,
        5,
        60,
      );
      if (!rl.allowed) {
        return json({ success: false, error: 'rate_limited', retryAfter: rl.retryAfter }, 429, {
          'Retry-After': String(rl.retryAfter ?? 60),
        });
      }
    }

    const { data: result, error: rpcError } = await supabaseAdmin.rpc('redeem_promo_code', {
      p_code: code,
      p_user_id: user.id,
    });
    if (rpcError || !result) {
      console.error('[promo-codes] redeem_promo_code failed:', rpcError);
      return json({ success: false, error: 'internal_error' }, 500);
    }

    const r = result as {
      result:
        | 'invalid'
        | 'already_redeemed'
        | 'already_used'
        | 'fully_redeemed'
        | 'already_entitled'
        | 'redeemed';
      code?: string;
      type?: PromoType;
      months?: number | null;
      weeks?: number | null;
      minutes?: number | null;
      creator_name?: string;
      creator_slug?: string;
      expires_at?: string | null;
    };

    switch (r.result) {
      case 'invalid':
        return json({ success: false, error: 'INVALID_CODE' }, 404);
      case 'already_used':
      case 'fully_redeemed':
        return json({ success: false, error: 'CODE_FULLY_REDEEMED' }, 409);
      case 'already_entitled':
        return json({ success: false, error: 'ALREADY_ENTITLED' }, 409);
      case 'redeemed':
      case 'already_redeemed': {
        // Analytics only on a FRESH redemption. Retries replay through
        // 'already_redeemed' (the RPC is idempotent per user+code), so this
        // capture cannot double-count.
        if (r.result === 'redeemed') {
          const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('is_dev')
            .eq('id', user.id)
            .maybeSingle();
          await captureServerEvent({
            distinctId: user.id,
            event: 'promo_code_redeemed',
            environment: 'production',
            isInternal: profile?.is_dev ?? false,
            properties: {
              code: r.code ?? null,
              promo_type: r.type ?? null,
              months: r.months ?? null,
              weeks: r.weeks ?? null,
              minutes: r.minutes ?? null,
              creator_slug: r.creator_slug ?? null,
              expires_at: r.expires_at ?? null,
            },
            personProperties: {
              is_premium: true,
              subscription_status: 'active',
              subscription_expires_at: r.expires_at ?? null,
              entitlement_source: 'promo',
            },
          });
        }
        return json(
          {
            redeemed: true,
            already_redeemed: r.result === 'already_redeemed',
            code: r.code,
            type: r.type,
            months: r.months ?? null,
            weeks: r.weeks ?? null,
            minutes: r.minutes ?? null,
            creator: { name: r.creator_name, slug: r.creator_slug },
            entitlement_status: 'active',
            expires_at: r.expires_at ?? null,
          },
          200,
        );
      }
      default:
        return json({ success: false, error: 'internal_error' }, 500);
    }
  } catch {
    return json({ success: false, error: 'internal_error' }, 500);
  }
});
