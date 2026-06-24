import React, { useEffect, useRef, useState } from 'react';
import { View, Animated } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { PostHogProvider } from 'posthog-react-native';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { OnboardingProvider, useOnboarding } from '../context/OnboardingContext';
import { PremiumProvider, usePremium } from '../context/PremiumContext';
import { SuperwallWrapper } from '../lib/superwall';
import { supabase } from '../lib/supabase';
import { onboardingAnswersInputSchema } from '../lib/schemas';
import { colors } from '../constants/colors';

function RootNavigator() {
  const { session, loading } = useAuth();
  const { premium } = usePremium();
  const { retaking, answers } = useOnboarding();
  const segments = useSegments();
  const router = useRouter();
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const [hasActivePlan, setHasActivePlan] = useState<boolean | null>(null);
  const hasRedirected = useRef(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [ready, setReady] = useState(false);
  // Latches true once the initial load (auth + supplementary data) completes.
  // Prevents the blank-screen from re-appearing after a fresh sign-in while
  // onboardingDone/premium queries are still in-flight, which would unmount the
  // email form and clear the user's input.
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  useEffect(() => {
    if (loading) return;

    if (!session) {
      setOnboardingDone(null);
      setHasActivePlan(null);
      hasRedirected.current = false;
      return;
    }

    Promise.all([
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
    ]).then(([oaRes, upRes]) => {
      // A row missing `equipment` is incomplete (e.g. created by a half-finished
      // funnel) and cannot assign a program — treat it as not-onboarded so the guard
      // routes back into onboarding instead of trapping the user on building-plan.
      setOnboardingDone(!!oaRes.data?.equipment);
      setHasActivePlan(!!upRes.data?.active_plan_id);
    });
  }, [session, loading]);

  useEffect(() => {
    if (loading) return;

    // Email deep-link screens manage their own navigation (verifyOtp → set password →
    // route). They run while either unauthed or in a transient recovery session, so the
    // guard must not redirect them.
    if (segments[0] === 'auth-callback' || segments[0] === 'reset-password') return;

    const inAuth = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';
    // Neutral post-paywall screen that runs program assignment. It manages its own
    // navigation into the app once premium is confirmed, so the guard leaves it alone.
    const inBuilding = segments[0] === 'building-plan';

    // No account yet. Sign-up happens AFTER the paywall (PRD §5–§6.1), so the
    // onboarding funnel (which now contains the paywall trigger on match.tsx) and the
    // auth screens are open to anonymous users. Everything else requires an account.
    if (!session) {
      if (!inOnboarding && !inAuth) {
        router.replace('/(onboarding)');
      }
      return;
    }

    // Authed: wait until the supplementary entitlement/onboarding data resolves.
    if (onboardingDone === null || premium === null || hasActivePlan === null) return;

    if (!onboardingDone) {
      // Fresh account created right after the paywall: the answers are still only in
      // context and (for a real purchase) the transaction is unverified. Hand off to
      // building-plan, which persists the answers, verifies any pending purchase, and
      // assigns the program. Fall back to the onboarding flow only when there are no
      // pending answers to persist (e.g. a returning account missing its row).
      const hasPendingAnswers = onboardingAnswersInputSchema.safeParse(answers).success;
      if (hasPendingAnswers) {
        if (!inBuilding) {
          router.replace('/building-plan');
          hasRedirected.current = true;
        }
      } else if (!inOnboarding && !inBuilding) {
        router.replace('/(onboarding)');
        hasRedirected.current = true;
      }
      return;
    }

    if (!premium) {
      // Paywall is now triggered inline from match.tsx (in the onboarding group).
      if (!inOnboarding && !inBuilding) {
        router.replace('/(onboarding)/match');
        hasRedirected.current = true;
      }
      return;
    }

    // No active plan yet. The paywall is now part of the onboarding group (match.tsx),
    // so don't yank the user off onboarding or building while they're converting.
    if (!hasActivePlan) {
      if (!inBuilding && !inOnboarding) {
        router.replace('/building-plan');
        hasRedirected.current = true;
      }
      return;
    }

    if (inAuth || inOnboarding) {
      // During a retake, an already-onboarded premium user is intentionally back in the
      // onboarding flow — don't bounce them to the tabs until they finish.
      if (retaking && inOnboarding) return;
      router.replace('/(tabs)');
      hasRedirected.current = true;
    }
  }, [session, loading, onboardingDone, premium, hasActivePlan, retaking, answers]);

  const supplementaryReady = !loading && !(session && (onboardingDone === null || premium === null || hasActivePlan === null));

  useEffect(() => {
    if (supplementaryReady && !initialLoadComplete) {
      setInitialLoadComplete(true);
    }
  }, [supplementaryReady, initialLoadComplete]);

  const isReady = initialLoadComplete || supplementaryReady;

  useEffect(() => {
    if (isReady && !ready) {
      setReady(true);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isReady]);

  if (!isReady) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
      <Slot />
    </Animated.View>
  );
}

export default function RootLayout() {
  return (
    <PostHogProvider
      apiKey={process.env.EXPO_PUBLIC_POSTHOG_KEY!}
      options={{ host: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com' }}
    >
      <AuthProvider>
        <OnboardingProvider>
          <PremiumProvider>
            <SuperwallWrapper>
              <RootNavigator />
            </SuperwallWrapper>
          </PremiumProvider>
        </OnboardingProvider>
      </AuthProvider>
    </PostHogProvider>
  );
}
