/**
 * Isolated Supabase client for the password-recovery flow.
 *
 * Pitfall 7: Calling verifyOtp({ type: 'recovery' }) on the SHARED main client
 * establishes a persisted session mid-flow, which conflicts with any existing session
 * and leaves a stale recovery session behind if the user quits mid-reset.
 *
 * This client uses an ephemeral Map-backed storage so the recovery session is never
 * written to AsyncStorage and never persists across app restarts. After the user sets
 * their new password, call recoveryClient.auth.signOut() to drop the in-memory session.
 */

import { createClient, SupabaseClient, SupportedStorage } from '@supabase/supabase-js';

function createInMemoryStorage(): SupportedStorage {
  const store = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      store.set(key, value);
    },
    removeItem(key: string): void {
      store.delete(key);
    },
  };
}

export function createRecoveryClient(): SupabaseClient {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anonKey, {
    auth: {
      storage: createInMemoryStorage(),
      persistSession: false,
      detectSessionInUrl: false,
      autoRefreshToken: false,
    },
  });
}
