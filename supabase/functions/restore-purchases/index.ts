import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { checkRateLimit, extractUserIdFromJwt } from '../_shared/ratelimit.ts';

// HUMAN INPUT NEEDED: Same Apple verification setup as verify-purchase.
// Re-verify the original transaction with Apple before re-granting.

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

    // Rate limiting: 3 requests per 300 seconds per user
    const jwtUserId = extractUserIdFromJwt(authHeader);
    if (jwtUserId) {
      const redisUrl = Deno.env.get('UPSTASH_REDIS_REST_URL');
      const redisToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');
      if (redisUrl && redisToken) {
        const rl = await checkRateLimit(
          redisUrl,
          redisToken,
          `ratelimit:restore-purchases:${jwtUserId}`,
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
    }

    const { userId, originalTransactionId } = await req.json();

    if (!userId || !originalTransactionId) {
      return new Response(
        JSON.stringify({ success: false, error: 'missing_fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // HUMAN INPUT NEEDED: Verify originalTransactionId with Apple App Store Server API.
    // GET https://api.storekit.itunes.apple.com/inApps/v1/transactions/{originalTransactionId}
    // Validate signed transaction, check expiration, revocation status.
    const isValid = true; // Placeholder — replace with real verification

    if (!isValid) {
      return new Response(
        JSON.stringify({ success: false, error: 'invalid_transaction' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const now = new Date().toISOString();
    const idempotencyKey = `restore_${userId}_${originalTransactionId}_${Date.now()}`;

    // HUMAN INPUT NEEDED: In production, extract productId and expiresAt from Apple's
    // transaction response rather than hardcoding.
    const { data: entitlement, error: upsertError } = await supabase
      .from('entitlements')
      .upsert(
        {
          user_id: userId,
          is_premium: true,
          subscription_status: 'active',
          original_transaction_id: originalTransactionId,
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

    await supabase.from('billing_events').upsert(
      {
        user_id: userId,
        event_type: 'restored',
        transaction_id: originalTransactionId,
        idempotency_key: idempotencyKey,
        metadata: { restored_at: now },
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
