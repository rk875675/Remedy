import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, Pressable, Platform, BackHandler } from 'react-native';
import { useRouter, useLocalSearchParams, useNavigation, Stack } from 'expo-router';
import { CommonActions } from '@react-navigation/native';
import { GrowthPath, type ProgressStory } from '../../components/onboarding/plan/GrowthPath';
import { HoldToCommit } from '../../components/onboarding/plan/HoldToCommit';
import { PlanCard } from '../../components/onboarding/plan/PlanCard';
import {
  Metric,
  NerveMark,
  PatternMark,
  PlanIcon,
  StartMark,
  type PatternIcon,
  type StartIcon,
} from '../../components/onboarding/plan/PlanArt';
import {
  PhaseStepper,
  phasesFromMode,
  phasesFromOutline,
  type PhaseStep,
} from '../../components/onboarding/plan/PhaseStepper';
import {
  Confetti,
  NoteCard,
  ObScreen,
  PrimaryButton,
  RevealText,
  SourcesLink,
  SourcesSheet,
  TextLink,
  ob,
  obType,
} from '../../components/onboarding/kit';
import { useOnboarding, type OnboardingProgress } from '../../context/OnboardingContext';
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
import { MedicalDisclaimer } from '../../components/legal/MedicalDisclaimer';
import { supabase } from '../../lib/supabase';
import { clearPendingPurchase, getPendingPurchase, setPendingPurchase } from '../../lib/pendingPurchase';
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
import { sessionLength } from '../../lib/analytics/events/enums';
import { onboardingFunnelDurationMs } from '../../lib/analytics/onboardingSteps';
import type { z } from 'zod';
import { type OnboardingAnswersInput, type PlanPreview } from '../../lib/schemas';
import {
  loadPlanPreview,
  parseCompleteAnswers,
  peekPlanPreview,
} from '../../lib/planPreview';
import type { OnboardingAnswers } from '../../types/database';
import { outcomeTagline } from '../../constants/mindset';
import { ONBOARDING_SOURCES } from '../../constants/onboardingSources';
import {
  HARD_NOW,
  MIN_PROGRAM_WEEKS,
  deriveProfile,
  type ClinicalProfile,
  type FunctionTarget,
  type Intake,
} from '../../lib/intake';
import { persistIntake } from '../../lib/intakeApi';
import {
  completeIntake,
  profileSummary,
  programEndDateLabel,
  programWeeksFor,
} from '../../lib/intakeSummary';
import { hapticSuccess } from '../../lib/haptics';

const FALLBACK_TAGLINE = 'A plan built from your answers.';
const COMMIT_PAUSE_MS = 500;

const ALL_SOURCES = Object.values(ONBOARDING_SOURCES);

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

/** Checkpoint targets, in the words of what they said is hard. */
const HARD_CHECKPOINT: Record<FunctionTarget, string> = {
  bed: 'Up and out of bed easily',
  bending: 'Bending to tie your shoes',
  sitting: 'Sitting through a movie',
  standing: 'Standing to cook a meal',
  walking: 'Long walks again',
  stairs: 'Stairs without bracing',
  twisting: 'Turning to look behind you',
  overhead: 'Reaching the top shelf',
  sleep: 'Sleeping more comfortably',
  exercise: 'Back to your workouts',
};

const GOAL_CHECKPOINT: Record<MainGoalValue, string> = {
  reduce_pain: 'Everyday moves feel easy',
  return_to_exercise: HARD_CHECKPOINT.exercise,
  sleep: HARD_CHECKPOINT.sleep,
  mobility: 'Moving freely again',
};

const PLAN_OUTCOME = 'Stop thinking about your back';

/** Which "hard right now" answer best matches each goal, most relevant first. */
const GOAL_HARD: Record<MainGoalValue, readonly FunctionTarget[]> = {
  reduce_pain: [],
  return_to_exercise: ['exercise'],
  sleep: ['sleep', 'bed'],
  mobility: ['bending', 'overhead', 'twisting'],
};

