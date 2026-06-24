import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3';
import { corsHeaders } from '../_shared/cors.ts';
import { checkRateLimit } from '../_shared/ratelimit.ts';
import { verifyAppleTransaction } from '../_shared/apple.ts';

// Apple JWS tokens are large; allow generous headroom.
const MAX_JWS_LEN = 16384;

const bodySchema = z
  .object({
    transactionId: z.string().min(1).max(256).optional(),
    productId: z.enum(['com.remedyapp.monthly', 'com.remedyapp.annual']).optional(),
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
      const rl = await checkRateLimit(
        redisUrl,
        redisToken,
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
    const now = new Date().toISOString();
    const expiresAt = appleResult.expiresDate
      ? new Date(appleResult.expiresDate).toISOString()
      : new Date(
          Date.now() + (verifiedProductId === 'com.remedyapp.annual' ? 365 : 30) * 24 * 60 * 60 * 1000,
        ).toISOString();

    const { data: entitlement, error: upsertError } = await supabaseAdmin
      .from('entitlements')
      .upsert(
        {
          user_id: user.id,
          is_premium: true,
          subscription_status: isTrial ? 'trial' : 'active',
          product_id: verifiedProductId,
          original_transaction_id: transactionId ?? null,
          trial_started_at: isTrial ? now : null,
          trial_ends_at: isTrial ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null,
          expires_at: expiresAt,
          updated_at: now,
        },
        { onConflict: 'user_id' },
      )
      .select()
      .single();

    if (upsertError) return json({ success: false, error: upsertError.message }, 500);

    // idempotency_key is UNIQUE — replayed verifications are deduped, not double-granted.
    await supabaseAdmin.from('billing_events').upsert(
      {
        user_id: user.id,
        event_type: isTrial ? 'trial_started' : 'subscription_started',
        product_id: verifiedProductId,
        transaction_id: transactionId ?? null,
        idempotency_key: idempotencyKey,
        metadata: { verified_at: now },
      },
      { onConflict: 'idempotency_key', ignoreDuplicates: true },
    );

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
