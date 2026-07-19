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
import { getLatestRemedyTransaction } from '../lib/iap';
import { extractInvokeError } from '../lib/functionsError';
import { trackEvent } from '../lib/analytics';
import { colors, serifFont } from '../constants/colors';
import { radius } from '../constants/spacing';
import { shadows } from '../constants/shadows';

type Phase = 'assigning' | 'done' | 'error';

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
  const { answers, endRetake, resetAnswers } = useOnboarding();
  const [phase, setPhase] = useState<Phase>('assigning');
  // Human-readable reason the assignment failed. Surfaced on the error screen (debug
  // box) so failures during testing are diagnosable without a device log stream.
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  // Debug box is shown to dev builds and dev-flagged accounts only — never to real
  // users in production, who just see the friendly copy + recovery buttons.
  const [isDev, setIsDev] = useState(false);
  const ran = useRef(false);
  // Guards against overlapping runs. Paired with `runGen`: when the 30s watchdog
  // fires (or the user leaves), we bump the generation so a still-running invoke
  // cannot navigate / flip phase after we've already recovered — and so "Try again"
  // is not deadlocked behind a hung `inFlight` flag.
  const inFlight = useRef(false);
  const runGen = useRef(0);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Route to the error screen while recording why. `reason` is developer-facing detail
  // (surfaced only in the debug box); `trackEvent` still fires so prod failures are
  // captured in analytics even though the user never sees the raw reason.
  function fail(reason: string) {
    setErrorDetail(reason);
    trackEvent('program_assign_failed', { reason });
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
    inFlight.current = false;
    await clearPendingPurchase();
    if (!user) {
      router.replace('/(onboarding)');
      return;
    }
    if (await hasActivePlanForUser(user.id)) {
      await refreshPremium();
      if (isRetake) endRetake();
      router.replace('/(tabs)');
      return;
    }
    const [entitled, dev] = await Promise.all([isPremium(user.id), isDevUser(user.id)]);
    if (!entitled && !dev) {
      await refreshPremium();
    }
    router.replace('/(onboarding)/match');
  }

  async function handleLogOut() {
    runGen.current += 1;
    inFlight.current = false;
    await signOut();
    router.replace('/(onboarding)');
  }

  // Post-signup handoff. A brand-new account created right after the paywall arrives
  // here with its answers only in OnboardingContext and (for a real purchase) an
  // unverified transaction stashed before sign-up. Persist the answers, verify the
  // pending purchase (or grant the dev trial), then refresh entitlement state. Skipped
  // gracefully for retakes and returning users (answers already saved, no pending tx).
  async function linkAccount() {
    if (!user) return;

    const parsedAnswers = onboardingAnswersInputSchema.safeParse(answers);
    if (parsedAnswers.success) {
      // Upsert (not insert-if-missing): a half-finished funnel can leave an incomplete
      // row that can't assign a program. When we have a complete set of answers in
      // context, write them through so the row is repaired rather than left broken.
      const { error: upsertError } = await supabase.from('onboarding_answers').upsert(
        { user_id: user.id, ...parsedAnswers.data },
        { onConflict: 'user_id' },
      );
      if (!upsertError) {
        // The DB row is now the source of truth; drop the crash-recovery copies.
        await clearStoredAnswers();
        await clearStoredProgress();
      }
    }

    const pending = await getPendingPurchase();
    const dev = await isDevUser(user.id);
    // A fresh install or interrupted handoff may have no AsyncStorage stash even
    // though StoreKit still has the subscription. Recover it before giving up.
    const purchase = pending ?? (!dev ? await getLatestRemedyTransaction() : null);
    if (purchase) {
      const { data, error } = await supabase.functions.invoke<{ success?: boolean; error?: string }>(
        'verify-purchase',
        {
          body: {
            transactionId: purchase.originalTransactionId,
            productId: purchase.productId,
            signedTransaction: purchase.jws,
          },
          headers: { 'Idempotency-Key': `verify_${user.id}_${purchase.originalTransactionId}` },
        },
      );
      if (error || !data?.success) {
        // Surface the server's real reason (e.g. transaction_not_found,
        // apple_credentials_missing, transaction_already_linked) instead of a generic
        // message — otherwise the error screen can't tell us what actually broke.
        const serverError = await extractInvokeError(data, error);
        if (dev) {
          // Dev / sandbox testers routinely hit non-fatal verify failures — e.g. a
          // sandbox subscription already bound to a previous test account
          // (transaction_already_linked) or a lapsed sandbox transaction
          // (transaction_expired; sandbox renews on a compressed clock). A dev user is
          // already treated as premium, so don't strand them on the error screen: grant
          // the dev trial and drop the stash so retries don't keep bouncing here.
          trackEvent('purchase_recovery_failed', { reason: serverError, dev: true });
          await supabase.functions.invoke('grant-dev-trial').catch(() => {});
          await clearPendingPurchase();
        } else if (pending) {
          // A real post-paywall handoff must not lose the transaction: throw so
          // runAssignment surfaces the retry UI and the stash stays available for
          // the next attempt. Include the reason + which product/transaction failed.
          throw new Error(
            `verify-purchase failed: ${serverError} ` +
              `(product=${purchase.productId}, hasJws=${!!purchase.jws})`,
          );
        } else {
          // Opportunistic StoreKit recovery only: the device transaction may belong to a
          // different account (transaction_already_linked) or be stale. Don't strand the
          // user on the error screen — fall through to the entitlement check, which routes
          // unentitled users back to the paywall where Restore is available.
          trackEvent('purchase_recovery_failed', { reason: serverError });
        }
      } else {
        trackEvent('purchase_verified');
        await clearPendingPurchase();
      }
    } else if (dev) {
      // Expo Go "dev trial": no StoreKit transaction, so create the entitlement row
      // server-side (best-effort — a dev user is already treated as premium).
      await supabase.functions.invoke('grant-dev-trial').catch(() => {});
    }

    await refreshPremium();
  }

  async function runAssignment() {
    if (!user || inFlight.current) return;
    const gen = ++runGen.current;
    inFlight.current = true;
    setPhase('assigning');
    try {
      await linkAccount();
      if (gen !== runGen.current) return;

      // Only entitled users build a plan. If somehow not entitled (e.g. a missed
      // transaction), send them back to the paywall rather than stranding them here.
      const [entitled, dev] = await Promise.all([isPremium(user.id), isDevUser(user.id)]);
      if (gen !== runGen.current) return;
      if (!entitled && !dev) {
        await refreshPremium();
        router.replace('/(onboarding)/match');
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
        const programDone =
          activePlanWeeks !== null && (up?.current_week ?? 1) > activePlanWeeks;
        const startWeek = isRetake
          ? programDone
            ? 1
            : Math.max(1, up?.current_week ?? 1)
          : undefined;
        const { data, error } = await supabase.functions.invoke('assign-program', {
          body: { user_id: user.id, ...(startWeek ? { start_week: startWeek } : {}) },
        });
        if (gen !== runGen.current) return;
        const parsed = assignResultSchema.safeParse(data);
        if (error || !parsed.success) {
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
              router.replace('/(onboarding)');
              return;
            }
            const invokeMsg = error instanceof Error ? error.message : error ? String(error) : null;
            const zodMsg = !parsed.success ? parsed.error.issues.map((i) => i.message).join('; ') : null;
            const dataPreview = (() => {
              try {
                return JSON.stringify(data)?.slice(0, 400);
              } catch {
                return String(data);
              }
            })();
            fail(
              `assign-program failed. invoke error: ${invokeMsg ?? 'none'}. ` +
                `response parse: ${zodMsg ?? 'ok'}. response: ${dataPreview ?? 'null'}`,
            );
            return;
          }
        } else {
          trackEvent('program_assigned', {
            program_name: parsed.data.program_name,
            duration_weeks: parsed.data.duration_weeks,
            sessions_per_week: parsed.data.sessions_per_week,
            equipment_tier: parsed.data.equipment_tier,
            retake: isRetake,
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
      fail(detail);
    } finally {
      if (gen === runGen.current) {
        inFlight.current = false;
      }
    }
  }

  useEffect(() => {
    if (ran.current || !user) return;
    ran.current = true;
    runAssignment();
  }, [user]);

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
      runGen.current += 1;
      inFlight.current = false;
      fail('Timed out after 30s — setup did not complete (linkAccount / verify-purchase / assign-program hung).');
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
              : "We couldn't finish setting up your program. Try again — if it keeps happening, " +
                'continue and restore your purchase from the plan screen.'}
          </Text>

          {showDebug && (
            <View style={styles.debugBox}>
              <Text style={styles.debugLabel}>Debug details</Text>
              <ScrollView style={styles.debugScroll} nestedScrollEnabled>
                <Text style={styles.debugText} selectable>
                  {errorDetail}
                </Text>
              </ScrollView>
            </View>
          )}

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
                style={styles.retryButton}
                onPress={() => {
                  setErrorDetail(null);
                  runGen.current += 1;
                  inFlight.current = false;
                  runAssignment();
                }}
              >
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => void leaveErrorScreen()}>
                <Text style={styles.secondaryText}>Continue</Text>
              </Pressable>
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
        <Animated.View style={[styles.iconWrap, { transform: [{ scale: pulseAnim }] }]}>
          <View style={styles.iconHalo} />
          <View style={styles.iconArea}>
            <Text style={styles.icon}>◎</Text>
          </View>
        </Animated.View>

        <Text style={styles.title}>Setting up your account</Text>
        <Text style={styles.subtitle}>
          Getting everything ready for you. This only takes a moment.
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
  iconWrap: {
    width: 104,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  iconHalo: {
    position: 'absolute',
    width: 104,
    height: 104,
    borderRadius: radius.circle,
    backgroundColor: colors.primaryMuted,
  },
  iconArea: {
    width: 80,
    height: 80,
    borderRadius: radius.circle,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.high,
    shadowColor: colors.primaryDeep,
    shadowOpacity: 0.3,
    marginBottom: 24,
  },
  icon: {
    fontSize: 36,
    color: '#FFFFFF',
  },
  title: {
    fontSize: 26,
    fontFamily: serifFont,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
    letterSpacing: -0.3,
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
