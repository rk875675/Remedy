import { supabase } from './supabase';
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

export async function isDevUser(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('is_dev')
    .eq('id', userId)
    .single();

  return (data as Pick<Profile, 'is_dev'> | null)?.is_dev === true;
}
