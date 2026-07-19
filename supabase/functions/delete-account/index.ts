import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3';
import { corsHeaders } from '../_shared/cors.ts';
import { checkRateLimit } from '../_shared/ratelimit.ts';

const bodySchema = z
  .object({
    confirm: z.literal(true),
  })
  .strict();

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ success: false, error: 'missing_auth' }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Server-authoritative identity: derive the user from the verified JWT — never trust
    // a client-supplied userId (that would let any authed user delete anyone's account).
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return json({ success: false, error: 'invalid_auth' }, 401);

    // Rate limiting: 3 attempts per hour per user. Deletion is rare and irreversible —
    // a tight limit blocks retry storms / abuse without ever hurting a genuine user.
    const redisUrl = Deno.env.get('UPSTASH_REDIS_REST_URL');
    const redisToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');
    if (redisUrl && redisToken) {
      const rl = await checkRateLimit(
        redisUrl,
        redisToken,
        `ratelimit:delete-account:${user.id}`,
        3,
        3600,
      );
      if (!rl.allowed) {
        return new Response(
          JSON.stringify({ success: false, error: 'rate_limited', retryAfter: rl.retryAfter }),
          {
            status: 429,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
              'Retry-After': String(rl.retryAfter),
            },
          },
        );
      }
    }

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return json({ success: false, error: 'invalid_json' }, 400);
    }

    // Requiring an explicit literal `confirm: true` (rather than an empty/GET-style
    // call) means a bug that fires this request unintentionally (retry logic, a stray
    // button re-render, a replayed request) can't silently delete an account.
    const parsed = bodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return json({ success: false, error: 'invalid_body' }, 400);
    }

    // Audit trail lives in the Edge Function invocation logs (Supabase dashboard),
    // keyed by user id and timestamp. Deliberately not written to a DB table: any table
    // surviving the user's row would either dangle with no FK (an orphaned identifier)
    // or defeat the deletion's purpose by keeping the user's id around indefinitely.
    console.log(`[delete-account] deleting user ${user.id} at ${new Date().toISOString()}`);

    // Hard-delete the auth user. profiles.id → auth.users(id) ON DELETE CASCADE
    // (migration 001), and every user-owned table cascades from profiles (onboarding
    // answers, user_programs + plans/sessions, session_completions, pain_checkins,
    // entitlements, billing_events — migrations 001, 013). One call removes all of it.
    // This does NOT cancel an active Apple IAP subscription — Apple retains the billing
    // relationship independently of the account, so the client must tell the user to
    // cancel via Settings → Apple ID → Subscriptions (Apple guideline 5.1.1(v)).
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error('[delete-account] deleteUser failed:', deleteError.message);
      return json({ success: false, error: 'delete_failed' }, 500);
    }

    return json({ success: true }, 200);
  } catch (err) {
    console.error('[delete-account] internal_error:', err);
    return json({ success: false, error: 'internal_error' }, 500);
  }
});
