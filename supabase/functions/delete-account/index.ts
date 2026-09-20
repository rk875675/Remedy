import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3';
import { corsHeaders } from '../_shared/cors.ts';
import { checkRateLimitFixedWindow } from '../_shared/ratelimit.ts';
import {
  ANONYMOUS_DISTINCT_ID,
  captureServerEvent,
  erasePostHogPerson,
  planInterval,
} from '../_shared/analytics.ts';

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
      const rl = await checkRateLimitFixedWindow(
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

    // Read the churn context before the cascade removes it. Deleting while premium is the
    // most severe churn signal the product has, and it is unrecoverable a moment from now.
    const [{ data: entitlement }, { data: profile }] = await Promise.all([
      supabaseAdmin
        .from('entitlements')
        .select('subscription_status, is_premium, product_id')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabaseAdmin.from('profiles').select('is_dev').eq('id', user.id).maybeSingle(),
    ]);

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

    // Both of the next two steps run only after the delete actually succeeds, so a failed
    // attempt can never look like churn or erase a live user's analytics.

    // The churn signal is captured WITHOUT a person profile and under a constant,
    // non-identifying distinct_id. Attributing it to the user would defeat the erasure two
    // lines below: ingestion lags by minutes, so the event would land after the person was
    // removed and immediately recreate them. Keeping it person-less preserves the one thing
    // worth measuring — that a deletion happened, and what kind of user it was — while
    // retaining nothing that points back at them.
    //
    // Consequence worth knowing: deleters cannot be analysed retrospectively, because their
    // history is gone by design. Anything you want to know about them must be an event
    // property here.
    await captureServerEvent({
      distinctId: ANONYMOUS_DISTINCT_ID,
      event: 'account_deleted',
      environment: 'production',
      isInternal: profile?.is_dev ?? false,
      personProfile: 'none',
      properties: {
        was_premium: entitlement?.is_premium ?? false,
        subscription_status: entitlement?.subscription_status ?? null,
        product_id: entitlement?.product_id ?? null,
        plan_interval: planInterval(entitlement?.product_id),
      },
    });

    // Right to be forgotten: remove the person and every event ever captured for them.
    // Best-effort — the account is already gone, and failing the request now would tell the
    // user their deletion failed when it did not. A failure is logged so it can be replayed
    // by hand; this log line is the only trace that erasure is owed.
    const erasure = await erasePostHogPerson(user.id);
    if (!erasure.ok) {
      console.error(
        `[delete-account] PostHog erasure failed for ${user.id}: ${erasure.detail} — ` +
          `person data still present, manual deletion required`,
      );
    }

    return json({ success: true }, 200);
  } catch (err) {
    console.error('[delete-account] internal_error:', err);
    return json({ success: false, error: 'internal_error' }, 500);
  }
});
