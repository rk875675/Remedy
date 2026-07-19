import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { isPremium, isDevUser, reverifyLapsedSubscription } from '../lib/entitlements';
import { supabase } from '../lib/supabase';

type PremiumContextType = {
  premium: boolean | null;
  // Mirrors the root guard's onboardingDone / hasActivePlan so building-plan's
  // refreshPremium() calls update all three atomically, preventing the stale-state
  // loop where the guard re-routes back to building-plan after a successful run.
  onboardingDone: boolean | null;
  hasActivePlan: boolean | null;
  refreshPremium: () => Promise<void>;
};

const PremiumContext = createContext<PremiumContextType>({
  premium: null,
  onboardingDone: null,
  hasActivePlan: null,
  refreshPremium: async () => {},
});

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const [premium, setPremium] = useState<boolean | null>(null);
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const [hasActivePlan, setHasActivePlan] = useState<boolean | null>(null);

  const refreshPremium = useCallback(async () => {
    if (!session) {
      setPremium(null);
      setOnboardingDone(null);
      setHasActivePlan(null);
      return;
    }
    // An Apple auto-renewal doesn't update our DB (no ASSN webhook); if the stored
    // expires_at has lapsed, re-verify with StoreKit first so an active subscriber
    // isn't treated as non-premium. No-op unless the entitlement actually lapsed.
    await reverifyLapsedSubscription(session.user.id);
    const [prem, dev, oaRes, upRes] = await Promise.all([
      isPremium(session.user.id),
      isDevUser(session.user.id),
      // A row missing `equipment` is incomplete (half-finished funnel) and cannot
      // assign a program — treat it as not-onboarded.
      supabase
        .from('onboarding_answers')
        .select('id, equipment')
        .eq('user_id', session.user.id)
        .maybeSingle(),
      supabase
        .from('user_programs')
        .select('active_plan_id')
        .eq('user_id', session.user.id)
        .maybeSingle(),
    ]);
    setPremium(prem || dev);
    setOnboardingDone(!!oaRes.data?.equipment);
    setHasActivePlan(!!upRes.data?.active_plan_id);
  }, [session]);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      setPremium(null);
      setOnboardingDone(null);
      setHasActivePlan(null);
      return;
    }
    refreshPremium();
  }, [session, loading, refreshPremium]);

  return (
    <PremiumContext.Provider value={{ premium, onboardingDone, hasActivePlan, refreshPremium }}>
      {children}
    </PremiumContext.Provider>
  );
}

export function usePremium() {
  return useContext(PremiumContext);
}