function progressStory(
  hardNow: readonly string[] | undefined,
  goal: MainGoalValue | undefined,
): ProgressStory | null {
  const picked = (hardNow ?? []).filter((value): value is FunctionTarget =>
    (HARD_NOW as readonly string[]).includes(value),
  );
  const preferred = goal ? GOAL_HARD[goal].find((value) => picked.includes(value)) : undefined;
  const lead = preferred ?? picked[0];
  const checkpoint = lead ? HARD_CHECKPOINT[lead] : goal ? GOAL_CHECKPOINT[goal] : null;
  return checkpoint ? { checkpoint, outcome: PLAN_OUTCOME } : null;
}

function patternKind(bias: ClinicalProfile['bias']): PatternIcon {
  if (bias === 'flexion_sensitive') return 'bend';
  if (bias === 'extension_sensitive') return 'arch';
  return 'mix';
}

function startKind(mode: ClinicalProfile['mode']): StartIcon {
  if (mode === 'calm') return 'gentle';
  if (mode === 'build') return 'build';
  return 'steady';
}

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
  const { answers, intake, retaking, progress, setLocalAnswer } = useOnboarding();
  const { user } = useAuth();
  const { refreshPremium } = usePremium();
  const { identify } = useUser();
  const [loading, setLoading] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Memoized on `answers` (stable useState value) because `parseCompleteAnswers`
  // returns a fresh Zod-parsed object every call. Without this the preview effect
  // below, which depends on these answer objects and calls setPreview(), re-ran
  // on every render and looped: it re-invoked assign-program roughly 1.4×/second.
  const complete = useMemo(() => parseCompleteAnswers(answers), [answers]);
  const intakeFull = useMemo(() => completeIntake(answers, intake), [answers, intake]);
  // Lapsed users have no quiz left in context (cleared after the first signup).
  // The screen still has to be the current plan page, so these are loaded from
  // onboarding_answers + user_intake and used only for display and preview.
  const [serverQuiz, setServerQuiz] = useState<{
    answers: OnboardingAnswersInput;
    intake: Intake | null;
  } | null>(null);
  const shownAnswers = complete ?? serverQuiz?.answers ?? null;
  const shownIntake = complete ? intakeFull : (serverQuiz?.intake ?? null);
  const profile = useMemo(() => {
    if (!shownAnswers || !shownIntake) return null;
    return deriveProfile(shownAnswers, shownIntake);
  }, [shownAnswers, shownIntake]);
  const localWeeks =
    shownAnswers && shownIntake ? programWeeksFor(shownAnswers, shownIntake) : MIN_PROGRAM_WEEKS;
  const summary = useMemo(() => {
    if (!shownAnswers || !shownIntake || !profile) return null;
    return profileSummary(shownAnswers, shownIntake, profile);
  }, [shownAnswers, shownIntake, profile]);
  const peekedPreview = complete ? peekPlanPreview(complete, intakeFull) : null;
  const [preview, setPreview] = useState<PlanPreview | null>(
    peekedPreview?.ok ? peekedPreview.data : null,
  );
  const [previewSettled, setPreviewSettled] = useState(peekedPreview !== null);
  // Assigned snapshot. Fallback only, when the saved quiz cannot be parsed.
  // A readable quiz renders the current plan page instead of this row.
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
  const celebrate = !retaking && !isReconvert;
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [freshCommit, setFreshCommit] = useState(false);
  const [bursts, setBursts] = useState(celebrate ? 1 : 0);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mounted = useRef(true);
  useEffect(() => () => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
  }, []);
  useEffect(() => () => { mounted.current = false; }, []);

  // replace() onto match leaves it alone in the stack — iOS swipe-back is a no-op.
  // Put Welcome underneath so the only back target is sign in / sign out.
  const navigation = useNavigation();
  // The plan before the paywall is a dead end: swipe-back and the hardware back
  // button stay here. A lapsed subscriber can still return to Welcome to sign out,
  // and a retake can still step back through answers.
  const planLocked = !isReconvert && !retaking;
  useEffect(() => {
    if (!planLocked) return;
    const blockHardware = BackHandler.addEventListener('hardwareBackPress', () => true);
    const blockPop = navigation.addListener('beforeRemove', (event) => {
      const type = event.data.action.type;
      if (type === 'GO_BACK' || type === 'POP' || type === 'POP_TO_TOP') {
        event.preventDefault();
      }
    });
    return () => {
      blockHardware.remove();
      blockPop();
    };
  }, [navigation, planLocked]);
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
      const [{ data: up }, { data: answersRow }, { data: intakeRow }] = await Promise.all([
        supabase
          .from('user_programs')
          .select('active_plan_id')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('onboarding_answers')
          .select(
            'pain_location, pain_duration, pain_type, activity_level, pain_trigger, equipment, main_goal, sessions_per_week_preference',
          )
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('user_intake')
          .select('answers')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const parsed = answersRow ? parseCompleteAnswers(answersRow) : null;
      if (answersRow) {
        setSavedAnswers({
          pain_location: answersRow.pain_location,
          pain_trigger: answersRow.pain_trigger,
          equipment: answersRow.equipment,
        });
      }
      if (parsed) {
        setServerQuiz({
          answers: parsed,
          intake: completeIntake(parsed, intakeRow?.answers ?? null),
        });
      }
      if (!up?.active_plan_id) return;
      const { data: plan } = await supabase
        .from('user_program_plans')
        .select('program_name, subtitle, tagline, duration_weeks, sessions_per_week, primary_focus')
        .eq('id', up.active_plan_id)
        .maybeSingle();
      if (plan && !cancelled) {
        setSavedPlan(plan);
        // A parsed quiz is about to load the current preview. Settling here
        // would paint the stored snapshot (the short plan from assignment time)
        // and leave it up if that preview is what the screen should show.
        if (!parsed) setPreviewSettled(true);
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
    if (!shownAnswers) return;
    let cancelled = false;
    const answersForPreview = shownAnswers;
    const intakeForPreview = shownIntake;
    loadPlanPreview(answersForPreview, intakeForPreview).then((result) => {
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
        duration_weeks: intakeForPreview
          ? programWeeksFor(answersForPreview, intakeForPreview)
          : MIN_PROGRAM_WEEKS,
        sessions_per_week: answersForPreview.sessions_per_week_preference,
        equipment_tier: answersForPreview.equipment,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [shownAnswers, shownIntake]);

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
  // Hard paywall. Superwall also runs `feature()` for a non-gated close and for
  // the exit survey. Either one used to see an older StoreKit transaction and
  // send the user to sign-up. A shown paywall continues only after a purchase
  // or restore in THIS presentation.
  const paywallWasPresented = useRef(false);
  const purchasedThisPresentation = useRef(false);
  // "Have a code?" dismisses the paywall so the promo sheet can open. That
  // dismiss is not a close, and must not wipe a purchase waiting for sign-up.
  const promoDismiss = useRef(false);

  useSuperwallEvents({
    // "Have a code?" element on the Superwall paywall (custom action
    // `redeem_promo_code`). The paywall must be dismissed first — an RN Modal
    // renders behind Superwall's native view controller.
    onCustomPaywallAction: (name) => {
      if (name !== 'redeem_promo_code') return;
      promoDismiss.current = true;
      void (async () => {
        await dismissSuperwall();
        if (mounted.current) setPromoVisible(true);
      })();
    },
    onPaywallPresent: (paywallInfo) => {
      paywallWasPresented.current = true;
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
          purchasedThisPresentation.current = true;
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
    onPresent: () => {
      paywallWasPresented.current = true;
    },
    onDismiss: async (_info, result) => {
      // A gated close never resolves registerPlacement, so its finally never runs.
      if (mounted.current) setPresenting(false);
      paywallDismissed({
        placement: 'onboarding_paywall',
        result_type: result.type,
        ...(paywallVariant.current.variantId === undefined
          ? {}
          : { paywall_variant_id: paywallVariant.current.variantId }),
      });
      if (result.type === 'purchased' || result.type === 'restored') {
        purchasedThisPresentation.current = true;
        await handlePurchased();
      } else {
        // Hard paywall. X, the exit survey, and a non-gated close all land here.
        // Stay on the program. Also drop a stash from an older close so the root
        // guard cannot skip "Building your plan" and open sign-up.
        const openingPromo = promoDismiss.current;
        promoDismiss.current = false;
        if (
          !openingPromo &&
          !purchasedThisPresentation.current &&
          !purchaseNavigated.current
        ) {
          await clearPendingPurchase();
        }
        // transactionComplete may have raised the busy overlay preemptively;
        // a dismiss without a purchase result must not leave it stuck.
        if (mounted.current) setBusy(null);
      }
    },
    onSkip: (reason) => {
      if (mounted.current) setPresenting(false);
      paywallDismissed({
        placement: 'onboarding_paywall',
        result_type: 'no_paywall',
        ...(paywallVariant.current.variantId === undefined
          ? {}
          : { paywall_variant_id: paywallVariant.current.variantId }),
      });
      if (__DEV__) console.log('[superwall] skipped', reason);
      // A shown paywall that closes is a dismiss, not a skip. Skip-recovery
      // looks up any StoreKit transaction and would send a close to sign-up.
      if (paywallWasPresented.current && !purchasedThisPresentation.current) {
        const openingPromo = promoDismiss.current;
        promoDismiss.current = false;
        if (!openingPromo && !purchaseNavigated.current) void clearPendingPurchase();
        if (mounted.current) setBusy(null);
        return;
      }
      void recoverFromSkippedPaywall();
    },
    onError: (err) => {
      // Superwall config/network noise must not stop the funnel. Real purchase
      // failures have their own confirmation alerts.
      if (__DEV__) console.log('[superwall] onError', err);
      if (mounted.current) {
        setPresenting(false);
        Alert.alert('Could not open checkout', 'Please try again.');
      }
    },
  });

  useEffect(() => {
    if (user && SUPERWALL_AVAILABLE) {
      identify(user.id, { restorePaywallAssignments: true });
    }
  }, [user]);

  // Superwall calls `feature()` when the paywall is not shown (recognized
  // subscriber, holdout) AND when a non-gated paywall is closed. The close must
  // not continue. Only a purchase or restore in this presentation, or a skip
  // where the paywall never appeared, may look at StoreKit.
  function closedWithoutBuying(): boolean {
    return paywallWasPresented.current && !purchasedThisPresentation.current;
  }

  async function handleFeatureAccess() {
    if (closedWithoutBuying()) {
      if (mounted.current) setBusy(null);
      return;
    }
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
    paywallWasPresented.current = false;
    purchasedThisPresentation.current = false;
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
          if (closedWithoutBuying()) return;
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
      } else if (
        reason === 'transaction_expired' ||
        reason === 'no_active_subscription' ||
        reason === 'invalid_receipt' ||
        reason === 'invalid_transaction'
      ) {
        Alert.alert('Restore', 'No active subscription found.');
      } else {
        Alert.alert('Restore', 'Could not restore purchases. Try again later.');
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
          setError('Could not save your answers. Check your connection and try again.');
          setLoading(false);
          return;
        }
        const savedIntake = completeIntake(answers, intake);
        if (savedIntake) {
          // A failed intake write must not block the program rebuild.
          await persistIntake(user.id, savedIntake);
        }
        reportOnboardingCompleted(complete, true, progress);
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
        reportOnboardingCompleted(complete, false, progress);
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
    (shownAnswers
      ? `${AREA_TITLE[shownAnswers.pain_location]} ${GOAL_TITLE[shownAnswers.main_goal[0]]} Program`
      : (savedPlan?.program_name ?? 'Your Program'));
  const subtitle =
    preview?.subtitle ??
    (shownAnswers
      ? (shownAnswers.equipment === 'open_space' ? 'Bodyweight' : null)
      : (savedPlan?.subtitle ?? null));
  const primaryGoal = shownAnswers?.main_goal[0];
  const tagline =
    shownAnswers && primaryGoal
      ? outcomeTagline(primaryGoal, shownAnswers.activity_level)
      : previewSettled
        ? (preview?.tagline ?? savedPlan?.tagline ?? FALLBACK_TAGLINE)
        : null;
  // Current engine length wins over the snapshot stored at assignment. A lapsed
  // account's row can still be the short plan from before this page.
  const weeks =
    preview?.duration_weeks ?? (shownIntake ? localWeeks : (savedPlan?.duration_weeks ?? localWeeks));
  const displayWeeks = weeks;
  const perWeek =
    preview?.sessions_per_week ??
    shownAnswers?.sessions_per_week_preference ??
    savedPlan?.sessions_per_week ??
    3;
  const minutes = avgMinutes(preview) ?? 20;
  const chosenMinutes =
    shownIntake?.minutes === 15 || shownIntake?.minutes === 20 || shownIntake?.minutes === 30
      ? shownIntake.minutes
      : progress?.minutes === 15 || progress?.minutes === 20 || progress?.minutes === 30
        ? progress.minutes
        : null;
  const displayMinutes = avgMinutes(preview) ?? chosenMinutes ?? minutes;
  const story = progressStory(shownIntake?.hard_now, primaryGoal);
  const endLabel = programEndDateLabel(displayWeeks);
  const firstSession = preview?.week_one[0] ?? null;
  const sessionsThisWeek = preview?.week_one.length ?? 0;
  const outlinePhases = preview?.outline ? phasesFromOutline(preview.outline.weeks) : [];
  const phases: PhaseStep[] | null =
    outlinePhases.length > 0 ? outlinePhases : profile ? phasesFromMode(profile.mode) : null;
  const showHold = !retaking && !isReconvert && !progress?.committed_at;

  function openPlan() {
    void handleStart();
  }

  function finishCommit() {
    setFreshCommit(true);
    setLocalAnswer('committed_at', new Date().toISOString());
    hapticSuccess();
    setBursts((count) => count + 1);
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => {
      commitTimer.current = null;
      if (!mounted.current) return;
      setFreshCommit(false);
      void handleStart();
    }, COMMIT_PAUSE_MS);
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ gestureEnabled: !planLocked, headerShown: false }} />
      <ObScreen
        chapter={null}
        onBack={null}
        background="mint"
        testID="match"
        contentStyle={styles.scrollContent}
        footer={
          <View style={styles.footerStack}>
            {!SUPERWALL_AVAILABLE && !retaking ? (
              <View style={styles.devBanner}>
                <Text style={styles.devText}>
                  Expo Go: Superwall unavailable. Tap below to skip with a dev trial.
                </Text>
              </View>
            ) : null}
            {showHold || freshCommit ? (
              <HoldToCommit disabled={loading || presenting} onComplete={finishCommit} />
            ) : (
              <PrimaryButton
                testID="plan-continue"
                label={retaking ? 'Update my program' : 'Continue'}
                disabled={loading || presenting}
                onPress={openPlan}
              />
            )}
            <View style={styles.footerLinks}>
              {!retaking ? (
                <View testID="restore-purchases" collapsable={false}>
                  <TextLink label="Restore Purchases" onPress={() => void handleRestore()} tone="soft" />
                </View>
              ) : null}
              <View style={styles.legalRow}>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="Terms of Use"
                  onPress={() => openLegalDocument('terms', 'match')}
                  hitSlop={8}
                  style={styles.legalHit}
                >
                  <Text style={styles.legal}>Terms of Use</Text>
                </Pressable>
                <Text style={styles.legalDivider}>·</Text>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="Privacy Policy"
                  onPress={() => openLegalDocument('privacy', 'match')}
                  hitSlop={8}
                  style={styles.legalHit}
                >
                  <Text style={styles.legal}>Privacy Policy</Text>
                </Pressable>
              </View>
              {error ? (
                <Text style={styles.error} accessibilityLiveRegion="polite">
                  {error}
                </Text>
              ) : null}
            </View>
          </View>
        }
      >
        <View style={styles.hero}>
          <RevealText testID="plan-headline" style={styles.headline}>
            {programName}
          </RevealText>
        </View>

        {profile?.flags.clinicianFirst ? (
          <PlanCard plain delay={40}>
            <NoteCard
              tone="warn"
              icon="alert-circle-outline"
              title="Before you start"
              text="Get checked by a clinician first. Your plan will be here when you're cleared."
            />
          </PlanCard>
        ) : null}

        <PlanCard title="Projected progress" delay={80}>
          <GrowthPath
            weeks={displayWeeks}
            perWeek={perWeek}
            minutes={displayMinutes}
            endLabel={endLabel}
            story={story}
          />
        </PlanCard>

        {phases && phases.length > 0 ? (
          <PlanCard title="How it builds" delay={140}>
            <PhaseStepper steps={phases} />
          </PlanCard>
        ) : null}

        {firstSession ? (
          <PlanCard title="Week 1" delay={200}>
            <View style={styles.statRow}>
              <Metric
                icon="calendar"
                tone="clay"
                value={sessionsThisWeek}
                label={sessionsThisWeek === 1 ? 'Session' : 'Sessions'}
              />
              <Metric icon="dumbbell" tone="amber" value={firstSession.exercises.length} label="Moves each" />
              <Metric icon="clock" tone="blue" value={firstSession.estimated_minutes} label="Min each" />
            </View>
            {firstSession.title.length > 0 ? (
              <Text style={styles.cardNote} numberOfLines={2}>
                First up: {firstSession.title}
              </Text>
            ) : null}
          </PlanCard>
        ) : null}

        {summary && profile ? (
          <PlanCard title="Built around you" delay={260}>
            <ProfileRow icon={<PatternMark kind={patternKind(profile.bias)} />} title={summary.patternTitle} body={summary.patternBody} />
            <ProfileRow icon={<StartMark kind={startKind(profile.mode)} />} title={summary.startTitle} body={summary.startBody} />
            <ProfileRow icon={<NerveMark />} title={summary.nsTitle} body={summary.nsBody} />
            {summary.focusChips.length > 0 ? (
              <View style={styles.chips}>
                {summary.focusChips.map((chip) => (
                  <View key={chip} style={styles.chip}>
                    <Text style={styles.chipText}>{chip}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {summary.adaptations.length > 0 ? (
              <View style={styles.stack}>
                {summary.adaptations.map((line) => (
                  <View key={line} style={styles.adaptRow}>
                    <PlanIcon name="heart" tone="clay" size={26} />
                    <Text style={styles.adaptText}>{line}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {summary.goals.length > 0 ? (
              <View style={styles.stack}>
                <Text style={styles.blockLabel}>What we're training for</Text>
                <View style={styles.chips}>
                  {summary.goals.map((goal) => (
                    <View key={goal} style={styles.chip}>
                      <Text style={styles.chipText}>{goal}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </PlanCard>
        ) : null}

        <PlanCard title="Worth knowing" delay={320}>
          <Text style={styles.note}>
            The date is a target from your answers. It is not a result anyone can promise.
          </Text>
          <MedicalDisclaimer style={styles.disclaimer} />
          <SourcesLink label="Learn about sources we use." onPress={() => setSourcesOpen(true)} />
        </PlanCard>
      </ObScreen>

      {bursts > 0 ? <Confetti key={bursts} play count={32} /> : null}

      {busy !== null && (
        <View style={styles.busyOverlay}>
          <ActivityIndicator size="large" color={ob.color.accent} />
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
      <SourcesSheet
        visible={sourcesOpen}
        onClose={() => setSourcesOpen(false)}
        items={ALL_SOURCES}
      />
    </View>
  );
}

function ProfileRow({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.profileRow}>
      {icon}
      <View style={styles.profileCopy}>
        <Text style={styles.profileTitle}>{title}</Text>
        <Text style={styles.profileBody}>{body}</Text>
      </View>
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
function sessionLengthFromMinutes(
  minutes: number | null | undefined,
): z.infer<typeof sessionLength> | undefined {
  if (minutes === 15) return 'minutes_15';
  if (minutes === 20) return 'minutes_20';
  if (minutes === 30) return 'minutes_30';
  return undefined;
}

function reportOnboardingCompleted(
  answers: RequiredAnswers,
  isRetake: boolean,
  progress: OnboardingProgress | null,
): void {
  const timeInFunnelMs = onboardingFunnelDurationMs();
  const prior =
    progress?.tried_before === 'yes' || progress?.tried_before === 'no'
      ? progress.tried_before
      : undefined;
  const length = sessionLengthFromMinutes(progress?.minutes);
  const hasRedFlag = typeof progress?.has_red_flag === 'boolean' ? progress.has_red_flag : undefined;

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
    ...(hasRedFlag === undefined ? {} : { has_red_flag: hasRedFlag }),
    ...(prior === undefined ? {} : { prior_attempts: prior }),
    ...(length === undefined ? {} : { session_length: length }),
  });

  setPersonProperties({
    pain_location: answers.pain_location,
    pain_duration: answers.pain_duration,
    activity_level: answers.activity_level,
    equipment_tier: answers.equipment,
    primary_goal: answers.main_goal[0],
    sessions_per_week_preference: answers.sessions_per_week_preference,
    ...(hasRedFlag === undefined ? {} : { has_red_flag: hasRedFlag }),
    ...(prior === undefined ? {} : { prior_attempts: prior }),
    ...(length === undefined ? {} : { session_length: length }),
  });
}


function avgMinutes(preview: PlanPreview | null): number | null {
  if (!preview?.week_one?.length) return null;
  const total = preview.week_one.reduce((sum, s) => sum + (s.estimated_minutes ?? 0), 0);
  const avg = Math.round(total / preview.week_one.length);
  return avg > 0 ? avg : null;
}

const headlineWeight = Platform.OS === 'ios' ? '800' : '700';

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    gap: 16,
    paddingTop: 8,
    paddingBottom: 28,
  },
  footerStack: {
    gap: 6,
  },
  footerLinks: {
    gap: 0,
  },
  hero: {
    gap: 10,
    alignItems: 'flex-start',
    paddingTop: 12,
    paddingBottom: 4,
  },
  headline: {
    fontSize: 40,
    lineHeight: 46,
    fontWeight: headlineWeight,
    letterSpacing: -1.2,
    color: ob.color.ink,
    textAlign: 'left',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  statRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cardNote: {
    ...obType.caption,
    fontWeight: '400',
    color: ob.color.inkSoft,
  },
  note: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
    color: ob.color.ink,
  },
  disclaimer: {
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'left',
    color: ob.color.inkSoft,
  },
  profileCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  profileTitle: {
    ...obType.bodyStrong,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  profileBody: {
    ...obType.caption,
    fontWeight: '400',
    color: ob.color.inkSoft,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: ob.color.accentSoft,
    borderRadius: ob.radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipText: {
    ...obType.caption,
    color: ob.color.accentDeep,
  },
  sessionHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  sessionTitle: {
    ...obType.bodyStrong,
    fontSize: 17,
    lineHeight: 22,
    flex: 1,
  },
  sessionMinutes: {
    ...obType.caption,
    color: ob.color.accentDeep,
  },
  stack: {
    gap: 10,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  exerciseName: {
    ...obType.body,
    color: ob.color.ink,
    flex: 1,
  },
  dose: {
    ...obType.bodyStrong,
    color: ob.color.inkSoft,
    flexShrink: 0,
  },
  more: {
    ...obType.caption,
  },
  adaptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  adaptText: {
    ...obType.body,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    color: ob.color.ink,
    flex: 1,
  },
  blockLabel: {
    ...obType.bodyStrong,
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  legalHit: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  legal: {
    ...obType.caption,
    textDecorationLine: 'underline',
  },
  legalDivider: {
    ...obType.caption,
  },
  error: {
    ...obType.caption,
    color: ob.color.warn,
    textAlign: 'center',
  },
  devBanner: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: ob.radius.chip,
    backgroundColor: ob.color.warnSoft,
    borderWidth: 1,
    borderColor: ob.color.warn,
  },
  devText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: ob.color.warn,
    textAlign: 'center',
  },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: ob.color.mint,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  busyText: {
    ...obType.body,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
