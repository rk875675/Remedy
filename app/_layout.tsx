import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { enableFreeze } from 'react-native-screens';
import { Stack, useRouter, useSegments } from 'expo-router';

// Suspend inactive screens so looping JS/native animations on the page
// underneath cannot hitch the incoming transition.
enableFreeze(true);
import SplashOverlay from '../components/SplashOverlay';
import * as Linking from 'expo-linking';
import { AnalyticsBridge, AnalyticsProvider } from '../lib/analytics';
import { AuthProvider, useAuth } from '../context/AuthContext';
import {
  OnboardingProvider,
  useOnboarding,
  getResumeStep,
  hasMeaningfulIncompleteFunnel,
  rebuildOnboardingStack,
  shouldOpenMatch,
} from '../context/OnboardingContext';
import { PremiumProvider, usePremium } from '../context/PremiumContext';
import { SuperwallWrapper } from '../lib/superwall';
import { getPendingPurchase } from '../lib/pendingPurchase';
import { getPendingPromo } from '../lib/pendingPromo';
import { colors } from '../constants/colors';
import { screenTransitionOptions } from '../constants/navigation';
import { parseAuthParamsFromUrl } from '../lib/auth-redirects';
import { setPendingConfirmUrl } from '../lib/confirm-link-store';
import { setPendingRecoveryUrl } from '../lib/recovery-link-store';
import { isAuthLinkAlreadyHandled } from '../lib/auth-link-dedupe';
import { applyAvailableUpdate } from '../lib/applyOtaUpdate';

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
  // Whether a validated promo code is stashed awaiting post-signup redemption —
  // same handoff shape as a pending purchase (PromoCodeSheet → sign-up →
  // building-plan redeems the stash).
  const [hasPendingPromo, setHasPendingPromo] = useState<boolean | null>(null);
  // Cold-start email links resolve asynchronously. The unauth funnel resume must
  // not send the user to Your Program before confirm/recovery has claimed the URL.
  const [deepLinkChecked, setDeepLinkChecked] = useState(false);

  const sessionUserId = session?.user.id ?? null;
  useEffect(() => {
    setHasPendingPurchase(null);
    setHasPendingPromo(null);
    getPendingPurchase().then((p) => setHasPendingPurchase(!!p));
    getPendingPromo().then((p) => setHasPendingPromo(!!p));
  }, [sessionUserId]);

  // --- Global deep-link handler for auth flows ---
  // In-memory nav-once guards so a single deep-link URL doesn't trigger two navigations
  // (e.g. both cold-start getInitialURL and the 'url' event fire for the same URL).
  // These are reset on unmount (component remount = full restart); the persistent
  // deduplication that survives relaunches lives in auth-link-dedupe.ts (AsyncStorage).
  const confirmNavRef = useRef(false);
  const recoveryNavRef = useRef(false);

  useEffect(() => {
    function maybeOpenConfirm(url: string) {
      if (confirmNavRef.current) return;
      const isConfirm =
        url.includes('auth-confirm') ||
        /type=(signup|email|email_change|magiclink|invite)/.test(url);
      if (!isConfirm) return;
      const p = parseAuthParamsFromUrl(url);
      const hasCredential = (p.access_token && p.refresh_token) || p.code || p.token_hash;
      if (!hasCredential && !p.error) return;
      setPendingConfirmUrl(url);
      confirmNavRef.current = true;
      router.replace('/(auth)/confirm');
    }

    function maybeOpenRecovery(url: string) {
      if (recoveryNavRef.current) return;
      if (!url.includes('password-recovery') && !url.includes('type=recovery')) return;
      const p = parseAuthParamsFromUrl(url);
      const hasCredential = (p.access_token && p.refresh_token) || p.code || p.token_hash;
      if (!hasCredential && !p.error) return;
      setPendingRecoveryUrl(url);
      recoveryNavRef.current = true;
      router.replace('/(auth)/password-recovery');
    }

    // Cold start: check the URL that launched the app.
    void (async () => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        setDeepLinkChecked(true);
      };
      const watchdog = setTimeout(finish, 2000);
      try {
        const u = await Linking.getInitialURL();
        if (u && !(await isAuthLinkAlreadyHandled(u))) {
          maybeOpenRecovery(u);
          maybeOpenConfirm(u);
        }
      } finally {
        clearTimeout(watchdog);
        finish();
      }
    })();

    // Warm start: the app was already running when the link was tapped.
    const sub = Linking.addEventListener('url', (e) => {
      maybeOpenRecovery(e.url);
      maybeOpenConfirm(e.url);
    });

    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // --- End global deep-link handler ---

  // Latches on the guard's FIRST full evaluation for an unauthenticated user. The
  // empty-segments fallback may only treat "no route" as a cold start once —
  // firing it later yanked users out of screens they navigated to themselves
  // (e.g. tapping "Sign in" bounced back to welcome mid-transition).
  const unauthGuardRan = useRef(false);
  // Stack rebuild to the last answered question. Once per JS lifetime so a
  // progress write (checkbox, option tap) cannot re-push the whole funnel.
  const funnelResumeRan = useRef(false);
  // True once a session has been seen this app lifetime. A sign-out lands in the
  // unauthenticated branch with context state that may not have been cleared yet —
  // never treat that as a cold-start resume.
  const hadSession = useRef(false);
  // Latches once a lapsed subscriber has been placed on Your Program, which is what
  // makes Welcome a legitimate destination for them (swipe-back) rather than a
  // cold-start landing the guard has to correct.
  const lapsedGateShown = useRef(false);
  // Latches true once the initial load (auth + supplementary data) completes.
  // Prevents the blank-screen from re-appearing after a fresh sign-in while
  // onboardingDone/premium queries are still in-flight, which would unmount the
  // email form and clear the user's input.
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  // Controls splash overlay visibility after its exit animation finishes.
  const [splashGone, setSplashGone] = useState(false);

  useEffect(() => {
    if (loading) return;

    // Email deep-link screens manage their own navigation (verifyOtp → set password →
    // route). They run while either unauthed or in a transient recovery session, so the
    // guard must not redirect them.
    // 'reset-password' and 'auth-callback' are the legacy root-level screens.
    // 'password-recovery' is inside (auth) but the guard must also never redirect while
    // that screen is active (the recovery client holds an in-memory-only session and the
    // user hasn't set their new password yet — routing away would abort the flow).
    const segs = segments as string[];
    if (
      segs[0] === 'auth-callback' ||
      segs[0] === 'reset-password' ||
      (segs[0] === '(auth)' && segs[1] === 'password-recovery')
    ) return;

    const inAuth = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';
    // Neutral post-paywall screen that runs program assignment. It manages its own
    // navigation into the app once premium is confirmed, so the guard leaves it alone.
    const inBuilding = segments[0] === 'building-plan';
    // Terms/Privacy screens are reachable from the safety gate, auth screens, and the
    // paywall — all pre-account/pre-premium states. The guard must never bounce a user
    // off a legal document they explicitly opened.
    const inLegal = segments[0] === '(legal)';

    // Quiz finished in THIS funnel (safety accepted + every required answer + q8).
    // Leftover answers from a previous run must not count — that dumped mid-quiz
    // users onto match ("Your Program") after a reload.
    const quizFinished = shouldOpenMatch(progress, answers);
    const funnelInProgress = hasMeaningfulIncompleteFunnel(progress, answers);

    const applyFunnelResume = (): boolean => {
      if (funnelResumeRan.current || inAuth || inLegal || inBuilding) return false;
      funnelResumeRan.current = true;
      if (quizFinished) {
        rebuildOnboardingStack(router, 'match', answers);
        return true;
      }
      const resumeStep = getResumeStep(progress, answers);
      if (resumeStep === 'welcome') return false;
      rebuildOnboardingStack(router, resumeStep, answers);
      return true;
    };

    // No account yet. Sign-up happens AFTER the paywall (PRD §5–§6.1), so the
    // onboarding funnel (which now contains the paywall trigger on match.tsx) and the
    // auth screens are open to anonymous users. Everything else requires an account.
    if (!session) {
      // Wait for the AsyncStorage reads (hydrated answers + progress + pending
      // purchase/promo) before routing, so a purchase or partial funnel saved just
      // before a force-quit is resumed correctly rather than being routed back to a
      // blank welcome screen.
      if (!hydrated || hasPendingPurchase === null || hasPendingPromo === null || !deepLinkChecked) return;
      if ((hasPendingPurchase || hasPendingPromo) && quizFinished) {
        // Purchased (or validated a promo code) on the paywall, then quit before
        // finishing sign-up. Resume at the auth entry so building-plan can persist
        // the answers and verify the purchase / redeem the code.
        if (!inAuth) {
          router.replace('/(auth)/sign-in?mode=signup');
        }
        return;
      }
      const firstRun = !unauthGuardRan.current;
      unauthGuardRan.current = true;

      // Cold-start resume: last unanswered step, not match, not Home. Once per
      // launch — never after a sign-out, never mid-session (checkbox taps write
      // progress and would otherwise rebuild the stack).
      if (firstRun && !hadSession.current && !inAuth) {
        if (applyFunnelResume()) return;
      }

      // Segments are transiently empty while a root-stack transition settles; routing
      // on that state mid-session would bounce the destination screen (e.g. a freshly
      // pushed sign-in) back to welcome. Only the first run may treat empty segments
      // as "not in onboarding" (cold start genuinely needs the initial redirect).
      if ((segments as string[]).length === 0 && !firstRun) return;

      if (!inOnboarding && !inAuth && !inLegal) {
        router.replace('/(onboarding)');
      }
      return;
    }
    hadSession.current = true;

    // A purchase (or validated promo code) made before auth must be linked even when
    // this account already has complete onboarding answers. Wait for answer hydration
    // first — routing here before AsyncStorage loads left building-plan with empty
    // context, so it skipped the upsert and assign-program failed with
    // incomplete_answers.
    if (!hydrated) return;
    if (hasPendingPurchase === null || hasPendingPromo === null) return;
    if ((hasPendingPurchase || hasPendingPromo) && !inBuilding) {
      let active = true;
      void Promise.all([getPendingPurchase(), getPendingPromo()]).then(
        ([pending, pendingPromo]) => {
          if (!active) return;
          setHasPendingPurchase(!!pending);
          setHasPendingPromo(!!pendingPromo);
          if (pending || pendingPromo) router.replace('/building-plan');
        },
      );
      return () => {
        active = false;
      };
    }

    // Authed: wait until the supplementary entitlement/onboarding data resolves.
    if (onboardingDone === null || premium === null || hasActivePlan === null) return;
    if (!hydrated) return;

    // Mid-funnel always wins over a leftover completed session — but only for
    // accounts that have not finished onboarding. An already-onboarded user
    // (including a lapsed subscriber) must never be sent back through the quiz
    // because leftover AsyncStorage progress still exists.
    if (funnelInProgress && !retaking && !onboardingDone) {
      if (applyFunnelResume()) return;
      if (!inOnboarding && !inBuilding && !inLegal && !inAuth) {
        const resumeStep = getResumeStep(progress, answers);
        if (resumeStep === 'welcome') {
          router.replace('/(onboarding)');
        } else {
          rebuildOnboardingStack(router, resumeStep, answers);
        }
      }
      return;
    }

    if (!onboardingDone) {
      // Fresh account created right after the paywall: the answers are still only in
      // context and (for a real purchase) the transaction is unverified. Hand off to
      // building-plan, which persists the answers, verifies any pending purchase, and
      // assigns the program. Fall back to the last onboarding step when the quiz is
      // not finished (e.g. a returning account missing its row).
      if (quizFinished) {
        if (!inBuilding) {
          router.replace('/building-plan');
        }
      } else {
        if (applyFunnelResume()) return;
        if (!inOnboarding && !inBuilding && !inLegal) {
          router.replace('/(onboarding)');
        }
      }
      return;
    }

    if (!premium) {
      // Lapsed subscriber. Two screens only: Your Program (paywall) and Welcome
      // (sign in / sign out) — never the tabs, never back through the quiz.
      if (inBuilding || inLegal) return;
      if (inOnboarding && segs[1] === 'match') {
        lapsedGateShown.current = true;
        return;
      }
      // Welcome is `index` (or the group root). Allowed only after Your Program
      // has been shown — otherwise a cold start would sit on Welcome.
      const onWelcome = inOnboarding && (!segs[1] || segs[1] === 'index');
      if (onWelcome && lapsedGateShown.current) return;
      router.replace('/(onboarding)/match?lapsed=1', { withAnchor: true });
      return;
    }

    // No active plan yet. The paywall is now part of the onboarding group (match.tsx),
    // so don't yank the user off onboarding or building while they're converting.
    if (!hasActivePlan) {
      if (!inBuilding && !inOnboarding && !inLegal) {
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
  }, [session, loading, onboardingDone, premium, hasActivePlan, retaking, answers, hydrated, hasPendingPurchase, hasPendingPromo, deepLinkChecked, progress, segments]);

  const supplementaryReady = !loading && !(session && (onboardingDone === null || premium === null || hasActivePlan === null));

  useEffect(() => {
    if (supplementaryReady && !initialLoadComplete) {
      setInitialLoadComplete(true);
    }
  }, [supplementaryReady, initialLoadComplete]);

  const isReady = initialLoadComplete || supplementaryReady;

  // isReady latches — once the app is ready the splash exits and never comes back.
  const isReadyRef = useRef(false);
  if (isReady) isReadyRef.current = true;
  return (
    <View style={{ flex: 1 }}>
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
        <Stack.Screen name="orientation" />
        <Stack.Screen name="program-complete" options={{ gestureEnabled: false }} />
        <Stack.Screen name="auth-callback" options={{ gestureEnabled: false }} />
        <Stack.Screen name="reset-password" options={{ gestureEnabled: false }} />
      </Stack>

      {/* Animated brand splash — overlays the Stack and fades out once the app is
          ready. Rendering the Stack underneath ensures there is no blank-flash on
          the transition: the first real screen is already mounted when the overlay
          exits. */}
      {!splashGone && (
        <SplashOverlay
          isReady={isReadyRef.current}
          onDone={() => setSplashGone(true)}
        />
      )}
    </View>
  );
}

export { AppErrorBoundary as ErrorBoundary } from '../components/AppErrorBoundary';

export default function RootLayout() {
  useEffect(() => {
    void applyAvailableUpdate();
  }, []);

  return (
    <AnalyticsProvider>
      <AuthProvider>
        <OnboardingProvider>
          <PremiumProvider>
            <SuperwallWrapper>
              {/* Headless: identity sync + screen tracking. Needs auth, onboarding
                  and premium context, so it cannot live at the root. */}
              <AnalyticsBridge />
              <RootNavigator />
            </SuperwallWrapper>
          </PremiumProvider>
        </OnboardingProvider>
      </AuthProvider>
    </AnalyticsProvider>
  );
}
