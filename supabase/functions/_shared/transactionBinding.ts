import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// One Apple subscription (originalTransactionId) → one Remedy account, enforced by the
// partial unique index from migration 023. A binding held by another account blocks the
// claim only while that account's access is live. A lapsed binding (not premium, or past
// expires_at) is released so the Apple ID owner can resubscribe on a new account — Apple
// reuses the originalTransactionId for resubscribes within the same subscription group.
// Callers must only invoke this with a transaction Apple just verified as valid.
export type BindingResult = 'ok' | 'conflict';

export async function claimTransactionBinding(
  admin: SupabaseClient,
  boundTxId: string,
  userId: string,
): Promise<BindingResult> {
  // A lookup error falls through to 'ok': the unique index still rejects a real
  // conflict at write time (see isBindingConflict).
  const { data: holder } = await admin
    .from('entitlements')
    .select('user_id, is_premium, expires_at')
    .eq('original_transaction_id', boundTxId)
    .neq('user_id', userId)
    .maybeSingle();
  if (!holder) return 'ok';

  const nowMs = Date.now();
  const holderLive =
    holder.is_premium === true &&
    (!holder.expires_at || new Date(holder.expires_at).getTime() > nowMs);
  if (holderLive) return 'conflict';

  // Re-check the lapsed condition in the UPDATE itself so a renewal webhook landing
  // between the read and this write keeps the binding on the original account.
  const nowIso = new Date(nowMs).toISOString();
  const { data: released, error: releaseError } = await admin
    .from('entitlements')
    .update({
      original_transaction_id: null,
      is_premium: false,
      subscription_status: 'expired',
      updated_at: nowIso,
    })
    .eq('user_id', holder.user_id)
    .eq('original_transaction_id', boundTxId)
    .or(`is_premium.eq.false,expires_at.lte."${nowIso}"`)
    .select('user_id');
  if (releaseError || !released || released.length === 0) return 'conflict';

  console.log('[transaction-binding] released lapsed binding', {
    from_user: holder.user_id,
    to_user: userId,
  });
  return 'ok';
}

/** Upsert rejected by the original_transaction_id unique index (concurrent claim). */
export function isBindingConflict(error: { code?: string; message?: string } | null): boolean {
  return (
    !!error &&
    error.code === '23505' &&
    (error.message ?? '').includes('original_transaction_id')
  );
}
