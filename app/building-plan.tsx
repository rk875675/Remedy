import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Pressable, ScrollView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { usePremium } from '../context/PremiumContext';
import { useOnboarding, clearStoredAnswers, clearStoredProgress } from '../context/OnboardingContext';
import { supabase } from '../lib/supabase';
import { isPremium, isDevUser } from '../lib/entitlements';
import { assignResultSchema, onboardingAnswersInputSchema } from '../lib/schemas';
import { getPendingPurchase, clearPendingPurchase } from '../lib/pendingPurchase';
import { getPendingPromo, clearPendingPromo } from '../lib/pendingPromo';
import { redeemPromoCode } from '../lib/promoCodes';
import { getLatestRemedyTransaction } from '../lib/iap';
import { extractInvokeError } from '../lib/functionsError';
import {
  getRetakeStartWeek,
  retryWithBackoff,
  shouldClearPendingPurchase,
  shouldRetryProgramAssignment,
  shouldRetryPurchaseVerification,
} from '../lib/assignmentRecovery';
import { signedOut } from '../lib/analytics/events/auth';
import { purchaseVerificationFailed } from '../lib/analytics/events/monetization';
import {
  programAssigned,
  programAssignmentFailed,
  programAssignmentStarted,
} from '../lib/analytics/events/program';
import { toVerificationReason } from '../lib/analytics/purchaseErrors';
import type { programAssignmentFailureReason } from '../lib/analytics/events/enums';
import type { z } from 'zod';
import { colors, serifFont } from '../constants/colors';
import { AppLogo } from '../components/brand/AppLogo';

type ProgramAssignmentFailureReason = z.infer<typeof programAssignmentFailureReason>;
import { radius } from '../constants/spacing';
import { shadows } from '../constants/shadows';

type Phase = 'assigning' | 'done' | 'error';

function invokeErrorBody(data: unknown): { error?: string } | null {
  if (!data || typeof data !== 'object') return null;
  const error = 'error' in data && typeof data.error === 'string' ? data.error : undefined;
  return error ? { error } : null;
}

