import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3';
import { corsHeaders } from '../_shared/cors.ts';
import { checkRateLimitFixedWindow } from '../_shared/ratelimit.ts';

const FEEDBACK_TO = 'social@remedyrecoveries.com';
const FEEDBACK_FROM = 'Remedy <hello@send.remedyrecoveries.com>';

const MAX_PAYLOAD_BYTES = 8192;
const MAX_PER_HOUR = 3;
const MAX_PER_DAY = 10;
const MIN_GAP_SECONDS = 30;
const IP_PER_HOUR = 10;

const bodySchema = z
  .object({
    category: z.enum(['bug', 'idea', 'question', 'other']),
    rating: z.number().int().min(1).max(5).nullable(),
    body: z.string().trim().min(10).max(2000),
    app_version: z.string().max(32).optional(),
  })
  .strict();

type FeedbackRow = {
  body: string;
  created_at: string;
};

function json(body: unknown, status: number, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function categoryLabel(category: z.infer<typeof bodySchema>['category']): string {
  switch (category) {
    case 'bug':
      return 'Bug';
    case 'idea':
      return 'Idea';
    case 'question':
      return 'Question';
    case 'other':
      return 'Other';
  }
}

function clientIp(req: Request): string | null {
  const cf = req.headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const xff = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (xff) return xff;
  const real = req.headers.get('x-real-ip')?.trim();
  return real || null;
}

function sanitizeBody(raw: string): string {
  return raw.replace(/\0/g, '').replace(/\r\n/g, '\n').trim();
}

function isLowEntropy(text: string): boolean {
  const compact = text.replace(/\s+/g, '');
  if (compact.length < 10) return false;
  const unique = new Set(compact.toLowerCase()).size;
  return unique <= 2;
}

async function sendFeedbackEmail(args: {
  apiKey: string;
  category: string;
  rating: number | null;
  body: string;
  appVersion: string | null;
  userId: string;
  userEmail: string | null;
}): Promise<void> {
  const ratingLine = args.rating === null ? 'not given' : String(args.rating);
  const emailLine = args.userEmail ?? 'unknown';
  const text = [
    `Category: ${args.category}`,
    `Rating: ${ratingLine}`,
    `App version: ${args.appVersion ?? 'unknown'}`,
    `User: ${args.userId}`,
    `Email: ${emailLine}`,
    '',
    args.body,
  ].join('\n');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FEEDBACK_FROM,
      to: [FEEDBACK_TO],
      reply_to: args.userEmail ?? undefined,
      subject: `[Feedback] ${args.category} — Remedy`,
      text,
    }),
  });

  if (!res.ok) {
    throw new Error(`resend_http_${res.status}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return json({ success: false, error: 'method_not_allowed' }, 405);
    }

    const contentLength = Number(req.headers.get('content-length') ?? '0');
    if (Number.isFinite(contentLength) && contentLength > MAX_PAYLOAD_BYTES) {
      return json({ success: false, error: 'payload_too_large' }, 413);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ success: false, error: 'missing_auth' }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return json({ success: false, error: 'invalid_auth' }, 401);

    const redisUrl = Deno.env.get('UPSTASH_REDIS_REST_URL');
    const redisToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');
    if (redisUrl && redisToken) {
      const userLimit = await checkRateLimitFixedWindow(
        `ratelimit:submit-feedback:${user.id}`,
        MAX_PER_HOUR,
        3600,
      );
      if (!userLimit.allowed) {
        return json(
          { success: false, error: 'rate_limited', retryAfter: userLimit.retryAfter },
          429,
          { 'Retry-After': String(userLimit.retryAfter ?? 3600) },
        );
      }

      const ip = clientIp(req);
      if (ip) {
        const ipLimit = await checkRateLimitFixedWindow(
          `ratelimit:submit-feedback-ip:${ip}`,
          IP_PER_HOUR,
          3600,
        );
        if (!ipLimit.allowed) {
          return json(
            { success: false, error: 'rate_limited', retryAfter: ipLimit.retryAfter },
            429,
            { 'Retry-After': String(ipLimit.retryAfter ?? 3600) },
          );
        }
      }
    }

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return json({ success: false, error: 'invalid_json' }, 400);
    }

    const parsed = bodySchema.safeParse(rawBody);
    if (!parsed.success) return json({ success: false, error: 'invalid_body' }, 400);

    const body = sanitizeBody(parsed.data.body);
    if (body.length < 10 || body.length > 2000 || isLowEntropy(body)) {
      return json({ success: false, error: 'invalid_body' }, 400);
    }

    const { category, rating, app_version } = parsed.data;
    const appVersion = app_version?.trim() ? app_version.trim().slice(0, 32) : null;

    // DB-side caps stay in force even if Redis is down or fail-open.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recent, error: recentError } = await supabaseAdmin
      .from('feedback')
      .select('body, created_at')
      .eq('user_id', user.id)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(MAX_PER_DAY + 1);

    if (recentError) {
      console.error('[submit-feedback] recent lookup failed:', recentError.message);
      return json({ success: false, error: 'internal_error' }, 500);
    }

    const rows = (recent ?? []) as FeedbackRow[];
    const now = Date.now();
    const hourAgo = now - 60 * 60 * 1000;
    const lastAt = rows[0] ? Date.parse(rows[0].created_at) : NaN;
    if (Number.isFinite(lastAt) && now - lastAt < MIN_GAP_SECONDS * 1000) {
      return json({ success: false, error: 'rate_limited', retryAfter: MIN_GAP_SECONDS }, 429, {
        'Retry-After': String(MIN_GAP_SECONDS),
      });
    }
    if (rows.filter((r) => Date.parse(r.created_at) >= hourAgo).length >= MAX_PER_HOUR) {
      return json({ success: false, error: 'rate_limited' }, 429);
    }
    if (rows.length >= MAX_PER_DAY) {
      return json({ success: false, error: 'rate_limited' }, 429);
    }
    if (rows.some((r) => r.body === body)) {
      return json({ success: false, error: 'duplicate' }, 409);
    }

    const { error: insertError } = await supabaseAdmin.from('feedback').insert({
      user_id: user.id,
      category,
      rating,
      body,
      app_version: appVersion,
    });
    if (insertError) {
      console.error('[submit-feedback] insert failed:', insertError.message);
      return json({ success: false, error: 'insert_failed' }, 500);
    }

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (resendKey) {
      try {
        await sendFeedbackEmail({
          apiKey: resendKey,
          category: categoryLabel(category),
          rating,
          body,
          appVersion,
          userId: user.id,
          userEmail: user.email ?? null,
        });
      } catch (err) {
        console.error(
          '[submit-feedback] email failed:',
          err instanceof Error ? err.message : 'unknown',
        );
      }
    } else {
      console.error('[submit-feedback] RESEND_API_KEY missing — stored without email');
    }

    return json({ success: true }, 200);
  } catch (err) {
    console.error('[submit-feedback] internal_error:', err instanceof Error ? err.message : 'unknown');
    return json({ success: false, error: 'internal_error' }, 500);
  }
});
