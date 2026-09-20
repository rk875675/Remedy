import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams, useNavigation, Stack } from 'expo-router';
import { CommonActions } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedTagline } from '../../components/onboarding/AnimatedTagline';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { useAuth } from '../../context/AuthContext';
import { usePremium } from '../../context/PremiumContext';
import {
  usePlacement,
  useUser,
  useSuperwallEvents,
  SUPERWALL_AVAILABLE,
  setSuperwallSubscriptionInactive,
  dismissSuperwall,
} from '../../lib/superwall';
import { PromoCodeSheet } from '../../components/PromoCodeSheet';
import { supabase } from '../../lib/supabase';
import { getPendingPurchase, setPendingPurchase } from '../../lib/pendingPurchase';
import { getLatestRemedyTransaction, restoreRemedyTransaction } from '../../lib/iap';
import { extractInvokeError } from '../../lib/functionsError';
import { setPersonProperties } from '../../lib/analytics';
import {
  onboardingCompleted,
  onboardingPlanPreviewed,
  onboardingValidationFailed,
} from '../../lib/analytics/events/onboarding';
import {
  paywallDismissed,
  paywallPresented,
  paywallViewed,
  purchaseConfirmationFailed,
  purchaseFailed,
  purchaseFlowCompleted,
  purchaseStarted,
  restoreFailed,
  restoreStarted,
  restoreSucceeded,
} from '../../lib/analytics/events/monetization';
import {
  toPlanInterval,
  toProductId,
  toRestoreReason,
} from '../../lib/analytics/purchaseErrors';
import { openLegalDocument } from '../../lib/legalLinks';
import { onboardingFunnelDurationMs } from '../../lib/analytics/onboardingSteps';
import { colors, serifFont } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { type OnboardingAnswersInput, type PlanPreview } from '../../lib/schemas';
import {
  answersPreviewKey,
  loadPlanPreview,
  parseCompleteAnswers,
  peekPlanPreview,
} from '../../lib/planPreview';
import type { OnboardingAnswers } from '../../types/database';
import { outcomeTagline } from '../../constants/mindset';

/** Client-side default shown when the preview edge function doesn't answer. */
const FALLBACK_WEEKS = 8;
const FALLBACK_TAGLINE = 'A plan built from your answers.';

type RequiredAnswers = OnboardingAnswersInput;
type MainGoalValue = 'reduce_pain' | 'return_to_exercise' | 'sleep' | 'mobility';
type PainTriggerValue = 'sitting' | 'bending' | 'standing' | 'morning' | 'exercise' | 'other';

const AREA_TITLE: Record<OnboardingAnswers['pain_location'], string> = {
  upper: 'Upper Back',
  lower: 'Lower Back',
  all: 'Full Back',
};
const GOAL_TITLE: Record<MainGoalValue, string> = {
  reduce_pain: 'Pain Relief',
  return_to_exercise: 'Strength & Return',
  sleep: 'Recovery',
  mobility: 'Mobility',
};

function triggerBullet(trigger: PainTriggerValue): string {
  switch (trigger) {
    case 'sitting':
      return 'Targets tight hips and posture from prolonged sitting';
    case 'bending':
      return 'Teaches safe hip-hinge mechanics for bending';
    case 'standing':
      return 'Builds postural endurance for time on your feet';
    case 'morning':
      return 'Eases morning stiffness with gentle early mobility';
    case 'exercise':
      return 'Gradually rebuilds your tolerance for activity';
    case 'other':
      return 'Adapts to the specific movements that aggravate your back';
  }
}

function equipmentNote(equipment: OnboardingAnswers['equipment']): string {
  switch (equipment) {
    case 'open_space':
      return 'Uses just your bodyweight, no equipment needed';
    case 'bands_dumbbells':
      return 'Built around your bands and dumbbells';
    case 'gym':
      return 'Takes full advantage of your gym access';
    default:
      return '';
  }
}

function focusPhrase(location: string | null | undefined): string {
  switch (location) {
    case 'upper':
      return 'upper back';
    case 'lower':
      return 'lower back';
    case 'all':
      return 'your whole back';
    default:
      return location && location.length > 0 ? location : 'your lifestyle';
  }
}

const previewedEventKeys = new Set<string>();
const paywallViewedKeys = new Set<string>();

