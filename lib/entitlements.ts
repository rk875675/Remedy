import { supabase } from './supabase';
import { restoreRemedyTransaction } from './iap';
import type { Entitlement, Profile } from '../types/database';

export async function getEntitlement(userId: string): Promise<Entitlement | null> {
  const { data } = await supabase
    .from('entitlements')
    .select('*')
    .eq('user_id', userId)
    .single();

  return data;
}

export async function isPremium(userId: string): Promise<boolean> {
  const entitlement = await getEntitlement(userId);
  if (!entitlement) return false;

  if (!entitlement.is_premium) return false;

  if (
    entitlement.expires_at &&
    new Date(entitlement.expires_at) < new Date()
  ) {
    return false;
  }

  return entitlement.subscription_status === 'active' ||
    entitlement.subscription_status === 'trial' ||
    entitlement.subscription_status === 'dev_trial';
}

// Apple auto-renewals never reach our backend (no App Store Server Notifications
// handler yet), so a paying subscriber's expires_at goes stale after the first billing
// period and isPremium() would treat them as lapsed. When the stored entitlement has an
// Apple-backed subscription whose expires_at has passed, silently re-verify against
// StoreKit via restore-purchases so an active renewal refreshes the row. No-op on
// non-iOS / Expo Go / no transaction. At most one attempt per user per app session so a
// genuinely expired subscription doesn't hammer the rate-limited endpoint.
const reverifyAttempted = new Set<string>();

export async function reverifyLapsedSubscription(userId: string): Promise<void> {
  if (reverifyAttempted.has(userId)) return;

  const entitlement = await getEntitlement(userId);
  if (!entitlement?.is_premium || !entitlement.expires_at) return;
  // Only StoreKit-backed subscriptions can auto-renew; dev trials have no transaction.
  if (
    entitlement.subscription_status !== 'active' &&
    entitlement.subscription_status !== 'trial'
  ) {
    return;
  }
  if (new Date(entitlement.expires_at) >= new Date()) return;

  reverifyAttempted.add(userId);
  const tx = await restoreRemedyTransaction();
  if (!tx) return;
  try {
    await supabase.functions.invoke('restore-purchases', {
      body: {
        originalTransactionId: tx.originalTransactionId,
        signedTransaction: tx.jws,
      },
      // Stable key: billing_events dedupes the 'restored' event while the entitlement
      // upsert (which refreshes expires_at) still runs on the server.
      headers: { 'Idempotency-Key': `reverify_${userId}_${tx.originalTransactionId}` },
    });
  } catch {
    // Best-effort: the next launch (or manual Restore Purchases) retries.
  }
}

export async function isDevUser(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('is_dev')
    .eq('id', userId)
    .single();

  return (data as Pick<Profile, 'is_dev'> | null)?.is_dev === true;
}
