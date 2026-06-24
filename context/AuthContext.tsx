import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { identifyUser, resetAnalytics } from '../lib/analytics';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
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

    if (error && error.code === 'PGRST116') {
      const { error: insertError } = await supabase.from('profiles').insert({
        id: user.id,
        display_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
        email: user.email ?? null,
      });
      return !insertError;
    }

    return !error;
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
    resetAnalytics();
    setSession(null);
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        signOut,
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
