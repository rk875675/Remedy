import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3';
import { corsHeaders } from '../_shared/cors.ts';
import { checkRateLimitFixedWindow } from '../_shared/ratelimit.ts';
import { verifyAppleTransaction } from '../_shared/apple.ts';
import { captureServerEvent, planInterval } from '../_shared/analytics.ts';

const MAX_JWS_LEN = 16384;

const bodySchema = z
  .object({
    originalTransactionId: z.string().min(1).max(256).optional(),
    signedTransaction: z.string().max(MAX_JWS_LEN).nullable().optional(),
  })
  .strict()
  .refine((b) => !!b.originalTransactionId || !!b.signedTransaction, {
    message: 'originalTransactionId_or_signedTransaction_required',
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

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return json({ success: false, error: 'invalid_auth' }, 401);

    // Rate limiting: 3 requests per 300 seconds per user.
    const redisUrl = Deno.env.get('UPSTASH_REDIS_REST_URL');
    const redisToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');
    if (redisUrl && redisToken) {
      const rl = await checkRateLimitFixedWindow(
        `ratelimit:restore-purchases:${user.id}`,
        3,
        300,
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
    const { originalTransactionId, signedTransaction } = parsed.data;

    const appleResult = await verifyAppleTransaction(
      originalTransactionId ?? '',
      signedTransaction ?? null,
    );
    if (!appleResult.valid || !appleResult.productId) {
      return json({ success: false, error: appleResult.error ?? 'no_active_subscription' }, 400);
    }

    // Product + expiry come from the verified transaction, not the client.
    const verifiedProductId = appleResult.productId;

    // Anti-fraud: one Apple subscription → one account. Use Apple's verified
    // originalTransactionId (fallback to the client value) and refuse to restore onto a
    // second account.
    const boundTxId = appleResult.originalTransactionId ?? originalTransactionId ?? null;
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

    const [{ data: priorEntitlement }, { data: profile }] = await Promise.all([
      supabaseAdmin
        .from('entitlements')
        .select('subscription_status, source, is_premium, expires_at')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabaseAdmin.from('profiles').select('is_dev').eq('id', user.id).maybeSingle(),
    ]);
    const priorStatus = priorEntitlement?.subscription_status ?? null;

    // Promo preservation: Restore must never evict a still-live backend promo
    // (null expires_at = lifetime). A leftover paid or trial receipt on this
    // Apple ID would otherwise overwrite months (or lifetime) and then expire,
    // leaving the user with nothing. A fresh paywall purchase still converts
    // via verify-purchase. Lapsed Apple receipts never reach here.
    const promoStillLive =
      priorEntitlement?.source === 'promo' &&
      priorEntitlement.is_premium === true &&
      (!priorEntitlement.expires_at ||
        new Date(priorEntitlement.expires_at).getTime() > Date.now());
    if (promoStillLive) {
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
          subscription_status: 'active',
          product_id: verifiedProductId,
          original_transaction_id: boundTxId,
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

    // See verify-purchase: the unique violation on idempotency_key is the dedupe signal,
    // because service_role cannot read this table back (migration 017 grants INSERT only).
    const { error: billingInsertError } = await supabaseAdmin.from('billing_events').insert({
      user_id: user.id,
      event_type: 'restored',
      product_id: verifiedProductId,
      transaction_id: originalTransactionId ?? null,
      idempotency_key: idempotencyKey,
      metadata: { restored_at: now },
    });
    if (billingInsertError && billingInsertError.code !== '23505') {
      console.error('[restore-purchases] billing_events insert failed:', billingInsertError);
    }

    // A restore is deliberately NOT revenue — the money was already booked by
    // verify-purchase on the original device. Counting it again would inflate revenue every
    // time a user reinstalls. This event exists to measure the recovery path itself:
    // `granted_access` separates real rescues (a user who had lost premium) from no-op
    // taps by someone who already had it.
    if (!billingInsertError) {
      const isInternal = (appleResult.isSandbox ?? false) || (profile?.is_dev ?? false);
      await captureServerEvent({
        distinctId: user.id,
        event: 'subscription_restored',
        environment: appleResult.isSandbox ? 'sandbox' : 'production',
        isInternal,
        properties: {
          product_id: verifiedProductId,
          plan_interval: planInterval(verifiedProductId),
          original_transaction_id: boundTxId,
          prior_status: priorStatus,
          granted_access: priorStatus !== 'active',
          expires_at: expiresAt,
        },
        personProperties: {
          is_premium: true,
          subscription_status: 'active',
          plan_interval: planInterval(verifiedProductId),
          product_id: verifiedProductId,
          subscription_expires_at: expiresAt,
          is_internal: isInternal,
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
