import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';
import { supabase } from './supabase';
import type { Entitlement, Profile } from '../types/database';

/**
 * Throws when the entitlement could not be READ (offline, timeout, RLS error) and
 * returns null only when the account genuinely has no entitlement row. Callers must
 * keep those two cases apart: treating an unreachable backend as "not subscribed"
 * bounces a paying subscriber onto the paywall.
 */
export async function getEntitlement(userId: string): Promise<Entitlement | null> {
  // maybeSingle, not single: `single()` treats zero rows as an error, which would be
  // indistinguishable from the network failures this function now surfaces.
  const { data, error } = await supabase
    .from('entitlements')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function isPremium(userId: string): Promise<boolean> {
  const entitlement = await getEntitlement(userId);
  if (!entitlement) return false;
  if (!entitlement.is_premium) return false;
  if (entitlement.expires_at && new Date(entitlement.expires_at).getTime() <= Date.now()) {
    return false;
  }
  // `cancelled` keeps access until expires_at (auto-renew off, period still paid).
  return entitlement.subscription_status === 'active' ||
    entitlement.subscription_status === 'trial' ||
    entitlement.subscription_status === 'dev_trial' ||
    entitlement.subscription_status === 'cancelled';
}

// Last successfully-read gate state, per user. The root guard blocks on all three
// values being non-null, so an unreachable backend has to resolve to *something* or the
// splash never dismisses. Caching the last verified answer means a flaky network keeps a
// subscriber in their program instead of throwing them onto the paywall. This can only
// ever replay a `true` that the server previously confirmed, so it is not a bypass: an
// account that was never premium has no cached `true` to fall back on.
const gateStateSchema = z
  .object({
    premium: z.boolean(),
    onboardingDone: z.boolean(),
    hasActivePlan: z.boolean(),
  })
  .strict();

export type GateState = z.infer<typeof gateStateSchema>;

function gateStateKey(userId: string): string {
  return `remedy.gateState.${userId}`;
}

export async function readCachedGateState(userId: string): Promise<GateState | null> {
  try {
    const raw = await AsyncStorage.getItem(gateStateKey(userId));
    if (!raw) return null;
    const parsed = gateStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function writeCachedGateState(userId: string, state: GateState): Promise<void> {
  try {
    await AsyncStorage.setItem(gateStateKey(userId), JSON.stringify(state));
  } catch {
    // Best-effort: losing the cache only costs us the offline fallback.
  }
}

export async function clearCachedGateState(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(gateStateKey(userId));
  } catch {
    // Ignore.
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
