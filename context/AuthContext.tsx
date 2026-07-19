import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { identifyUser, resetAnalytics } from '../lib/analytics';
import { clearPendingPurchase } from '../lib/pendingPurchase';

export type DeleteAccountError =
  | 'missing_auth'
  | 'invalid_auth'
  | 'rate_limited'
  | 'delete_failed'
  | 'request_failed';

export type DeleteAccountResult =
  | { success: true }
  | { success: false; error: DeleteAccountError };

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<DeleteAccountResult>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
  deleteAccount: async () => ({ success: false, error: 'request_failed' }),
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: currentSession } }) => {
      if (currentSession?.user) {
        const valid = await validateSession(currentSession.user);
        if (valid) {
          setSession(currentSession);
          await ensureProfile(currentSession.user);
        } else {
          await supabase.auth.signOut();
          setSession(null);
        }
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        // The initial session is handled by the getSession() call above; acting on it
        // here too would double-fire profile creation/identify.
        if (event === 'INITIAL_SESSION') return;

        setSession(newSession);
        if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') return;

        // Never await heavy work (profile/analytics) inside this callback — it can stall
        // the OAuth code exchange (supabase-js#1429). Defer it to the next tick.
        if (newSession?.user) {
          const signedInUser = newSession.user;
          setTimeout(() => {
            void ensureProfile(signedInUser);
            identifyUser(signedInUser.id);
          }, 0);
        }
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  async function validateSession(user: User): Promise<boolean> {
    const { error } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single();

    if (!error) return true;

    if (error.code === 'PGRST116') {
      // Row genuinely missing (handle_new_user trigger failed, or the row was
      // deleted) — repair it now so downstream FK-dependent writes don't silently
      // fail. Requires the profiles_insert_own RLS policy (migration 033).
      const { error: insertError } = await supabase.from('profiles').insert({
        id: user.id,
        display_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
        email: user.email ?? null,
      });
      return !insertError;
    }

    // Any other error (network blip, timeout, transient 5xx) is not proof the
    // session/account is invalid — signing the user out here would kill a
    // perfectly good session over a flaky connection. Fail open.
    return true;
  }

  async function ensureProfile(user: User) {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single();

    if (!data) {
      await supabase.from('profiles').insert({
        id: user.id,
        display_name:
          user.user_metadata?.full_name ??
          user.user_metadata?.name ??
          null,
        email: user.email ?? null,
      });
    }
  }

  async function signOut() {
    try {
      // Local scope: clear the session immediately without waiting on a network
      // round-trip to revoke the refresh token (that lag is what users feel). Safe
      // because all data is gated by RLS on user_id.
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // Force clear even if signOut API call fails (e.g. deleted user)
    }
    // The stashed paywall transaction is device-scoped. Left behind, it would be
    // verified onto the NEXT account signed in on this device, granting them premium
    // against this user's Apple subscription. The owner can always recover their
    // entitlement via Restore Purchases.
    await clearPendingPurchase();
    resetAnalytics();
    setSession(null);
  }

  async function deleteAccount(): Promise<DeleteAccountResult> {
    // Server-side deletion first (hard-deletes the auth user + every cascaded row via
    // the delete-account edge function) — only clear local state once that succeeds, so
    // a network failure can't leave the app thinking the account is gone when it isn't.
    try {
      const { data, error } = await supabase.functions.invoke<{
        success: boolean;
        error?: DeleteAccountError;
      }>('delete-account', { body: { confirm: true } });

      if (error || !data?.success) {
        return { success: false, error: data?.error ?? 'request_failed' };
      }
    } catch {
      return { success: false, error: 'request_failed' };
    }

    try {
      // Local scope only: the account no longer exists server-side, so there is no
      // refresh token left to revoke — just drop the cached session.
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // Ignore — local state is cleared below regardless.
    }
    await clearPendingPurchase();
    resetAnalytics();
    setSession(null);
    return { success: true };
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        signOut,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