function reportPlanPreview(properties: Parameters<typeof onboardingPlanPreviewed>[0]): void {
  const key = [
    properties.preview_source,
    properties.duration_weeks,
    properties.sessions_per_week,
    properties.primary_focus ?? '',
    properties.equipment_tier ?? '',
  ].join(':');
  if (previewedEventKeys.has(key)) return;
  previewedEventKeys.add(key);
  onboardingPlanPreviewed(properties);
}

export default function MatchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { answers, retaking } = useOnboarding();
  const { user } = useAuth();
  const { refreshPremium } = usePremium();
  const { identify } = useUser();
  const [loading, setLoading] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Memoized on `answers` (stable useState value) because `parseCompleteAnswers`
  // returns a fresh Zod-parsed object every call. Without this the preview effect
  // below, which depends on `complete` and calls setPreview(), re-ran on every
  // render and looped: it re-invoked assign-program roughly 1.4×/second.
  const complete = useMemo(() => parseCompleteAnswers(answers), [answers]);
  const peekedPreview = complete ? peekPlanPreview(complete) : null;
  const [preview, setPreview] = useState<PlanPreview | null>(
    peekedPreview?.ok ? peekedPreview.data : null,
  );
  const [previewSettled, setPreviewSettled] = useState(peekedPreview !== null);
  // Existing assigned plan — used when a lapsed user has no in-memory quiz
  // answers (cleared after first onboarding) so Your Program still shows
  // their real name / duration instead of the generic fallback.
  const [savedPlan, setSavedPlan] = useState<{
    program_name: string;
    subtitle: string | null;
    tagline: string | null;
    duration_weeks: number;
    sessions_per_week: number;
    primary_focus: string | null;
  } | null>(null);
  const [savedAnswers, setSavedAnswers] = useState<{
    pain_location: OnboardingAnswers['pain_location'];
    pain_trigger: OnboardingAnswers['pain_trigger'];
    equipment: OnboardingAnswers['equipment'];
  } | null>(null);
  // Full-screen overlay label shown while post-paywall StoreKit/server work runs
  // (confirming a purchase, checking restorable transactions). Without it the async
  // gap between Superwall dismissing and navigation looks like the app froze.
  const [busy, setBusy] = useState<string | null>(null);
  // "Have a code?" promo sheet (backend creator codes + Apple offer-code fallback).
  const [promoVisible, setPromoVisible] = useState(false);

  // Lapsed subscriber: Continue opens Superwall, back goes to Welcome (sign in / out).
  const { lapsed } = useLocalSearchParams<{ lapsed?: string }>();
  const isLapsed = lapsed === '1';
  // Already-onboarded reconvert: same skip-quiz behavior even if the param is
  // missing (e.g. an older building-plan redirect to /(onboarding)/match).
  const isReconvert = isLapsed || (!!user && !retaking && !complete);

  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  // replace() onto match leaves it alone in the stack — iOS swipe-back is a no-op.
  // Put Welcome underneath so the only back target is sign in / sign out.
  const navigation = useNavigation();
  useEffect(() => {
    if (!isReconvert) return;
    if (navigation.canGoBack()) return;
    navigation.dispatch(
      CommonActions.reset({
        index: 1,
        routes: [
          { name: 'index' },
          { name: 'match', params: { lapsed: '1' } },
        ],
      }),
    );
  }, [isReconvert, navigation]);

  useEffect(() => {
    if (!isReconvert || !user) return;
    let cancelled = false;
    void (async () => {
      const [{ data: up }, { data: answersRow }] = await Promise.all([
        supabase
          .from('user_programs')
          .select('active_plan_id')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('onboarding_answers')
          .select('pain_location, pain_trigger, equipment')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      if (answersRow) {
        setSavedAnswers(answersRow);
      }
      if (!up?.active_plan_id) return;
      const { data: plan } = await supabase
        .from('user_program_plans')
        .select('program_name, subtitle, tagline, duration_weeks, sessions_per_week, primary_focus')
        .eq('id', up.active_plan_id)
        .maybeSingle();
      if (plan && !cancelled) {
        setSavedPlan(plan);
        setPreviewSettled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isReconvert, user]);

  useEffect(() => {
    if (retaking) return;
    // Superwall remounts this screen. One viewed per placement+entry per JS session.
    const entry_point = user ? 'reconvert' : 'onboarding';
    const key = `onboarding_paywall:${entry_point}`;
    if (paywallViewedKeys.has(key)) return;
    paywallViewedKeys.add(key);
    paywallViewed({
      placement: 'onboarding_paywall',
      entry_point,
      is_superwall_available: SUPERWALL_AVAILABLE,
    });
  }, []);

  // Server-consistent preview. The Promise is cached on the answers fingerprint so
  // a Superwall remount does not start a second assign-program call.
  useEffect(() => {
    if (!complete) return;
    let cancelled = false;
    const answers = complete;
    loadPlanPreview(complete).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setPreview(result.data);
        setPreviewSettled(true);
        reportPlanPreview({
          preview_source: 'server',
          duration_weeks: result.data.duration_weeks,
          sessions_per_week: result.data.sessions_per_week,
          ...(result.data.primary_focus === undefined
            ? {}
            : { primary_focus: result.data.primary_focus }),
          ...(result.data.equipment_tier === undefined
            ? {}
            : { equipment_tier: result.data.equipment_tier }),
        });
        return;
      }
      setPreviewSettled(true);
      reportPlanPreview({
        preview_source: 'fallback',
        duration_weeks: FALLBACK_WEEKS,
        sessions_per_week: answers.sessions_per_week_preference,
        equipment_tier: answers.equipment,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [complete]);

  // Fallback capture from Superwall's transactionComplete event.
  const lastTransaction = useRef<{ originalTransactionId: string; productId: string } | null>(null);

  // Superwall can notice the same purchase through BOTH the dismiss callback
  // (result.type 'purchased'/'restored') and the feature gate. Each path stashes
  // the transaction and navigates to sign-up — running both produced two rapid
  // router.replace calls to the same screen (the visible "double flash"). First
  // path in wins; the other becomes a no-op.
  const purchaseNavigated = useRef(false);

  // Superwall's experiment arm. Held so purchase events carry the variant that
  // produced them, and set as a person property so arms can be analyzed against
  // retention rather than only against immediate conversion.
  const paywallVariant = useRef<{ variantId?: string; experimentId?: string }>({});
  // Continue is an explicit checkout CTA. Superwall can skip (stale entitlements,
  // no audience match) and then `feature()` no-ops — looking like a dead button.
  // One forced re-present after clearing Superwall's subscription status.
  const forcePresentAttempted = useRef(false);
  const recoveringSkip = useRef(false);

  useSuperwallEvents({
    // "Have a code?" element on the Superwall paywall (custom action
    // `redeem_promo_code`). The paywall must be dismissed first — an RN Modal
    // renders behind Superwall's native view controller.
    onCustomPaywallAction: (name) => {
      if (name !== 'redeem_promo_code') return;
      void (async () => {
        await dismissSuperwall();
        if (mounted.current) setPromoVisible(true);
      })();
    },
    onPaywallPresent: (paywallInfo) => {
      forcePresentAttempted.current = false;
      const experiment = paywallInfo.experiment;
      paywallVariant.current = {
        variantId: experiment?.variant.id,
        experimentId: experiment?.id,
      };
      paywallPresented({
        placement: 'onboarding_paywall',
        paywall_name: paywallInfo.name,
        ...(experiment === undefined
          ? {}
          : {
              paywall_variant_id: experiment.variant.id,
              paywall_experiment_id: experiment.id,
            }),
      });
      if (experiment !== undefined) {
        setPersonProperties({
          paywall_variant_id: experiment.variant.id,
          paywall_experiment_id: experiment.id,
        });
      }
    },
    onSuperwallEvent: ({ event }) => {
      switch (event.event) {
        case 'transactionStart':
          purchaseStarted({
            product_id: toProductId(event.product.productIdentifier),
            placement: 'onboarding_paywall',
            ...(paywallVariant.current.variantId === undefined
              ? {}
              : { paywall_variant_id: paywallVariant.current.variantId }),
          });
          break;
        case 'transactionFail':
          // event.error is a raw SDK string — classified, never sent.
          purchaseFailed({ reason: 'declined' });
          break;
        case 'transactionAbandon':
          purchaseFailed({
            reason: 'cancelled',
            product_id: toProductId(event.product.productIdentifier),
          });
          break;
        case 'transactionComplete': {
          const originalId = event.transaction?.originalTransactionIdentifier;
          const productId = event.product?.productIdentifier;
          if (originalId && productId) {
            lastTransaction.current = { originalTransactionId: originalId, productId };
          }
          // Raise the overlay NOW, while Superwall's paywall still covers the
          // screen — by the time its dismiss animation reveals this screen the
          // overlay is already painted, instead of match flashing bare for a
          // frame before handlePurchased's own setBusy commits.
          setBusy('Confirming your purchase…');
          break;
        }
        default:
          break;
      }
    },
  });

  /**
   * The confirmation paths below are deliberately redundant — Superwall's dismiss callback
   * and its feature gate can both notice the same purchase, and that redundancy is what
   * keeps a paid user from falling through. The *event*, though, means "a purchase flow
   * completed", so it must fire once per transaction rather than once per path that
   * spotted it. Keyed on the transaction id, not a mount-scoped flag, so a genuine second
   * purchase attempt still reports.
   */
  const reportedPurchase = useRef<string | null>(null);
  function reportPurchaseFlowCompleted(
    transactionId: string | null,
    payload: Parameters<typeof purchaseFlowCompleted>[0],
  ) {
    if (transactionId !== null && reportedPurchase.current === transactionId) return;
    reportedPurchase.current = transactionId;
    purchaseFlowCompleted(payload);
  }

  // Stash the pending transaction then hand off to whichever screen actually
  // verifies it. Anonymous users go through sign-up (no account yet); an already
  // authed user (e.g. a lapsed subscriber re-converting from this same screen) has
  // no sign-up step to run — sending them to sign-in?mode=signup left them bounced
  // back here by the root guard with the purchase never verified. building-plan
  // reads the stashed transaction and calls verify-purchase directly.
  async function handlePurchased() {
    if (purchaseNavigated.current) return;
    purchaseNavigated.current = true;
    setBusy('Confirming your purchase…');
    const iapTx = await getLatestRemedyTransaction();
    let source: 'storekit' | 'superwall_event';
    if (iapTx) {
      await setPendingPurchase(iapTx);
      source = 'storekit';
    } else if (lastTransaction.current) {
      await setPendingPurchase({ ...lastTransaction.current, jws: null });
      source = 'superwall_event';
    } else {
      showPurchaseConfirmationError('no_transaction', 'purchase');
      return;
    }
    if (!(await getPendingPurchase())) {
      showPurchaseConfirmationError('stash_failed', 'purchase');
      return;
    }
    const stashedProduct = iapTx?.productId ?? lastTransaction.current?.productId;
    reportPurchaseFlowCompleted(
      iapTx?.originalTransactionId ?? lastTransaction.current?.originalTransactionId ?? null,
      {
        product_id: toProductId(stashedProduct),
        plan_interval: toPlanInterval(stashedProduct),
        is_authenticated: user !== null,
        transaction_source: source,
        ...(paywallVariant.current.variantId === undefined
          ? {}
          : { paywall_variant_id: paywallVariant.current.variantId }),
      },
    );
    if (user) {
      router.replace('/building-plan');
      return;
    }
    // No dedicated sign-up screen exists; sign-in.tsx is the combined auth entry
    // (Apple / Google / email) that creates a new account for first-time users.
    router.replace('/(auth)/sign-in?mode=signup');
  }

  const { registerPlacement } = usePlacement({
    onDismiss: async (_info, result) => {
      paywallDismissed({
        placement: 'onboarding_paywall',
        result_type: result.type,
        ...(paywallVariant.current.variantId === undefined
          ? {}
          : { paywall_variant_id: paywallVariant.current.variantId }),
      });
      if (result.type === 'purchased' || result.type === 'restored') {
        await handlePurchased();
      } else {
        // transactionComplete may have raised the busy overlay preemptively;
        // a dismiss without a purchase result must not leave it stuck.
        if (mounted.current) setBusy(null);
      }
    },
    onSkip: (reason) => {
      paywallDismissed({
        placement: 'onboarding_paywall',
        result_type: 'no_paywall',
        ...(paywallVariant.current.variantId === undefined
          ? {}
          : { paywall_variant_id: paywallVariant.current.variantId }),
      });
      if (__DEV__) console.log('[superwall] skipped', reason);
      void recoverFromSkippedPaywall();
    },
    onError: (err) => {
      // Superwall config/network noise must not stop the funnel. Real purchase
      // failures have their own confirmation alerts.
      if (__DEV__) console.log('[superwall] onError', err);
      if (mounted.current) {
        Alert.alert('Could not open checkout', 'Please try again.');
      }
    },
  });

  useEffect(() => {
    if (user && SUPERWALL_AVAILABLE) {
      identify(user.id, { restorePaywallAssignments: true });
    }
  }, [user]);

  // Superwall calls `feature()` when it decides the paywall shouldn't be shown at
  // all (recognized subscriber, holdout group, etc.) — no purchase UI ran, so
  // nothing was stashed for building-plan to verify. Treat it the same as a
  // restore: check StoreKit for a real transaction before granting access, same
  // as handlePurchased/handleRestore. Never route into the app on Superwall's say
  // alone — building-plan (or the root guard, if none is found) still requires a
  // server-verified entitlement.
  async function handleFeatureAccess() {
    if (purchaseNavigated.current) return;
    purchaseNavigated.current = true;
    setBusy('Confirming your purchase…');
    const tx = await getLatestRemedyTransaction();
    if (!tx) {
      // feature() fires for holdouts, dismissed paywalls (exit survey closed),
      // and existing subscribers — not only for completed purchases. No StoreKit
      // transaction means the user hasn't subscribed; silently release the guard
      // so they stay on this screen. Only show the "Purchase not confirmed" error
      // when we know a purchase was actually attempted (onDismiss result.type =
      // 'purchased') but we can't find the receipt.
      purchaseNavigated.current = false;
      if (mounted.current) setBusy(null);
      return;
    }
    await setPendingPurchase(tx);
    if (!(await getPendingPurchase())) {
      showPurchaseConfirmationError('stash_failed', 'feature_gate');
      return;
    }
    reportPurchaseFlowCompleted(tx.originalTransactionId, {
      product_id: toProductId(tx.productId),
      plan_interval: toPlanInterval(tx.productId),
      is_authenticated: user !== null,
      transaction_source: 'feature_gate',
      ...(paywallVariant.current.variantId === undefined
        ? {}
        : { paywall_variant_id: paywallVariant.current.variantId }),
    });
    if (user) {
      router.replace('/building-plan');
      return;
    }
    router.replace('/(auth)/sign-in?mode=signup');
  }

  async function recoverFromSkippedPaywall() {
    if (recoveringSkip.current) return;
    recoveringSkip.current = true;
    try {
      const tx = await getLatestRemedyTransaction();
      if (tx) {
        await handleFeatureAccess();
        return;
      }
      if (forcePresentAttempted.current) {
        if (mounted.current) {
          Alert.alert(
            'Could not open checkout',
            'Please try again. If you already have a subscription, tap Restore Purchases.',
          );
        }
        return;
      }
      forcePresentAttempted.current = true;
      await handleShowPaywall({ forceInactive: true });
    } finally {
      recoveringSkip.current = false;
    }
  }

  async function handleShowPaywall(options?: { forceInactive?: boolean }) {
    if (!SUPERWALL_AVAILABLE) {
      // Expo Go has no native StoreKit/Superwall modules. Keep this explicit and
      // development-only so a production module failure cannot bypass the paywall.
      // A signed-in lapsed user must NOT be sent to sign-in — that looks like a
      // sign-out and would force them through onboarding again.
      if (__DEV__ && !user) {
        router.replace('/(auth)/sign-in?mode=signup');
      } else {
        Alert.alert('Purchases unavailable', 'Purchases are unavailable right now. Please try again later.');
      }
      return;
    }
    if (options?.forceInactive || isReconvert) {
      await setSuperwallSubscriptionInactive();
    }
    setPresenting(true);
    try {
      let trigger = complete?.pain_trigger[0] ?? savedAnswers?.pain_trigger[0];
      let equipment = complete?.equipment ?? savedAnswers?.equipment;
      let focus =
        complete?.pain_location ??
        preview?.primary_focus ??
        savedPlan?.primary_focus ??
        savedAnswers?.pain_location;
      // Lapsed users have no in-memory quiz. Load the saved answers before
      // presenting so Superwall never gets empty personalized-focus params.
      if (user && (!trigger || !equipment || !focus)) {
        const { data: answersRow } = await supabase
          .from('onboarding_answers')
          .select('pain_location, pain_trigger, equipment')
          .eq('user_id', user.id)
          .maybeSingle();
        if (answersRow) {
          trigger = trigger ?? answersRow.pain_trigger[0];
          equipment = equipment ?? answersRow.equipment;
          focus = focus ?? answersRow.pain_location;
        }
      }
      // Superwall assigns the current vs personalized paywall variant by percentage
      // within the single onboarding_paywall campaign. Both variants receive the same
      // preview data, while every user sees this same native program screen beforehand.
      await registerPlacement({
        placement: 'onboarding_paywall',
        params: {
          program_name: programName,
          subtitle: subtitle ?? '',
          tagline,
          duration_weeks: weeks,
          sessions_per_week: perWeek,
          minutes_per_session: minutes,
          primary_focus: focusPhrase(focus),
          trigger_note: trigger ? triggerBullet(trigger) : triggerBullet('other'),
          equipment_note: equipment ? equipmentNote(equipment) : equipmentNote('open_space'),
        },
        feature() {
          void handleFeatureAccess();
        },
      });
    } catch (err) {
      if (__DEV__) console.log('[superwall] register failed', err);
      if (mounted.current) {
        Alert.alert('Could not open checkout', 'Please try again.');
      }
    } finally {
      if (mounted.current) setPresenting(false);
    }
  }

  async function handleRestore() {
    restoreStarted({ source_screen: 'match', is_authenticated: user !== null });
    if (!user) {
      setLoading(true);
      setBusy('Checking your purchases…');
      try {
        // Full restore sync (not just the cached transaction query): on a fresh
        // install StoreKit has nothing cached until restorePurchases() runs.
        const tx = await restoreRemedyTransaction();
        if (!tx) {
          restoreFailed({ source_screen: 'match', reason: 'no_transaction' });
          if (mounted.current) setBusy(null);
          Alert.alert('Restore Purchases', 'No purchases found to restore.');
          return;
        }
        await setPendingPurchase(tx);
        if (!(await getPendingPurchase())) {
          restoreFailed({ source_screen: 'match', reason: 'unknown' });
          if (mounted.current) setBusy(null);
          Alert.alert('Restore Purchases', 'Could not save the restored purchase. Please try again.');
          return;
        }
        restoreSucceeded({ source_screen: 'match', product_id: toProductId(tx.productId) });
        router.replace('/(auth)/sign-in?mode=signup');
      } finally {
        if (mounted.current) setLoading(false);
      }
      return;
    }
    setLoading(true);
    try {
      const tx = await restoreRemedyTransaction();
      if (!tx) {
        restoreFailed({ source_screen: 'match', reason: 'no_transaction' });
        Alert.alert('Restore', 'No active subscription found.');
        return;
      }
      const { data, error } = await supabase.functions.invoke<{ success?: boolean; error?: string }>(
        'restore-purchases',
        {
          body: {
            originalTransactionId: tx.originalTransactionId,
            signedTransaction: tx.jws,
          },
          headers: { 'Idempotency-Key': `restore_${user.id}_${tx.originalTransactionId}` },
        },
      );
      if (data?.success) {
        restoreSucceeded({ source_screen: 'match', product_id: toProductId(tx.productId) });
        await refreshPremium();
        router.replace('/building-plan');
        return;
      }
      // Distinguish "belongs to another account" from "nothing to restore" — restoring
      // onto a second account is refused (anti-fraud), and telling the user there's no
      // subscription would be both wrong and confusing.
      const reason = await extractInvokeError(data, error);
      restoreFailed({ source_screen: 'match', reason: toRestoreReason(reason) });
      if (reason === 'transaction_already_linked') {
        Alert.alert(
          'Subscription already in use',
          'This subscription is linked to a different Remedy account. Sign in with the account ' +
            'that purchased it to restore access.',
        );
      } else {
        Alert.alert('Restore', 'No active subscription found.');
      }
    } catch {
      restoreFailed({ source_screen: 'match', reason: 'network' });
      Alert.alert('Restore', 'Could not restore purchases. Try again later.');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }

  function showPurchaseConfirmationError(
    reason: 'no_transaction' | 'stash_failed',
    source: 'purchase' | 'feature_gate',
  ) {
    // The user paid and we could not hold onto the receipt.
    // Release the navigation guard: no navigation happened, and the retry
    // (Restore Purchases, or Superwall's other confirmation path) must be
    // allowed through.
    purchaseNavigated.current = false;
    if (mounted.current) setBusy(null);
    purchaseConfirmationFailed({ reason, source });
    Alert.alert(
      'Purchase not confirmed',
      "We couldn't confirm your purchase. Please restore purchases and try again.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore Purchases', onPress: () => void handleRestore() },
      ],
    );
  }

  async function handleStart() {
    try {
      if (!complete) {
        // Lapsed / already-onboarded users don't have pending context answers
        // (cleared after first onboarding). Skip validation and open the paywall
        // — they must not be sent back through the quiz to resubscribe.
        if (isReconvert) {
          await handleShowPaywall({ forceInactive: true });
          return;
        }
        onboardingValidationFailed({
          reason: 'incomplete_answers',
          missing_field_count: countMissingAnswers(answers),
        });
        setError('Please complete all onboarding questions.');
        return;
      }

      // Retake: an authed, premium user is regenerating their plan. The answers row
      // already exists — update it, then rebuild from the next incomplete week (no
      // paywall). This is the only path that requires an active session.
      if (retaking) {
        if (!user) {
          onboardingValidationFailed({ reason: 'session_expired', missing_field_count: 0 });
          setError('Your session expired. Please sign in again.');
          return;
        }
        setLoading(true);
        setError(null);

        const { error: updateError } = await supabase
          .from('onboarding_answers')
          .update({ ...complete })
          .eq('user_id', user.id);
        if (updateError) {
          setError(updateError.message);
          setLoading(false);
          return;
        }
        reportOnboardingCompleted(complete, true);
        // Keep `retaking` raised until building-plan finishes the re-assignment. Ending it
        // here raced the root guard: with the flag down but segments still in (onboarding),
        // the guard could bounce the user to the tabs before building-plan mounted — the
        // answers were saved but the program was never rebuilt.
        router.replace('/building-plan?retake=1');
        return;
      }

      // First time: no account yet. Track completion then show the paywall inline.
      // Sign-up (and answer persistence) happens after purchase per PRD §5–§6.1.
      // A lapsed reconvert who still has complete answers in context skips the
      // completion event and just re-opens checkout.
      if (!isReconvert) {
        reportOnboardingCompleted(complete, false);
      }

      await handleShowPaywall(isReconvert ? { forceInactive: true } : undefined);
    } catch (err) {
      if (__DEV__) console.log('[match] handleStart failed', err);
      if (mounted.current) {
        Alert.alert('Could not continue', 'Please try again.');
      }
    }
  }

  // Display values: prefer the server preview, fall back to sensible defaults.
  // Always name off the primary (first-selected) goal — mirrors the server's
  // buildNaming, and stays consistent with the tagline below (also primary-goal-based).
  const programName =
    preview?.program_name ??
    savedPlan?.program_name ??
    (complete
      ? `${AREA_TITLE[complete.pain_location]} ${GOAL_TITLE[complete.main_goal[0]]} Program`
      : 'Your Program');
  const subtitle =
    preview?.subtitle ??
    savedPlan?.subtitle ??
    (complete?.equipment === 'open_space' ? 'Bodyweight' : null);
  const primaryGoal = complete?.main_goal[0];
  const tagline =
    complete && primaryGoal
      ? outcomeTagline(primaryGoal, complete.activity_level)
      : previewSettled
        ? (preview?.tagline ?? savedPlan?.tagline ?? FALLBACK_TAGLINE)
        : null;
  const weeks = preview?.duration_weeks ?? savedPlan?.duration_weeks ?? FALLBACK_WEEKS;
  const perWeek =
    preview?.sessions_per_week ??
    savedPlan?.sessions_per_week ??
    complete?.sessions_per_week_preference ??
    3;
  const minutes = avgMinutes(preview) ?? 20;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 8 }]}>
      <Stack.Screen options={{ gestureEnabled: true, headerShown: false }} />
      <View style={styles.body}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Text style={styles.eyebrow}>{retaking ? 'YOUR UPDATED PROGRAM' : isReconvert ? 'RESUME YOUR PROGRAM' : 'YOUR PROGRAM'}</Text>

          <Text style={styles.programName} numberOfLines={3}>
            {programName}
          </Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

          {tagline ? (
            <AnimatedTagline
              text={tagline}
              revealKey={complete ? answersPreviewKey(complete) : 'incomplete'}
            />
          ) : (
            <View style={styles.taglineSlot} />
          )}

          {!SUPERWALL_AVAILABLE && !retaking && (
            <View style={styles.devBanner}>
              <Text style={styles.devText}>
                Expo Go: Superwall unavailable. Tap below to skip with a dev trial.
              </Text>
            </View>
          )}

          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>

        <View style={styles.footer}>
          <ContinueButton
            label={retaking ? 'Update My Program' : 'Continue'}
            onPress={() => { void handleStart(); }}
            disabled={loading || presenting}
          />
          {!retaking && (
            <Text style={styles.restore} onPress={handleRestore}>
              Restore Purchases
            </Text>
          )}
          <View style={styles.legalRow}>
            <Text
              style={styles.legal}
              onPress={() => openLegalDocument('terms', 'match')}
            >
              Terms of Use
            </Text>
            <Text style={styles.legalDivider}>·</Text>
            <Text
              style={styles.legal}
              onPress={() => openLegalDocument('privacy', 'match')}
            >
              Privacy Policy
            </Text>
          </View>
        </View>
      </View>

      {busy !== null && (
        <View style={styles.busyOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.busyText}>{busy}</Text>
        </View>
      )}

      <PromoCodeSheet
        visible={promoVisible}
        onClose={() => setPromoVisible(false)}
        // Same handoff as a successful restore: building-plan persists answers and
        // routes into the app once the entitlement is confirmed.
        onAccessGranted={() => router.replace('/building-plan')}
      />
    </View>
  );
}

/** The eight fields onboardingAnswersInputSchema requires, in one place. */
const REQUIRED_ANSWER_FIELDS = [
  'pain_location',
  'pain_duration',
  'pain_type',
  'activity_level',
  'pain_trigger',
  'equipment',
  'main_goal',
  'sessions_per_week_preference',
] as const;

function countMissingAnswers(answers: Partial<OnboardingAnswers>): number {
  return REQUIRED_ANSWER_FIELDS.filter((field) => {
    const value = answers[field];
    if (value === undefined || value === null) return true;
    return Array.isArray(value) && value.length === 0;
  }).length;
}

/**
 * Emits the completion event and mirrors the answer profile onto the person.
 *
 * Sends the primary goal plus counts rather than the raw arrays: it keeps every
 * property a bounded breakdown dimension, and means a future free-text question
 * cannot leak into analytics by being spread into this payload.
 */
function reportOnboardingCompleted(answers: RequiredAnswers, isRetake: boolean): void {
  const timeInFunnelMs = onboardingFunnelDurationMs();
  onboardingCompleted({
    pain_location: answers.pain_location,
    pain_duration: answers.pain_duration,
    activity_level: answers.activity_level,
    equipment_tier: answers.equipment,
    primary_goal: answers.main_goal[0],
    pain_type_count: answers.pain_type.length,
    pain_trigger_count: answers.pain_trigger.length,
    goal_count: answers.main_goal.length,
    sessions_per_week_preference: answers.sessions_per_week_preference,
    is_retake: isRetake,
    ...(timeInFunnelMs === undefined ? {} : { time_in_funnel_ms: timeInFunnelMs }),
  });

  setPersonProperties({
    pain_location: answers.pain_location,
    pain_duration: answers.pain_duration,
    activity_level: answers.activity_level,
    equipment_tier: answers.equipment,
    primary_goal: answers.main_goal[0],
    sessions_per_week_preference: answers.sessions_per_week_preference,
  });
}


function avgMinutes(preview: PlanPreview | null): number | null {
  if (!preview?.week_one?.length) return null;
  const total = preview.week_one.reduce((sum, s) => sum + (s.estimated_minutes ?? 0), 0);
  const avg = Math.round(total / preview.week_one.length);
  return avg > 0 ? avg : null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
  },
  body: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  // Centered flex layout: the short content block floats in the middle of the
  // available space above the pinned footer, so variable title/tagline heights
  // (long generated program names) just shift the block — nothing overflows.
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 1.5,
    marginBottom: 16,
    textAlign: 'center',
  },
  programName: {
    fontSize: 30,
    fontFamily: serifFont,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 38,
    marginBottom: 8,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 12,
    textAlign: 'center',
  },
  taglineSlot: {
    minHeight: 48,
    maxWidth: 300,
    width: '100%',
  },
  error: {
    marginTop: 16,
    fontSize: 14,
    color: colors.warning,
    textAlign: 'center',
  },
  devBanner: {
    marginTop: 24,
    padding: 12,
    borderRadius: radius.chip,
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: colors.warning,
  },
  devText: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.warning,
    textAlign: 'center',
  },
  footer: {
    gap: 12,
    alignItems: 'center',
  },
  restore: {
    fontSize: 15,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
    paddingVertical: 4,
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  legal: {
    fontSize: 12,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
  legalDivider: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  busyText: {
    fontSize: 15,
    color: colors.textSecondary,
  },
});