// Post-paywall "Building your program" screen. Runs the assign-program edge function
// (idempotent — skips if an active plan already exists, e.g. on restore), then routes
// into the app once premium is confirmed. Whitelisted in the root navigator so it is
// not bounced back to the paywall while assignment is in flight.
export default function BuildingPlanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ retake?: string }>();
  const isRetake = params.retake === '1';
  const { user, signOut } = useAuth();
  const { refreshPremium } = usePremium();
  const { answers, endRetake, resetAnswers, hydrated } = useOnboarding();
  const [phase, setPhase] = useState<Phase>('assigning');
  // Human-readable reason the assignment failed. Surfaced on the error screen (debug
  // box) so failures during testing are diagnosable without a device log stream.
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [preservePendingOnError, setPreservePendingOnError] = useState(false);
  // Debug box is available to dev builds and dev-flagged accounts only — never to real
  // users in production, who just see the friendly copy + recovery buttons. Even for
  // dev, it stays collapsed behind an explicit tap so raw server errors are never
  // dumped on screen by default.
  const [isDev, setIsDev] = useState(false);
  const [debugRevealed, setDebugRevealed] = useState(false);
  const ran = useRef(false);
  // Guards against overlapping runs. Paired with `runGen`: when the 30s watchdog
  // fires (or the user leaves), we bump the generation so a still-running invoke
  // cannot navigate / flip phase after we've already recovered — and so "Try again"
  // is not deadlocked behind a hung `inFlight` flag.
  const inFlight = useRef(false);
  const runGen = useRef(0);
  const activeAbortController = useRef<AbortController | null>(null);
  const preservePendingForRun = useRef(false);
  const [retryReady, setRetryReady] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Route to the error screen while recording why. `detail` is developer-facing
  // (surfaced only in the debug box) and deliberately never leaves the device:
  // it embeds server messages and response previews, so it is unbounded text.
  // Analytics gets `code` instead — a closed set that stays a usable breakdown.
  function fail(code: ProgramAssignmentFailureReason, detail: string) {
    setErrorDetail(detail);
    setDebugRevealed(false);
    setPreservePendingOnError(preservePendingForRun.current);
    programAssignmentFailed({ reason: code, is_retake: isRetake });
    setPhase('error');
  }

  async function hasActivePlanForUser(userId: string): Promise<boolean> {
    const { data: up } = await supabase
      .from('user_programs')
      .select('active_plan_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (!up?.active_plan_id) return false;
    const { data: plan } = await supabase
      .from('user_program_plans')
      .select('id')
      .eq('id', up.active_plan_id)
      .eq('status', 'active')
      .maybeSingle();
    return !!plan;
  }

  // Escape hatch from the error screen. Prefer home when a plan already exists;
  // otherwise send the user to the plan/paywall screen where Restore lives.
  //
  // IMPORTANT: the root guard (_layout.tsx) force-redirects back to /building-plan
  // any time `hasPendingPurchase` is true and the current route isn't building-plan.
  // If verify-purchase keeps failing (e.g. a stale/foreign StoreKit transaction) that
  // stash never clears, so navigating away without clearing it first just bounces the
  // user straight back here. Clear it — same as signOut() already does — since the
  // subscription remains recoverable via Restore Purchases.
  async function leaveErrorScreen() {
    runGen.current += 1;
    activeAbortController.current?.abort();
    if (!preservePendingOnError) await clearPendingPurchase();
    if (!user) {
      router.replace('/(onboarding)');
      return;
    }
    // This is the only way off the error screen, so an unreadable entitlement must not
    // reject out of here — that leaves the button dead and the user truly stuck. An
    // already-built active plan is the best offline proxy for "this account paid".
    let entitled: boolean;
    try {
      entitled = await isPremium(user.id);
    } catch {
      entitled = await hasActivePlanForUser(user.id);
    }
    await refreshPremium();
    if (isRetake) endRetake();
    if (!entitled) {
      router.replace('/(onboarding)/match?lapsed=1', { withAnchor: true });
      return;
    }
    router.replace('/(tabs)');
  }

  async function handleLogOut() {
    runGen.current += 1;
    activeAbortController.current?.abort();
    signedOut({ source_screen: 'building_plan' });
    await signOut();
    // Straight to sign-in, not the onboarding welcome screen: anyone logging out here
    // already has an account (e.g. the subscription belongs to a different Remedy
    // account) and just needs to authenticate as the right one — re-running the
    // onboarding funnel would be a confusing detour.
    router.replace('/(auth)/sign-in');
  }

  // Post-signup handoff. A brand-new account created right after the paywall arrives
  // here with its answers only in OnboardingContext and (for a real purchase) an
  // unverified transaction stashed before sign-up. Persist the answers, verify the
  // pending purchase (or grant the dev trial), then refresh entitlement state. Skipped
  // gracefully for retakes and returning users (answers already saved, no pending tx).
  async function linkAccount(signal: AbortSignal): Promise<boolean> {
    if (!user) return false;

    const parsedAnswers = onboardingAnswersInputSchema.safeParse(answers);
    if (parsedAnswers.success) {
      // Upsert (not insert-if-missing): a half-finished funnel can leave an incomplete
      // row that can't assign a program. When we have a complete set of answers in
      // context, write them through so the row is repaired rather than left broken.
      const { error: upsertError } = await supabase.from('onboarding_answers').upsert(
        { user_id: user.id, ...parsedAnswers.data },
        { onConflict: 'user_id' },
      );
      if (upsertError) {
        throw new Error(`persist_answers_failed: ${upsertError.message}`);
      }
      // The DB row is now the source of truth; drop the crash-recovery copies.
      await clearStoredAnswers();
      await clearStoredProgress();
    } else {
      // Context is empty (or still incomplete) after hydration. A returning user or
      // remount may already have a complete row — only then is it safe to assign.
      const { data: existing } = await supabase
        .from('onboarding_answers')
        .select('equipment')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!existing?.equipment) return false;
    }

    const pending = await getPendingPurchase();
    preservePendingForRun.current = !!pending;
    const dev = await isDevUser(user.id);
    // Promo code validated pre-signup (no Apple purchase happened). Redeem replaces
    // purchase-sync below — unless a real Apple purchase is also present: Apple wins.
    const pendingPromo = await getPendingPromo();
    // A fresh install or interrupted handoff may have no AsyncStorage stash even
    // though StoreKit still has the subscription. Recover it before giving up.
    // Skip the opportunistic StoreKit read when a promo stash exists — this funnel
    // ended with a code, not a purchase; a stale device transaction must not
    // pre-empt the redeem.
    const purchase =
      pending ?? (!dev && !pendingPromo ? await getLatestRemedyTransaction() : null);
    if (purchase) {
      const verification = await retryWithBackoff(
        async () => {
          const { data, error } = await supabase.functions.invoke<{
            success?: boolean;
            error?: string;
          }>('verify-purchase', {
            body: {
              transactionId: purchase.originalTransactionId,
              productId: purchase.productId,
              signedTransaction: purchase.jws,
            },
            headers: { 'Idempotency-Key': `verify_${user.id}_${purchase.originalTransactionId}` },
            signal,
            timeout: 12000,
          });
          const reason =
            error || !data?.success
              ? await extractInvokeError(data, error)
              : null;
          return { data, error, reason };
        },
        (result) => !!result.reason && shouldRetryPurchaseVerification(result.reason),
        signal,
      );
      if (verification.error || !verification.data?.success) {
        // Surface the server's real reason (e.g. transaction_not_found,
        // apple_credentials_missing, transaction_already_linked) instead of a generic
        // message — otherwise the error screen can't tell us what actually broke.
        const serverError = verification.reason ?? 'unknown_error';
        if (dev) {
          // Dev / sandbox testers routinely hit non-fatal verify failures — e.g. a
          // sandbox subscription already bound to a previous test account
          // (transaction_already_linked) or a lapsed sandbox transaction
          // (transaction_expired; sandbox renews on a compressed clock). A dev user is
          // already treated as premium, so don't strand them on the error screen: grant
          // the dev trial and drop the stash so retries don't keep bouncing here.
          purchaseVerificationFailed({ reason: toVerificationReason(serverError), attempt: 1 });
          await supabase.functions.invoke('grant-dev-trial').catch(() => {});
          await clearPendingPurchase();
          preservePendingForRun.current = false;
        } else if (pending) {
          // Preserve transient failures for retry/relaunch. Terminal or stale receipts
          // cannot succeed on retry, so clear only those and recover via StoreKit Restore.
          const terminal = shouldClearPendingPurchase(serverError);
          preservePendingForRun.current = !terminal;
          if (terminal) await clearPendingPurchase();
          purchaseVerificationFailed({ reason: toVerificationReason(serverError), attempt: 1 });
          // An expired/revoked leftover receipt on a returning account is not a
          // setup failure — fall through so the entitlement check sends them to
          // Your Program (paywall) instead of the error screen's Log Out button.
          if (terminal && (serverError === 'transaction_expired' || serverError === 'transaction_revoked')) {
            // fall through
          } else {
            throw new Error(`verify-purchase failed: ${serverError}`);
          }
        } else {
          // Opportunistic StoreKit recovery only: the device transaction may belong to a
          // different account (transaction_already_linked) or be stale. Don't strand the
          // user on the error screen — fall through to the entitlement check, which routes
          // unentitled users back to the paywall where Restore is available.
          purchaseVerificationFailed({ reason: toVerificationReason(serverError), attempt: 1 });
        }
      } else {
        await clearPendingPurchase();
        preservePendingForRun.current = false;
        // A real Apple purchase won over the stashed code; drop the code so a later
        // launch doesn't try to redeem it on top of a paying subscription.
        if (pendingPromo) await clearPendingPromo();
      }
    } else if (pendingPromo) {
      // Redeem the stashed promo code — this replaces purchase-sync (no Apple
      // purchase happened). Success or ALREADY_ENTITLED both count as access.
      const result = await redeemPromoCode(pendingPromo.code);
      if (result.redeemed || (!result.redeemed && result.error === 'ALREADY_ENTITLED')) {
        await clearPendingPromo();
      } else if (result.error === 'INVALID_CODE' || result.error === 'CODE_FULLY_REDEEMED') {
        // Terminal: the code died between validate and redeem (deactivated,
        // exhausted). Clear the stash and fall through — the root guard routes
        // unentitled users back to the paywall.
        await clearPendingPromo();
      } else {
        // Transient (network / server). Keep the stash and surface the error screen —
        // retry re-runs linkAccount, and the redeem RPC is idempotent.
        throw new Error(`promo-redeem failed: ${result.error}`);
      }
    } else if (dev) {
      // Expo Go "dev trial": no StoreKit transaction, so create the entitlement row
      // server-side (best-effort — a dev user is already treated as premium).
      await supabase.functions.invoke('grant-dev-trial').catch(() => {});
    }

    await refreshPremium();
    return true;
  }

  async function runAssignment() {
    if (!user || inFlight.current) return;
    const gen = ++runGen.current;
    const controller = new AbortController();
    activeAbortController.current = controller;
    inFlight.current = true;
    preservePendingForRun.current = false;
    setPreservePendingOnError(false);
    setRetryReady(false);
    setPhase('assigning');
    try {
      const answersReady = await linkAccount(controller.signal);
      if (gen !== runGen.current) return;
      if (!answersReady) {
        // Don't call assign-program against an empty/incomplete row — that is what
        // fired program_assignment_failed (incomplete_answers) after signup, when
        // this screen raced AsyncStorage hydration and skipped the answers upsert.
        programAssignmentFailed({ reason: 'incomplete_answers', is_retake: isRetake });
        // A returning user who already has a plan must not be dumped into the
        // first-run quiz. Send them to Your Program so they can resubscribe.
        if (await hasActivePlanForUser(user.id)) {
          await refreshPremium();
          router.replace('/(onboarding)/match?lapsed=1', { withAnchor: true });
          return;
        }
        router.replace('/(onboarding)');
        return;
      }

      // Only entitled users build a plan. If somehow not entitled (e.g. a missed
      // transaction), send them back to the paywall rather than stranding them here.
      const entitled = await isPremium(user.id);
      if (gen !== runGen.current) return;
      if (!entitled) {
        await refreshPremium();
        router.replace('/(onboarding)/match?lapsed=1', { withAnchor: true });
        return;
      }

      const { data: up } = await supabase
        .from('user_programs')
        .select('active_plan_id, current_week')
        .eq('user_id', user.id)
        .maybeSingle();
      if (gen !== runGen.current) return;

      // Idempotency: if an active plan already exists, skip re-assignment — UNLESS this
      // is a retake, which always regenerates from the next incomplete week.
      let hasActivePlan = false;
      let activePlanWeeks: number | null = null;
      if (up?.active_plan_id) {
        const { data: plan } = await supabase
          .from('user_program_plans')
          .select('id, duration_weeks')
          .eq('id', up.active_plan_id)
          .eq('status', 'active')
          .maybeSingle();
        if (gen !== runGen.current) return;
        hasActivePlan = !!plan;
        activePlanWeeks = plan?.duration_weeks ?? null;
      }

      if (isRetake || !hasActivePlan) {
        // Retake starts at the next incomplete week (the week currently in progress).
        // A finished program parks the pointer at duration_weeks + 1 (completion
        // sentinel) — retaking then must rebuild from week 1, not resume past the end
        // of the old plan (the new plan can be longer, e.g. 5 → 10 weeks).
        const startWeek = isRetake
          ? getRetakeStartWeek(up?.current_week, activePlanWeeks)
          : undefined;
        programAssignmentStarted({ is_retake: isRetake });
        const assignmentStartedAt = Date.now();
        const assignment = await retryWithBackoff(
          async () => {
            const { data, error } = await supabase.functions.invoke('assign-program', {
              body: { user_id: user.id, ...(startWeek ? { start_week: startWeek } : {}) },
              signal: controller.signal,
              timeout: 15000,
            });
            const parsed = assignResultSchema.safeParse(data);
            const reason =
              error || !parsed.success
                ? await extractInvokeError(invokeErrorBody(data), error)
                : null;
            const recovered =
              !!reason && !controller.signal.aborted
                ? await hasActivePlanForUser(user.id)
                : false;
            return { data, error, parsed, reason, recovered };
          },
          (result) =>
            !!result.reason &&
            !result.recovered &&
            shouldRetryProgramAssignment(result.reason),
          controller.signal,
        );
        if (gen !== runGen.current) return;
        const { data, error, parsed } = assignment;
        if ((error || !parsed.success) && !assignment.recovered) {
          // A previous/concurrent run may have already created the plan. Don't strand the
          // user on the error screen if they actually have an active plan now. Verify the
          // pointer references an ACTIVE plan, not merely that active_plan_id is non-null:
          // assign-program supersedes old plans BEFORE repointing user_programs, so a
          // failed pointer update (pointer_update_failed) leaves active_plan_id pointing at
          // a now-superseded snapshot. Treating that as success would route the user into
          // the app on a stale/broken plan.
          if (await hasActivePlanForUser(user.id)) {
            // Fall through to success navigation below.
          } else {
            // If assignment failed because the onboarding answers are incomplete (e.g. a
            // row missing equipment from a half-finished funnel), recover by sending the
            // user back into onboarding rather than stranding them on the error screen.
            const { data: oa } = await supabase
              .from('onboarding_answers')
              .select('equipment')
              .eq('user_id', user.id)
              .maybeSingle();
            if (gen !== runGen.current) return;
            if (!oa?.equipment) {
              programAssignmentFailed({ reason: 'incomplete_answers', is_retake: isRetake });
              router.replace('/(onboarding)');
              return;
            }
            const invokeMsg = assignment.reason;
            const zodMsg = !parsed.success ? parsed.error.issues.map((i) => i.message).join('; ') : null;
            const dataPreview = (() => {
              try {
                return JSON.stringify(data)?.slice(0, 400);
              } catch {
                return String(data);
              }
            })();
            fail(
              'assign_failed',
              `assign-program failed. invoke error: ${invokeMsg ?? 'none'}. ` +
                `response parse: ${zodMsg ?? 'ok'}. response: ${dataPreview ?? 'null'}`,
            );
            return;
          }
        } else if (parsed.success && parsed.data) {
          // Guarded on parsed.data rather than the else alone: this branch is also
          // reached when assignment failed but a concurrent run had already created
          // the plan, and in that case there is no response to report.
          programAssigned({
            plan_id: parsed.data.plan_id,
            duration_weeks: parsed.data.duration_weeks,
            sessions_per_week: parsed.data.sessions_per_week,
            equipment_tier: parsed.data.equipment_tier,
            is_retake: isRetake,
            duration_ms: Math.max(0, Date.now() - assignmentStartedAt),
          });
        }
      }

      if (gen !== runGen.current) return;
      await refreshPremium();
      if (gen !== runGen.current) return;
      setPhase('done');
      // Onboarding is complete — drop any funnel-resume record so a finished user is
      // never routed back into the quiz (covers returning users whose answers were
      // already in the DB, so the linkAccount clear above did not run).
      await clearStoredProgress();
      // Clear in-memory answers so hasPendingAnswers is false when the root guard
      // fires after router.replace below. Without this, the guard sees
      // onboardingDone=false (stale) + hasPendingAnswers=true and re-routes back
      // here, remounting the screen and restarting the whole flow in a loop.
      resetAnswers();
      // The retake is only complete once the plan is rebuilt — lower the flag here (not
      // on match.tsx) so the root guard can't bounce the user out mid-flow.
      if (isRetake) endRetake();
      // replace (not push) so a failed/hung first-run cannot leave building-plan
      // underneath the tabs stack. dismissTo alone can be a no-op when tabs were
      // never mounted, which is what stranded users on this screen.
      router.replace('/(tabs)');
    } catch (e) {
      if (gen !== runGen.current) return;
      const detail =
        e instanceof Error
          ? `${e.name}: ${e.message}${e.stack ? `\n${e.stack.split('\n').slice(1, 4).join('\n')}` : ''}`
          : String(e);
      fail(detail.includes('verify-purchase failed') ? 'verify_purchase_failed' : 'unexpected_error', detail);
    } finally {
      if (activeAbortController.current === controller) {
        activeAbortController.current = null;
        inFlight.current = false;
        setRetryReady(true);
      }
    }
  }

  useEffect(() => {
    if (ran.current || !user || !hydrated) return;
    ran.current = true;
    runAssignment();
  }, [user, hydrated]);

  // Gate the debug box: dev builds always, plus dev-flagged accounts on release builds.
  useEffect(() => {
    if (!user) return;
    let active = true;
    isDevUser(user.id)
      .then((dev) => {
        if (active) setIsDev(dev);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user]);

  // Watchdog: direct navigation inside the async setup chain can get swallowed, leaving
  // the user stuck on the spinner. If we're still assigning after 30s, surface the
  // error screen and invalidate the hung run so "Try again" works.
  useEffect(() => {
    if (phase !== 'assigning') return;
    const timeout = setTimeout(() => {
      activeAbortController.current?.abort();
      runGen.current += 1;
      fail(
        'timeout',
        'Timed out after 30s. Setup did not complete (linkAccount / verify-purchase / assign-program hung).',
      );
    }, 30000);
    return () => clearTimeout(timeout);
  }, [phase]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.06,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);

  if (phase === 'error') {
    const showDebug = (__DEV__ || isDev) && !!errorDetail;
    // Subscription bound to a different account — a distinct, recoverable case worth its
    // own copy: the fix is to sign into the account that owns the subscription, not retry.
    const alreadyLinked = !!errorDetail?.includes('transaction_already_linked');
    return (
      <View style={[styles.container, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 }]}>
        <ScrollView
          contentContainerStyle={styles.errorScroll}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.errorIconWrap}>
            <View style={styles.errorHalo} />
            <View style={styles.errorIconArea}>
              <Text style={styles.errorGlyph}>!</Text>
            </View>
          </View>

          <Text style={styles.title}>
            {alreadyLinked ? 'Subscription already in use' : 'Something went wrong'}
          </Text>
          <Text style={styles.errorText}>
            {alreadyLinked
              ? 'This subscription is already linked to a different Remedy account. Log out and sign ' +
                'in with the account that purchased it to continue.'
              : "We couldn't finish setting up your program. Try again. If it keeps happening, " +
                'continue and restore your purchase from the plan screen.'}
          </Text>

          {showDebug &&
            (debugRevealed ? (
              <View style={styles.debugBox}>
                <Text style={styles.debugLabel}>Debug details</Text>
                <ScrollView style={styles.debugScroll} nestedScrollEnabled>
                  <Text style={styles.debugText} selectable>
                    {errorDetail}
                  </Text>
                </ScrollView>
              </View>
            ) : (
              <Pressable style={styles.debugToggle} onPress={() => setDebugRevealed(true)}>
                <Text style={styles.debugToggleText}>Show developer details</Text>
              </Pressable>
            ))}

          {alreadyLinked ? (
            <>
              {/* Retrying can't succeed — the fix is signing into the owning account. */}
              <Pressable style={styles.retryButton} onPress={() => void handleLogOut()}>
                <Text style={styles.retryText}>Log Out & Sign In</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => void leaveErrorScreen()}>
                <Text style={styles.secondaryText}>Continue</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                style={[styles.retryButton, !retryReady && styles.buttonDisabled]}
                disabled={!retryReady}
                onPress={() => {
                  setErrorDetail(null);
                  runGen.current += 1;
                  runAssignment();
                }}
              >
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
              {!preservePendingOnError && (
                <Pressable style={styles.secondaryButton} onPress={() => void leaveErrorScreen()}>
                  <Text style={styles.secondaryText}>Continue</Text>
                </Pressable>
              )}
              <Pressable style={styles.secondaryButton} onPress={() => void handleLogOut()}>
                <Text style={styles.secondaryText}>Log Out</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 }]}>
      <View style={styles.content}>
        <Animated.View style={[styles.logoWrap, { transform: [{ scale: pulseAnim }] }]}>
          <AppLogo size="md" />
        </Animated.View>
        <Text style={styles.appName}>Remedy</Text>
        <Text style={styles.title}>
          {isRetake ? 'Rebuilding your program' : 'Setting up your account'}
        </Text>
        <Text style={styles.subtitle}>
          {isRetake
            ? 'Updating your remaining weeks from your new answers. Completed sessions stay in your history.'
            : 'Getting everything ready for you. This only takes a moment.'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoWrap: {
    marginBottom: 20,
  },
  appName: {
    fontSize: 42,
    fontFamily: serifFont,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 20,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 10,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  steps: {
    width: '100%',
    gap: 14,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepCheck: {
    width: 16,
    fontSize: 15,
    fontWeight: '700',
    color: colors.textTertiary,
    textAlign: 'center',
  },
  stepCheckDone: {
    color: colors.primary,
  },
  stepText: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.textTertiary,
  },
  stepTextActive: {
    color: colors.textSecondary,
  },
  stepTextCurrent: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  errorScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 24,
  },
  errorIconWrap: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  errorHalo: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: radius.circle,
    backgroundColor: colors.secondaryMuted,
  },
  errorIconArea: {
    width: 72,
    height: 72,
    borderRadius: radius.circle,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.high,
    shadowColor: colors.secondary,
    shadowOpacity: 0.3,
  },
  errorGlyph: {
    fontSize: 40,
    lineHeight: 46,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  errorText: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  debugBox: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 28,
  },
  debugLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.secondary,
    marginBottom: 8,
  },
  debugScroll: {
    maxHeight: 180,
  },
  debugText: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textPrimary,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  debugToggle: {
    paddingVertical: 6,
    marginBottom: 22,
  },
  debugToggleText: {
    fontSize: 13,
    color: colors.textTertiary,
    textDecorationLine: 'underline',
  },
  retryButton: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.card,
    paddingVertical: 16,
    alignItems: 'center',
    ...shadows.medium,
    shadowColor: colors.primaryDeep,
    shadowOpacity: 0.25,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  secondaryButton: {
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  secondaryText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
});
