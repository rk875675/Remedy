import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { useAuth } from '../../context/AuthContext';
import { usePremium } from '../../context/PremiumContext';
import {
  usePlacement,
  useUser,
  useSuperwallEvents,
  SUPERWALL_AVAILABLE,
} from '../../lib/superwall';
import { supabase } from '../../lib/supabase';
import { getPendingPurchase, setPendingPurchase } from '../../lib/pendingPurchase';
import { getLatestRemedyTransaction, restoreRemedyTransaction } from '../../lib/iap';
import { extractInvokeError } from '../../lib/functionsError';
import { trackEvent } from '../../lib/analytics';
import { colors, serifFont } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';
import {
  onboardingAnswersInputSchema,
  planPreviewSchema,
  type OnboardingAnswersInput,
  type PlanPreview,
} from '../../lib/schemas';
import type { OnboardingAnswers } from '../../types/database';

// Personalization (program name length, subtitle presence, variant, etc.) makes the
// content block's natural height vary a lot. Rather than a fixed gap that looks huge
// for short content and cramped for long content, we measure the available space,
// the footer's height, and the content's natural height, then clamp the gap between
// them to this range — any extra slack (short content) goes above the eyebrow instead
// of ballooning the gap right before the CTA.
const MIN_CONTENT_FOOTER_GAP = 24;
const MAX_CONTENT_FOOTER_GAP = 88;

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
      return 'Uses just your bodyweight — no equipment needed';
    case 'bands_dumbbells':
      return 'Built around your bands and dumbbells';
    case 'gym':
      return 'Takes full advantage of your gym access';
    default:
      return '';
  }
}

