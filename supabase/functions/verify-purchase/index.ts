import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3';
import { corsHeaders } from '../_shared/cors.ts';
import { checkRateLimitFixedWindow } from '../_shared/ratelimit.ts';
import { verifyAppleTransaction } from '../_shared/apple.ts';
import { captureServerEvent, planInterval, revenueFields } from '../_shared/analytics.ts';

// Apple JWS tokens are large; allow generous headroom.
const MAX_JWS_LEN = 16384;

const bodySchema = z
  .object({
    transactionId: z.string().min(1).max(256).optional(),
    productId: z
      .enum([
        'com.remedyapp.weekly',
        'com.remedyapp.monthly',
        'com.remedyapp.annual',
        'com.remedyapp.weekly.no.trial',
        'com.remedyapp.monthly.no.trial',
        'com.remedyapp.annual.no.trial',
      ])
      .optional(),
    signedTransaction: z.string().max(MAX_JWS_LEN).nullable().optional(),
  })
  .strict()
  .refine((b) => !!b.transactionId || !!b.signedTransaction, {
    message: 'transactionId_or_signedTransaction_required',
  });

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

    const idempotencyKey = req.headers.get('Idempotency-Key');
    if (!idempotencyKey) return json({ success: false, error: 'idempotency_key_required' }, 400);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Server-authoritative identity: derive the user from the verified JWT — never trust
    // a client-supplied userId (that would let any authed user grant premium to anyone).
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return json({ success: false, error: 'invalid_auth' }, 401);

    // Rate limiting: 5 requests per 60 seconds per user.
    const redisUrl = Deno.env.get('UPSTASH_REDIS_REST_URL');
    const redisToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');
    if (redisUrl && redisToken) {
      const rl = await checkRateLimitFixedWindow(
        `ratelimit:verify-purchase:${user.id}`,
        5,
        60,
      );
      if (!rl.allowed) {
        return new Response(
          JSON.stringify({ error: 'rate_limited', retryAfter: rl.retryAfter }),
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

    const parsed = bodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return json({ success: false, error: 'invalid_body' }, 400);
    }
    const { transactionId, signedTransaction } = parsed.data;

    const appleResult = await verifyAppleTransaction(
      transactionId ?? '',
      signedTransaction ?? null,
    );
    if (!appleResult.valid || !appleResult.productId) {
      return json({ success: false, error: appleResult.error ?? 'invalid_receipt' }, 400);
    }

    // Use the verified transaction's product + expiry — never the client's claim.
    const verifiedProductId = appleResult.productId;
    const isTrial = appleResult.inTrialPeriod ?? false;

    // Anti-fraud: bind one Apple subscription to one account. Prefer Apple's verified
    // originalTransactionId; fall back to the client transactionId only if Apple didn't
    // return one. Reject if this subscription is already linked to a different user so a
    // shared signedTransaction can't unlock premium on multiple accounts.
    const boundTxId = appleResult.originalTransactionId ?? transactionId ?? null;
    if (boundTxId) {
      const { data: conflict } = await supabaseAdmin
        .from('entitlements')
        .select('user_id')
        .eq('original_transaction_id', boundTxId)
        .neq('user_id', user.id)
        .maybeSingle();
      if (conflict) {
        return json({ success: false, error: 'transaction_already_linked' }, 409);
      }
    }

    const now = new Date().toISOString();
    const expiresAt = appleResult.expiresDate
      ? new Date(appleResult.expiresDate).toISOString()
      : new Date(
          Date.now() +
            (verifiedProductId.startsWith('com.remedyapp.annual')
              ? 365
              : verifiedProductId.startsWith('com.remedyapp.weekly')
                ? 7
                : 30) *
              24 *
              60 *
              60 *
              1000,
        ).toISOString();

    // Read the state we are about to overwrite. Analytics must fire on a real state
    // *transition*, not on message receipt: StoreKit re-delivers unfinished transactions
    // on every launch, so a naive capture here would report the same subscription as new
    // revenue over and over. `is_dev` rides along to mark internal traffic.
    const [{ data: priorEntitlement }, { data: profile }] = await Promise.all([
      supabaseAdmin
        .from('entitlements')
        .select('subscription_status, source, is_premium, expires_at')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabaseAdmin.from('profiles').select('is_dev').eq('id', user.id).maybeSingle(),
    ]);
    const priorStatus = priorEntitlement?.subscription_status ?? null;

    // Promo preservation: a still-live backend promo grant (null expires_at =
    // lifetime) must never be evicted by a leftover Apple TRIAL. A paid Apple
    // subscription falls through and overwrites — that flip is "converted to
    // paying". Expired Apple receipts never reach here (verification rejects them).
    const promoStillLive =
      priorEntitlement?.source === 'promo' &&
      priorEntitlement.is_premium === true &&
      (!priorEntitlement.expires_at ||
        new Date(priorEntitlement.expires_at).getTime() > Date.now());
    if (promoStillLive && isTrial) {
      return json(
        {
          success: true,
          entitlement: {
            is_premium: true,
            subscription_status: priorEntitlement!.subscription_status,
            expires_at: priorEntitlement!.expires_at,
          },
        },
        200,
      );
    }

    const { data: entitlement, error: upsertError } = await supabaseAdmin
      .from('entitlements')
      .upsert(
        {
          user_id: user.id,
          is_premium: true,
          subscription_status: isTrial ? 'trial' : 'active',
          product_id: verifiedProductId,
          original_transaction_id: boundTxId,
          trial_started_at: isTrial ? now : null,
          trial_ends_at: isTrial ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null,
          expires_at: expiresAt,
          is_sandbox: appleResult.isSandbox ?? false,
          source: 'apple',
          updated_at: now,
        },
        { onConflict: 'user_id' },
      )
      .select()
      .single();

    if (upsertError) return json({ success: false, error: upsertError.message }, 500);

    // idempotency_key is UNIQUE — replayed verifications are deduped, not double-granted.
    // A plain insert rather than an ignore-duplicates upsert, because the rejection is the
    // signal: whoever inserts the row is, atomically, the only caller that may report this
    // purchase. Reading the row back instead would need SELECT on billing_events, which
    // service_role deliberately does not have (migration 017 grants INSERT only).
    const { error: billingInsertError } = await supabaseAdmin.from('billing_events').insert({
      user_id: user.id,
      event_type: isTrial ? 'trial_started' : 'subscription_started',
      product_id: verifiedProductId,
      transaction_id: transactionId ?? null,
      idempotency_key: idempotencyKey,
      metadata: { verified_at: now },
    });

    // 23505 = unique_violation, i.e. a replay. Any other error is unexpected: log it, and
    // do not report, since we can no longer prove this is the first delivery.
    if (billingInsertError && billingInsertError.code !== '23505') {
      console.error('[verify-purchase] billing_events insert failed:', billingInsertError);
    }

    // Two independent guards, because they catch different duplicates: the billing_events
    // insert catches an exact replay of one request, while the status comparison catches a
    // fresh request for a subscription we already knew about.
    const isFirstDelivery = !billingInsertError;
    const newStatus = isTrial ? 'trial' : 'active';
    const isStateTransition = priorStatus !== newStatus;

    if (isFirstDelivery && isStateTransition) {
      const isTrialConversion = priorStatus === 'trial' && newStatus === 'active';
      // Trials are not revenue. Attaching a price to trial_started would book money that
      // may never arrive; the conversion shows up later as subscription_started.
      const revenue = isTrial
        ? null
        : revenueFields(verifiedProductId, appleResult.priceMilliunits, appleResult.currency);

      await captureServerEvent({
        distinctId: user.id,
        event: isTrial ? 'trial_started' : 'subscription_started',
        environment: appleResult.isSandbox ? 'sandbox' : 'production',
        isInternal: (appleResult.isSandbox ?? false) || (profile?.is_dev ?? false),
        properties: {
          product_id: verifiedProductId,
          plan_interval: planInterval(verifiedProductId),
          original_transaction_id: boundTxId,
          is_trial_conversion: isTrialConversion,
          prior_status: priorStatus,
          expires_at: expiresAt,
          revenue: revenue?.revenue,
          currency: revenue?.currency,
          revenue_source: revenue?.revenue_source,
        },
        personProperties: {
          is_premium: true,
          subscription_status: newStatus,
          plan_interval: planInterval(verifiedProductId),
          product_id: verifiedProductId,
          subscription_expires_at: expiresAt,
          is_internal: (appleResult.isSandbox ?? false) || (profile?.is_dev ?? false),
        },
        personPropertiesSetOnce: {
          first_purchase_at: now,
          first_product_id: verifiedProductId,
        },
      });
    }

    return json(
      {
        success: true,
        entitlement: {
          is_premium: entitlement.is_premium,
          subscription_status: entitlement.subscription_status,
          expires_at: entitlement.expires_at,
        },
      },
      200,
    );
  } catch {
    return json({ success: false, error: 'internal_error' }, 500);
  }
});
