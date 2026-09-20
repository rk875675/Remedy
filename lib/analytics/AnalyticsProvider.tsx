import React, { useEffect, useRef } from 'react';
import { LogBox } from 'react-native';
import { useSegments } from 'expo-router';

import { useAuth } from '../../context/AuthContext';
import { useOnboarding } from '../../context/OnboardingContext';
import { usePremium } from '../../context/PremiumContext';
import { isDevUser } from '../entitlements';
import { completeAuthAttempt, pendingSignupMethod } from './authAttempt';
import { identify, initAnalytics, reset, setPersonProperties } from './facade';
import { useOnboardingStepTracking } from './onboardingSteps';
import { useProductUsageTracking } from './productUsage';
import { toScreenName } from './routes';

/**
 * Boots the analytics client. Mounted at the very top of the tree so the client
 * starts loading as early as possible, but it renders children immediately and
 * never blocks: events fired before the SDK binds are buffered by the facade.
 *
 * With analytics disabled this is a plain passthrough and the SDK is never
 * imported.
 */
if (__DEV__) {
  // console.error from the SDK or a stale contract warning must never open a
  // red LogBox over onboarding. Contract checks now use console.log; this is
  // the belt for anything that still slips through.
  LogBox.ignoreLogs([/\[analytics\]/]);
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void initAnalytics();
  }, []);

  return <>{children}</>;
}

/**
 * Headless. Syncs identity with auth state and tracks screens, dwell, and app
 * sessions. Must be mounted inside AuthProvider, OnboardingProvider and
 * PremiumProvider, and inside the router context.
 */
export function AnalyticsBridge() {
  const segments = useSegments();
  const screenName = toScreenName(segments as readonly string[]);
  const { retaking } = useOnboarding();

  useIdentitySync();
  useScreenTracking(screenName);
  useOnboardingStepTracking(screenName, retaking);
  return null;
}

/**
 * Keeps the analytics identity in step with Supabase auth.
 *
 * Three transitions, each behaving differently and each one load-bearing:
 *   anonymous → signed in : identify() only. No reset, so the pre-auth funnel
 *                           (onboarding, paywall, purchase) merges into the
 *                           identified person instead of being orphaned.
 *   user A → user B       : reset() first, so one account's session cannot bleed
 *                           into another on a shared device.
 *   signed in → signed out: reset().
 *
 * The `lastIdentified` ref means identify() fires on change only, not on every
 * render or token refresh.
 */
function useIdentitySync() {
  const { user } = useAuth();
  const lastIdentified = useRef<string | null>(null);

  useEffect(() => {
    const userId = user?.id ?? null;
    if (userId === lastIdentified.current) return;

    if (userId === null) {
      if (lastIdentified.current !== null) reset();
      lastIdentified.current = null;
      return;
    }

    if (lastIdentified.current !== null) reset();
    // Opaque Supabase Auth UUID only. Never email, display name, or push token —
    // see docs/ANALYTICS.md §6.1.
    // signup_method is set HERE, on identify(), not in a follow-up
    // setPersonProperties. A separate $set after identify() was landing on the
    // anonymous person (0/28 coverage on project 470505).
    const signupMethod = pendingSignupMethod();
    identify(userId, signupMethod === null ? undefined : { signup_method: signupMethod });
    lastIdentified.current = userId;
    // Strictly after identify(), so the completion lands on the identified person
    // rather than the anonymous one it started as.
    completeAuthAttempt();
    void markInternal(userId);
  }, [user?.id]);
}

/**
 * Tags developer accounts so the "Internal / Test users" cohort can exclude them.
 *
 * Until this existed, `is_internal` was only ever written by the edge functions, and only
 * as an *event* property on the handful of events they emit. A developer walking the app
 * on their own device therefore produced a full session of ordinary-looking production
 * traffic: the first device run landed 312 events, none of which the cohort excluded.
 *
 * Written as a person property, and only when true. Person-scoped means the exclusion is
 * retroactive — flagging the person removes their entire history from every insight, not
 * just the events that come after — and writing nothing for real users keeps the property
 * from becoming a per-user write on every sign-in.
 *
 * Best-effort: analytics must never break sign-in, so a failed lookup is simply dropped.
 */
async function markInternal(userId: string): Promise<void> {
  try {
    if (await isDevUser(userId)) setPersonProperties({ is_internal: true });
  } catch {
    // Ignored by design.
  }
}

/**
 * Emits `$screen` on every visit, `screen_exited` with dwell, and
 * `app_session_ended` on background. See lib/analytics/productUsage.ts.
 *
 * Deliberately not enriched with subscription_status or plan tier: those are
 * person properties set authoritatively by the server, and PostHog can already
 * break any event down by person property.
 */
function useScreenTracking(routeName: string | null) {
  const { user } = useAuth();
  const { premium, onboardingDone, hasActivePlan } = usePremium();
  const { retaking } = useOnboarding();

  useProductUsageTracking(routeName, {
    is_authenticated: user !== null,
    is_onboarded: onboardingDone === true,
    is_premium: premium === true,
    has_active_plan: hasActivePlan === true,
    is_retaking: retaking,
  });
}
