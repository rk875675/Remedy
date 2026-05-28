import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

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
      async (_event, newSession) => {
        if (_event === 'SIGNED_OUT' || _event === 'TOKEN_REFRESHED') {
          setSession(newSession);
          return;
        }
        setSession(newSession);
        if (newSession?.user) {
          await ensureProfile(newSession.user);
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
      await supabase.auth.signOut();
    } catch {
      // Force clear even if signOut API call fails (e.g. deleted user)
    }
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