export default function MatchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { answers, retaking } = useOnboarding();
  const { user } = useAuth();
  const { refreshPremium } = usePremium();
  const { identify } = useUser();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PlanPreview | null>(null);

  // Layout measurements used to clamp the content-to-footer gap (see comment above).
  const [bodyHeight, setBodyHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);
  const [innerContentHeight, setInnerContentHeight] = useState(0);

  const complete = getComplete(answers);

  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    if (!retaking) trackEvent('paywall_viewed');
  }, []);

  // Server-consistent preview: the same edge function that assigns the real plan
  // computes a non-persisted preview so the match screen reflects the actual plan.
  useEffect(() => {
    if (!complete) return;
    let cancelled = false;
    supabase.functions
      .invoke('assign-program', { body: { preview_only: true, answers: complete } })
      .then(({ data, error: invokeError }) => {
        if (cancelled || invokeError) return;
        const parsed = planPreviewSchema.safeParse(data);
        if (parsed.success) setPreview(parsed.data);
      })
      .catch(() => {
        /* fall back to client-side name below */
      });
    return () => {
      cancelled = true;
    };
  }, [complete]);

  // Fallback capture from Superwall's transactionComplete event.
  const lastTransaction = useRef<{ originalTransactionId: string; productId: string } | null>(null);

  useSuperwallEvents({
    onSuperwallEvent: ({ event }) => {
      if (event.event === 'transactionComplete') {
        const originalId = event.transaction?.originalTransactionIdentifier;
        const productId = event.product?.productIdentifier;
        if (originalId && productId) {
          lastTransaction.current = { originalTransactionId: originalId, productId };
        }
      }
    },
  });

  // Stash the pending transaction then hand off to whichever screen actually
  // verifies it. Anonymous users go through sign-up (no account yet); an already
  // authed user (e.g. a lapsed subscriber re-converting from this same screen) has
  // no sign-up step to run — sending them to sign-in?mode=signup left them bounced
  // back here by the root guard with the purchase never verified. building-plan
  // reads the stashed transaction and calls verify-purchase directly.
  async function handlePurchased() {
    const iapTx = await getLatestRemedyTransaction();
    if (iapTx) {
      await setPendingPurchase(iapTx);
    } else if (lastTransaction.current) {
      await setPendingPurchase({ ...lastTransaction.current, jws: null });
    } else {
      showPurchaseConfirmationError();
      return;
    }
    if (!(await getPendingPurchase())) {
      showPurchaseConfirmationError();
      return;
    }
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
      if (result.type === 'purchased' || result.type === 'restored') {
        await handlePurchased();
      }
    },
    onError: (err) => {
      Alert.alert('Error', err);
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
    const tx = await getLatestRemedyTransaction();
    if (!tx) {
      showPurchaseConfirmationError();
      return;
    }
    await setPendingPurchase(tx);
    if (!(await getPendingPurchase())) {
      showPurchaseConfirmationError();
      return;
    }
    if (user) {
      router.replace('/building-plan');
      return;
    }
    router.replace('/(auth)/sign-in?mode=signup');
  }

  async function handleShowPaywall() {
    if (!SUPERWALL_AVAILABLE) {
      // Expo Go has no native StoreKit/Superwall modules. Keep this explicit and
      // development-only so a production module failure cannot bypass the paywall.
      if (__DEV__) {
        router.replace('/(auth)/sign-in?mode=signup');
      } else {
        Alert.alert('Purchases unavailable', 'Purchases are unavailable right now. Please try again later.');
      }
      return;
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
        primary_focus: preview?.primary_focus ?? '',
        trigger_note: complete ? triggerBullet(complete.pain_trigger[0]) : '',
        equipment_note: complete ? equipmentNote(complete.equipment) : '',
      },
      feature() {
        void handleFeatureAccess();
      },
    });
  }

  async function handleRestore() {
    if (!user) {
      setLoading(true);
      try {
        // Full restore sync (not just the cached transaction query): on a fresh
        // install StoreKit has nothing cached until restorePurchases() runs.
        const tx = await restoreRemedyTransaction();
        if (!tx) {
          Alert.alert('Restore Purchases', 'No purchases found to restore.');
          return;
        }
        await setPendingPurchase(tx);
        if (!(await getPendingPurchase())) {
          Alert.alert('Restore Purchases', 'Could not save the restored purchase. Please try again.');
          return;
        }
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
        trackEvent('purchase_restored');
        await refreshPremium();
        router.replace('/building-plan');
        return;
      }
      // Distinguish "belongs to another account" from "nothing to restore" — restoring
      // onto a second account is refused (anti-fraud), and telling the user there's no
      // subscription would be both wrong and confusing.
      const reason = await extractInvokeError(data, error);
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
      Alert.alert('Restore', 'Could not restore purchases. Try again later.');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }

  function showPurchaseConfirmationError() {
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
    if (!complete) {
      setError('Please complete all onboarding questions.');
      return;
    }

    // Retake: an authed, premium user is regenerating their plan. The answers row
    // already exists — update it, then rebuild from the next incomplete week (no
    // paywall). This is the only path that requires an active session.
    if (retaking) {
      if (!user) {
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
      trackEvent('onboarding_completed', { ...complete, retake: true });
      // Keep `retaking` raised until building-plan finishes the re-assignment. Ending it
      // here raced the root guard: with the flag down but segments still in (onboarding),
      // the guard could bounce the user to the tabs before building-plan mounted — the
      // answers were saved but the program was never rebuilt.
      router.replace('/building-plan?retake=1');
      return;
    }

    // First time: no account yet. Track completion then show the paywall inline.
    // Sign-up (and answer persistence) happens after purchase per PRD §5–§6.1.
    trackEvent('onboarding_completed', {
      pain_location: complete.pain_location,
      pain_duration: complete.pain_duration,
      pain_type: complete.pain_type,
      activity_level: complete.activity_level,
      pain_trigger: complete.pain_trigger,
      equipment: complete.equipment,
      main_goal: complete.main_goal,
      sessions_per_week_preference: complete.sessions_per_week_preference,
    });

    await handleShowPaywall();
  }

  // Display values: prefer the server preview, fall back to sensible defaults.
  // Always name off the primary (first-selected) goal — mirrors the server's
  // buildNaming, and stays consistent with the tagline below (also primary-goal-based).
  const programName =
    preview?.program_name ??
    (complete
      ? `${AREA_TITLE[complete.pain_location]} ${GOAL_TITLE[complete.main_goal[0]]} Program`
      : 'Your Program');
  const subtitle =
    preview?.subtitle ?? (complete?.equipment === 'open_space' ? 'Bodyweight' : null);
  const tagline = preview?.tagline ?? 'A personalized plan built around your answers.';
  const weeks = preview?.duration_weeks ?? 8;
  const perWeek = preview?.sessions_per_week ?? complete?.sessions_per_week_preference ?? 3;
  const minutes = avgMinutes(preview) ?? 20;

  // Space available for the scrollable content above the (always-visible) footer.
  const availableForContent = bodyHeight && footerHeight ? bodyHeight - footerHeight : 0;
  const measured = availableForContent > 0 && innerContentHeight > 0;
  const gap = measured
    ? Math.min(
        MAX_CONTENT_FOOTER_GAP,
        Math.max(MIN_CONTENT_FOOTER_GAP, availableForContent - innerContentHeight)
      )
    : MIN_CONTENT_FOOTER_GAP;
  // Scroll box only grows to fit content + gap, capped at the space actually available —
  // long content still scrolls, but the footer never gets pushed off-screen.
  const scrollBoxHeight = measured
    ? Math.min(availableForContent, innerContentHeight + gap)
    : null;
  // Leftover room (short content) becomes top slack instead of an oversized gap.
  const topSlack = measured ? Math.max(0, availableForContent - scrollBoxHeight!) : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 8 }]}>
      <View
        style={styles.body}
        onLayout={(e) => setBodyHeight(e.nativeEvent.layout.height)}
      >
        {topSlack > 0 && <View style={{ height: topSlack }} />}
        <ScrollView
          style={[styles.scroll, scrollBoxHeight != null && { flex: 0, height: scrollBoxHeight }]}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View onLayout={(e) => setInnerContentHeight(e.nativeEvent.layout.height)}>
            <Text style={styles.eyebrow}>{retaking ? 'YOUR UPDATED PROGRAM' : 'YOUR PROGRAM'}</Text>

            <Text style={styles.programName}>{programName}</Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

            <Text style={styles.tagline}>{tagline}</Text>

            {(
              <>
                <View style={styles.card}>
                  <View style={styles.statRow}>
                    <View style={styles.stat}>
                      <Text style={styles.statValue}>{weeks}</Text>
                      <Text style={styles.statLabel}>weeks</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.stat}>
                      <Text style={styles.statValue}>{perWeek}x</Text>
                      <Text style={styles.statLabel}>per week</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.stat}>
                      <Text style={styles.statValue}>{minutes}</Text>
                      <Text style={styles.statLabel}>min each</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.featureList}>
                  {complete && <FeatureItem text={equipmentNote(complete.equipment)} />}
                  {complete && <FeatureItem text={triggerBullet(complete.pain_trigger[0])} />}
                  <FeatureItem text="Adapts intensity each week based on your pain check-ins" />
                </View>

                {/* Retake: the user is already subscribed — no pricing pitch. */}
                {!retaking && (
                  <View style={styles.priceCard}>
                    <View style={styles.priceRow}>
                      <Text style={styles.priceLabel}>Average PT program</Text>
                      <Text style={styles.priceValue}>$1,500+</Text>
                    </View>
                    <View style={styles.priceDivider} />
                    <View style={styles.priceRow}>
                      <Text style={styles.priceLabel}>Remedy</Text>
                      <View style={styles.priceCol}>
                        <Text style={[styles.priceValue, styles.priceValueAccent]}>$6.66/mo</Text>
                        <Text style={styles.priceSubValue}>billed $79.99/year</Text>
                      </View>
                    </View>
                  </View>
                )}
              </>
            )}

            {!SUPERWALL_AVAILABLE && !retaking && (
              <View style={styles.devBanner}>
                <Text style={styles.devText}>
                  Expo Go: Superwall unavailable. Tap below to skip with a dev trial.
                </Text>
              </View>
            )}

            {error && <Text style={styles.error}>{error}</Text>}
          </View>
        </ScrollView>

        <View style={styles.footer} onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}>
          <ContinueButton
            label={
              retaking
                ? 'Update My Program'
                : SUPERWALL_AVAILABLE
                  ? 'Start My Free Trial'
                  : 'Start Dev Trial'
            }
            onPress={handleStart}
            disabled={loading}
          />
          {!retaking && (
            <Text style={styles.restore} onPress={handleRestore}>
              Restore Purchases
            </Text>
          )}
          <View style={styles.legalRow}>
            <Text style={styles.legal} onPress={() => router.push('/(legal)/terms' as never)}>
              Terms of Use
            </Text>
            <Text style={styles.legalDivider}>·</Text>
            <Text style={styles.legal} onPress={() => router.push('/(legal)/privacy' as never)}>
              Privacy Policy
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// Runtime-validate the in-progress answers; returns the typed object only when every
// field is present and valid (strict — no extra keys).
function getComplete(answers: Partial<OnboardingAnswers>): RequiredAnswers | null {
  const result = onboardingAnswersInputSchema.safeParse({
    pain_location: answers.pain_location,
    pain_duration: answers.pain_duration,
    pain_type: answers.pain_type,
    activity_level: answers.activity_level,
    pain_trigger: answers.pain_trigger,
    equipment: answers.equipment,
    main_goal: answers.main_goal,
    sessions_per_week_preference: answers.sessions_per_week_preference,
  });
  return result.success ? result.data : null;
}

function avgMinutes(preview: PlanPreview | null): number | null {
  if (!preview?.week_one?.length) return null;
  const total = preview.week_one.reduce((sum, s) => sum + (s.estimated_minutes ?? 0), 0);
  const avg = Math.round(total / preview.week_one.length);
  return avg > 0 ? avg : null;
}

function FeatureItem({ text }: { text: string }) {
  return (
    <View style={styles.featureRow}>
      <View style={styles.featureDot} />
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
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
  content: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  programName: {
    fontSize: 34,
    fontFamily: serifFont,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 44,
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  tagline: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
    marginBottom: 28,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: 22,
    marginBottom: 28,
    ...shadows.low,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.borderLight,
  },
  featureList: {
    gap: 14,
    marginBottom: 24,
  },
  priceCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: 20,
    ...shadows.low,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  priceLabel: {
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  priceValue: {
    fontSize: 19,
    fontWeight: '700',
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  priceValueAccent: {
    color: colors.primary,
  },
  priceCol: {
    alignItems: 'flex-end',
  },
  priceSubValue: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 2,
  },
  priceDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 2,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  featureDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginTop: 7,
  },
  featureText: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 23,
  },
  error: {
    marginTop: 12,
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
});
