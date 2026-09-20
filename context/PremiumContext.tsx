import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './AuthContext';
import {
  isPremium,
  readCachedGateState,
  writeCachedGateState,
} from '../lib/entitlements';
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

// The root guard blocks while any of premium / onboardingDone / hasActivePlan is null,
// so a request that never settles keeps the splash up forever. Rejecting on a deadline
// routes into the catch below, which replays the last verified state instead.
const GATE_READ_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('gate_read_timeout')), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

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
    const userId = session.user.id;
    try {
      const [prem, oaRes, upRes] = await withTimeout(Promise.all([
        isPremium(userId),
        // A row missing `equipment` is incomplete (half-finished funnel) and cannot
        // assign a program — treat it as not-onboarded.
        supabase
          .from('onboarding_answers')
          .select('id, equipment')
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('user_programs')
          .select('active_plan_id')
          .eq('user_id', userId)
          .maybeSingle(),
      ]), GATE_READ_TIMEOUT_MS);
      // A failed read must not masquerade as "no answers" / "no plan" — that routes an
      // onboarded user back through the quiz or into building-plan.
      if (oaRes.error) throw oaRes.error;
      if (upRes.error) throw upRes.error;

      let activePlanExists = false;
      if (upRes.data?.active_plan_id) {
        const { data: activePlan, error: planError } = await withTimeout(
          supabase
            .from('user_program_plans')
            .select('id')
            .eq('id', upRes.data.active_plan_id)
            .eq('status', 'active')
            .maybeSingle(),
          GATE_READ_TIMEOUT_MS,
        );
        if (planError) throw planError;
        activePlanExists = !!activePlan;
      }
      const next = {
        // Entitlement only — is_dev must not bypass the paywall. A cancelled/expired
        // trial on a founder device would otherwise keep the full app unlocked.
        premium: prem,
        onboardingDone: !!oaRes.data?.equipment,
        hasActivePlan: activePlanExists,
      };
      setPremium(next.premium);
      setOnboardingDone(next.onboardingDone);
      setHasActivePlan(next.hasActivePlan);
      void writeCachedGateState(userId, next);
    } catch {
      // Backend unreachable. The root guard blocks while any of these is null, so we
      // must still resolve to booleans or the splash hangs forever. Replay the last
      // verified state: downgrading here would drop a paying subscriber onto the
      // paywall (and drop an onboarded user back into the funnel) on a dropped request
      // — including on every background→foreground refresh.
      const cached = await readCachedGateState(userId);
      setPremium((prev) => prev ?? cached?.premium ?? false);
      setOnboardingDone((prev) => prev ?? cached?.onboardingDone ?? false);
      setHasActivePlan((prev) => prev ?? cached?.hasActivePlan ?? false);
    }
  }, [session]);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      setPremium(null);
      setOnboardingDone(null);
      setHasActivePlan(null);
      return;
    }
    void refreshPremium();
  }, [session, loading, refreshPremium]);

  // Cancel / expiry happens in Settings. Re-read entitlement when they come back.
  useEffect(() => {
    if (!session) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshPremium();
    });
    return () => sub.remove();
  }, [session, refreshPremium]);

  return (
    <PremiumContext.Provider value={{ premium, onboardingDone, hasActivePlan, refreshPremium }}>
      {children}
    </PremiumContext.Provider>
  );
}

export function usePremium() {
  return useContext(PremiumContext);
}
