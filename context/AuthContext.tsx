import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { clearPendingPurchase } from '../lib/pendingPurchase';
import { clearPendingPromo } from '../lib/pendingPromo';
import { clearCachedGateState } from '../lib/entitlements';
import { flushLegalAcceptances } from '../lib/legalAcceptance';
import { clearRememberedDisplayName } from '../lib/greeting';

// Upper bound on the initial session restore before the app stops blocking on it. Long
// enough that a slow-but-working network still restores the session before the splash
// clears; short enough that a dead network doesn't look like a frozen app.
const AUTH_BOOTSTRAP_TIMEOUT_MS = 8000;

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
    // `loading` gates SplashOverlay, and nothing else can clear it. The previous
    // getSession().then(...) had no catch and awaited two network calls inside the
    // callback, so a rejection or a hang anywhere in here left the app on the splash
    // screen permanently with no retry. Settle exactly once, always, and cap the wait.
    let settled = false;
    const finishBootstrap = () => {
      if (settled) return;
      settled = true;
      setLoading(false);
    };
    // An unreachable backend should land on the signed-out flow, not a frozen splash.
    // onAuthStateChange still corrects the session once connectivity returns.
    const watchdog = setTimeout(finishBootstrap, AUTH_BOOTSTRAP_TIMEOUT_MS);

    void (async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession?.user) {
          const valid = await validateSession(currentSession.user);
          if (valid) {
            setSession(currentSession);
            await ensureProfile(currentSession.user);
            // Any consent recorded while signed out (safety gate) lands on this user.
            void flushLegalAcceptances(currentSession.user.id).catch(() => {});
          } else {
            await supabase.auth.signOut();
            setSession(null);
          }
        }
      } catch {
        // Keep the stored session as-is rather than signing the user out on a transient
        // failure; the guard treats "no session yet" as signed-out and self-corrects.
      } finally {
        clearTimeout(watchdog);
        finishBootstrap();
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        // The initial session is handled by the getSession() call above; acting on it
        // here too would double-fire profile creation/identify.
        if (event === 'INITIAL_SESSION') return;

        setSession(newSession);
        if (event === 'SIGNED_OUT') {
          clearRememberedDisplayName();
          return;
        }
        if (event === 'TOKEN_REFRESHED') return;

        // Never await heavy work inside this callback — it can stall the OAuth code
        // exchange (supabase-js#1429). Defer it to the next tick.
        // Analytics identity is not set here: AnalyticsBridge owns it and reacts to
        // the same session change, so identify/reset stay in one place.
        if (newSession?.user) {
          const signedInUser = newSession.user;
          setTimeout(() => {
            void ensureProfile(signedInUser);
            // Attach pre-signup consent records (safety gate) to the account.
            void flushLegalAcceptances(signedInUser.id).catch(() => {});
          }, 0);
        }
      },
    );

    return () => {
      clearTimeout(watchdog);
      subscription.unsubscribe();
    };
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
    // Captured before the session is dropped — the cached gate state is keyed by user id.
    const signedOutUserId = session?.user.id ?? null;
    try {
      // Local scope: clear the session immediately without waiting on a network
      // round-trip to revoke the refresh token (that lag is what users feel). Safe
      // because all data is gated by RLS on user_id.
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // Force clear even if signOut API call fails (e.g. deleted user)
    }
    // The cached premium/onboarding/plan answer is only a fallback for a failed read, but
    // it should not outlive the session that earned it: a user who signs back in after
    // cancelling would otherwise be handed their old `premium: true` for as long as the
    // first read keeps failing.
    if (signedOutUserId) await clearCachedGateState(signedOutUserId);
    // The stashed paywall transaction is device-scoped. Left behind, it would be
    // verified onto the NEXT account signed in on this device, granting them premium
    // against this user's Apple subscription. The owner can always recover their
    // entitlement via Restore Purchases.
    await clearPendingPurchase();
    // Same leak for a stashed promo code: left behind, the NEXT account on this
    // device would redeem it (burning the slot on the wrong user).
    await clearPendingPromo();
    // AnalyticsBridge resets analytics identity off the session change below.
    setSession(null);
  }

  async function deleteAccount(): Promise<DeleteAccountResult> {
    const deletedUserId = session?.user.id ?? null;
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
    if (deletedUserId) await clearCachedGateState(deletedUserId);
    // AnalyticsBridge resets analytics identity off the session change below.
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
