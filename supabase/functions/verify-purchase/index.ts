import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { checkRateLimit, extractUserIdFromJwt } from '../_shared/ratelimit.ts';

// HUMAN INPUT NEEDED: Apple verification endpoint
// StoreKit 2 uses the App Store Server API (api.storekit.itunes.apple.com)
// Legacy uses verifyReceipt (buy.itunes.apple.com / sandbox.itunes.apple.com)
// Configure APPLE_SHARED_SECRET and APPLE_ISSUER_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY
// in Supabase secrets depending on which approach you use.

const APPLE_VERIFY_URL = 'https://api.storekit.itunes.apple.com/inApps/v1/transactions';
const APPLE_SANDBOX_URL = 'https://api.storekit-sandbox.itunes.apple.com/inApps/v1/transactions';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'missing_auth' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Rate limiting: 5 requests per 60 seconds per user
    const jwtUserId = extractUserIdFromJwt(authHeader);
    if (jwtUserId) {
      const redisUrl = Deno.env.get('UPSTASH_REDIS_REST_URL');
      const redisToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');
      if (redisUrl && redisToken) {
        const rl = await checkRateLimit(
          redisUrl,
          redisToken,
          `ratelimit:verify-purchase:${jwtUserId}`,
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
    }

    const { userId, transactionId, productId, idempotencyKey } = await req.json();

    if (!userId || !transactionId || !productId || !idempotencyKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'missing_fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // HUMAN INPUT NEEDED: Replace with actual Apple StoreKit 2 / App Store Server API verification.
    // This requires generating a signed JWT using your App Store Connect API key
    // (APPLE_ISSUER_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY set via `supabase secrets set`).
    // For now, we trust the transaction and grant entitlement.
    // In production, call:
    //   GET ${APPLE_VERIFY_URL}/${transactionId}
    //   with Authorization: Bearer <signed-jwt>
    // and validate the signed transaction response.

    const isValid = true; // Placeholder — replace with real verification

    if (!isValid) {
      return new Response(
        JSON.stringify({ success: false, error: 'invalid_receipt' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const isTrial = false; // HUMAN INPUT NEEDED: determine from Apple transaction info
    const now = new Date().toISOString();
    const expiresAt = new Date(
      Date.now() + (productId === 'com.remedyapp.annual' ? 365 : 30) * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data: entitlement, error: upsertError } = await supabase
      .from('entitlements')
      .upsert(
        {
          user_id: userId,
          is_premium: true,
          subscription_status: isTrial ? 'trial' : 'active',
          product_id: productId,
          original_transaction_id: transactionId,
          trial_started_at: isTrial ? now : null,
          trial_ends_at: isTrial ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null,
          expires_at: expiresAt,
          updated_at: now,
        },
        { onConflict: 'user_id' },
      )
      .select()
      .single();

    if (upsertError) {
      return new Response(
        JSON.stringify({ success: false, error: upsertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Insert billing event — idempotency_key is UNIQUE, duplicates are ignored
    await supabase.from('billing_events').upsert(
      {
        user_id: userId,
        event_type: isTrial ? 'trial_started' : 'subscription_started',
        product_id: productId,
        transaction_id: transactionId,
        idempotency_key: idempotencyKey,
        metadata: { verified_at: now },
      },
      { onConflict: 'idempotency_key', ignoreDuplicates: true },
    );

    return new Response(
      JSON.stringify({
        success: true,
        entitlement: {
          is_premium: entitlement.is_premium,
          subscription_status: entitlement.subscription_status,
          expires_at: entitlement.expires_at,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: 'internal_error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
