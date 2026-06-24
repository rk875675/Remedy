import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3';
import { corsHeaders } from '../_shared/cors.ts';
import { checkRateLimit } from '../_shared/ratelimit.ts';
import { verifyAppleTransaction } from '../_shared/apple.ts';

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
      const rl = await checkRateLimit(
        redisUrl,
        redisToken,
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
          subscription_status: 'active',
          product_id: verifiedProductId,
          original_transaction_id: originalTransactionId ?? null,
          expires_at: expiresAt,
          updated_at: now,
        },
        { onConflict: 'user_id' },
      )
      .select()
      .single();

    if (upsertError) return json({ success: false, error: upsertError.message }, 500);

    await supabaseAdmin.from('billing_events').upsert(
      {
        user_id: user.id,
        event_type: 'restored',
        product_id: verifiedProductId,
        transaction_id: originalTransactionId ?? null,
        idempotency_key: idempotencyKey,
        metadata: { restored_at: now },
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
