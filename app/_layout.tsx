import React, { useEffect, useRef, useState } from 'react';
import { View, Animated } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { PostHogProvider } from 'posthog-react-native';
import { AuthProvider, useAuth } from '../context/AuthContext';
import {
  OnboardingProvider,
  useOnboarding,
  getResumeStep,
  ONBOARDING_FLOW,
  ONBOARDING_STEP_PATHS,
} from '../context/OnboardingContext';
import { PremiumProvider, usePremium } from '../context/PremiumContext';
import { SuperwallWrapper } from '../lib/superwall';
import { onboardingAnswersInputSchema } from '../lib/schemas';
import { getPendingPurchase } from '../lib/pendingPurchase';
import { colors } from '../constants/colors';
import { screenTransitionOptions } from '../constants/navigation';

function RootNavigator() {
  const { session, loading } = useAuth();
  // onboardingDone and hasActivePlan live in PremiumContext so building-plan's
  // refreshPremium() calls update all three atomically, preventing the guard from
  // re-routing back to building-plan with stale state after a successful run.
  const { premium, onboardingDone, hasActivePlan } = usePremium();
  const { retaking, answers, hydrated, progress } = useOnboarding();
  const segments = useSegments();
  const router = useRouter();
  // Whether a paywall purchase is stashed in AsyncStorage awaiting post-signup
  // verification (null until the async read resolves).
  const [hasPendingPurchase, setHasPendingPurchase] = useState<boolean | null>(null);

  useEffect(() => {
    getPendingPurchase().then((p) => setHasPendingPurchase(!!p));
  }, [session]);
  // Latches on the guard's FIRST full evaluation for an unauthenticated user. The
  // funnel-resume stack rebuild may only happen on that first run (a true cold start):
  // firing it later in the session yanked users out of screens they navigated to
  // themselves (e.g. tapping "Sign in" bounced back to welcome mid-transition).
  const unauthGuardRan = useRef(false);
  // True once a session has been seen this app lifetime. A sign-out lands in the
  // unauthenticated branch with context state that may not have been cleared yet —
  // never treat that as a cold-start resume.
  const hadSession = useRef(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [ready, setReady] = useState(false);
  // Latches true once the initial load (auth + supplementary data) completes.
  // Prevents the blank-screen from re-appearing after a fresh sign-in while
  // onboardingDone/premium queries are still in-flight, which would unmount the
  // email form and clear the user's input.
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

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

    // Answers persisted to AsyncStorage (hydrated into context on launch) count the
    // same as answers entered this session.
    const hasPendingAnswers = onboardingAnswersInputSchema.safeParse(answers).success;

    // No account yet. Sign-up happens AFTER the paywall (PRD §5–§6.1), so the
    // onboarding funnel (which now contains the paywall trigger on match.tsx) and the
    // auth screens are open to anonymous users. Everything else requires an account.
    if (!session) {
      // Wait for the AsyncStorage reads (hydrated answers + progress + pending purchase)
      // before routing, so a purchase or partial funnel saved just before a force-quit is
      // resumed correctly rather than being routed back to a blank welcome screen.
      if (!hydrated || hasPendingPurchase === null) return;
      if (hasPendingPurchase && hasPendingAnswers) {
        // Purchased on the paywall, then quit before finishing sign-up. Resume at the
        // auth entry so building-plan can persist the answers and verify the purchase.
        if (!inAuth) {
          router.replace('/(auth)/sign-in?mode=signup');
        }
        return;
      }
      const firstRun = !unauthGuardRan.current;
      unauthGuardRan.current = true;

      // Cold-start resume of an in-progress first-run funnel: rebuild the back stack
      // (welcome → … → resume step) so swipe-back reaches earlier questions. The target
      // is the first step whose data is actually missing (getResumeStep) — never just
      // the furthest-reached screen, which can outrun the answers and strand the user
      // on match's "complete all questions" error. Strictly once, on the guard's first
      // unauthenticated evaluation of a fresh launch: never after a sign-out
      // (hadSession) and never mid-session, so it cannot hijack navigation the user
      // initiated themselves. Retakes are authed so never reach this branch.
      if (firstRun && !hadSession.current && !inAuth) {
        const resumeStep = getResumeStep(progress, answers);
        const targetIndex = ONBOARDING_FLOW.indexOf(resumeStep);
        if (targetIndex > 0) {
          router.replace(ONBOARDING_STEP_PATHS[ONBOARDING_FLOW[0]]);
          for (let i = 1; i <= targetIndex; i++) {
            router.push(ONBOARDING_STEP_PATHS[ONBOARDING_FLOW[i]]);
          }
          return;
        }
      }

      // Segments are transiently empty while a root-stack transition settles; routing
      // on that state mid-session would bounce the destination screen (e.g. a freshly
      // pushed sign-in) back to welcome. Only the first run may treat empty segments
      // as "not in onboarding" (cold start genuinely needs the initial redirect).
      if ((segments as string[]).length === 0 && !firstRun) return;

      if (!inOnboarding && !inAuth) {
        router.replace('/(onboarding)');
      }
      return;
    }
    hadSession.current = true;

    // A purchase made before auth must be linked even when this account already has
    // complete onboarding answers. Re-read storage before redirecting so the state
    // cannot stay stale after building-plan verifies and clears the transaction.
    if (hasPendingPurchase && !inBuilding) {
      let active = true;
      void getPendingPurchase().then((pending) => {
        if (!active) return;
        setHasPendingPurchase(!!pending);
        if (pending) router.replace('/building-plan');
      });
      return () => {
        active = false;
      };
    }

    // Authed: wait until the supplementary entitlement/onboarding data resolves.
    if (onboardingDone === null || premium === null || hasActivePlan === null) return;

    if (!onboardingDone) {
      // Fresh account created right after the paywall: the answers are still only in
      // context and (for a real purchase) the transaction is unverified. Hand off to
      // building-plan, which persists the answers, verifies any pending purchase, and
      // assigns the program. Fall back to the onboarding flow only when there are no
      // pending answers to persist (e.g. a returning account missing its row).
      // Wait for AsyncStorage hydration so answers persisted before a force-quit are
      // not mistaken for an empty funnel.
      if (!hydrated) return;
      if (hasPendingAnswers) {
        if (!inBuilding) {
          router.replace('/building-plan');
        }
      } else if (!inOnboarding && !inBuilding) {
        router.replace('/(onboarding)');
      }
      return;
    }

    if (!premium) {
      // Paywall is now triggered inline from match.tsx (in the onboarding group).
      if (!inOnboarding && !inBuilding) {
        router.replace('/(onboarding)/match');
      }
      return;
    }

    // No active plan yet. The paywall is now part of the onboarding group (match.tsx),
    // so don't yank the user off onboarding or building while they're converting.
    if (!hasActivePlan) {
      if (!inBuilding && !inOnboarding) {
        router.replace('/building-plan');
      }
      return;
    }

    if (inAuth || inOnboarding) {
      // During a retake, an already-onboarded premium user is intentionally back in the
      // onboarding flow — don't bounce them to the tabs until they finish.
      if (retaking && inOnboarding) return;
      router.replace('/(tabs)');
    }
  }, [session, loading, onboardingDone, premium, hasActivePlan, retaking, answers, hydrated, hasPendingPurchase, progress, segments]);

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
      {/* A real root Stack (previously a navigator-less <Slot />) so root-level pushes
          (onboarding-answers, session, legal, …) keep the screens below them mounted.
          With Slot, "back" remounted the previous route from scratch — the user was
          dumped on the Home tab with every screen refetching. */}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          ...screenTransitionOptions,
        }}
      >
        {/* Flow screens that manage their own navigation — swiping back out of them
            would bypass exit confirmations or re-trigger paywall/assignment flows. */}
        <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
        <Stack.Screen name="building-plan" options={{ gestureEnabled: false }} />
        <Stack.Screen name="session" options={{ gestureEnabled: false }} />
        <Stack.Screen name="weekly-ramp" options={{ gestureEnabled: false }} />
        <Stack.Screen name="program-complete" options={{ gestureEnabled: false }} />
        <Stack.Screen name="auth-callback" options={{ gestureEnabled: false }} />
        <Stack.Screen name="reset-password" options={{ gestureEnabled: false }} />
      </Stack>
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
