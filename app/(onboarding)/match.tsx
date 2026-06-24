import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
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
import { setPendingPurchase } from '../../lib/pendingPurchase';
import { getLatestRemedyTransaction, restoreRemedyTransaction } from '../../lib/iap';
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

function equipmentBullet(equipment: RequiredAnswers['equipment']): string {
  switch (equipment) {
    case 'open_space':
      return 'Bodyweight-only exercises — no equipment needed';
    case 'bands_dumbbells':
      return 'Built around your bands and light dumbbells';
    case 'gym':
      return 'Progresses into full gym equipment as you build strength';
  }
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

export default function MatchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { answers, retaking, endRetake } = useOnboarding();
  const { user } = useAuth();
  const { refreshPremium } = usePremium();
  const { identify } = useUser();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PlanPreview | null>(null);

  const complete = getComplete(answers);

  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    trackEvent('paywall_viewed');
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

  // Stash the pending transaction then route to sign-up so the account is created
  // before verification on building-plan (PRD §5–§6.1).
  async function handlePurchased() {
    const iapTx = await getLatestRemedyTransaction();
    if (iapTx) {
      await setPendingPurchase(iapTx);
    } else if (lastTransaction.current) {
      await setPendingPurchase({ ...lastTransaction.current, jws: null });
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

  async function handleShowPaywall() {
    if (!SUPERWALL_AVAILABLE) {
      // Dev / Expo Go: skip real purchase, go straight to sign-up.
      router.replace('/(auth)/sign-in?mode=signup');
      return;
    }
    await registerPlacement({
      placement: 'onboarding_paywall',
      feature() {
        router.replace('/(auth)/sign-in?mode=signup');
      },
    });
  }

  async function handleRestore() {
    // Anonymous: send to sign-up first; restore is re-attempted on building-plan.
    if (!user) {
      router.replace('/(auth)/sign-in?mode=signup');
      return;
    }
    setLoading(true);
    try {
      const tx = await restoreRemedyTransaction();
      if (!tx) {
        Alert.alert('Restore', 'No active subscription found.');
        return;
      }
      const { data } = await supabase.functions.invoke('restore-purchases', {
        body: {
          originalTransactionId: tx.originalTransactionId,
          signedTransaction: tx.jws,
        },
        headers: { 'Idempotency-Key': `restore_${user.id}_${tx.originalTransactionId}` },
      });
      if (data?.success) {
        trackEvent('purchase_restored');
        await refreshPremium();
        router.replace('/building-plan');
      } else {
        Alert.alert('Restore', 'No active subscription found.');
      }
    } catch {
      Alert.alert('Restore', 'Could not restore purchases. Try again later.');
    } finally {
      if (mounted.current) setLoading(false);
    }
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
      endRetake();
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
  // Decision: 1 goal → "<area> <goalFocus> Program"; >1 goals → generic name.
  const programName =
    preview?.program_name ??
    (complete
      ? complete.main_goal.length === 1
        ? `${AREA_TITLE[complete.pain_location]} ${GOAL_TITLE[complete.main_goal[0]]} Program`
        : 'Personalized Recovery Program'
      : 'Your Program');
  const subtitle =
    preview?.subtitle ?? (complete?.equipment === 'open_space' ? 'Bodyweight' : null);
  const tagline = preview?.tagline ?? 'A personalized plan built around your answers.';
  const weeks = preview?.duration_weeks ?? 8;
  const perWeek = preview?.sessions_per_week ?? complete?.sessions_per_week_preference ?? 3;
  const minutes = avgMinutes(preview) ?? 20;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>YOUR PROGRAM</Text>

        <Text style={styles.programName}>{programName}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

        <Text style={styles.tagline}>{tagline}</Text>

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
          {complete && <FeatureItem text={equipmentBullet(complete.equipment)} />}
          {complete && <FeatureItem text={triggerBullet(complete.pain_trigger[0])} />}
          <FeatureItem text="Adapts intensity each week based on your pain check-ins" />
        </View>

        {!SUPERWALL_AVAILABLE && (
          <View style={styles.devBanner}>
            <Text style={styles.devText}>
              Expo Go: Superwall unavailable. Tap below to skip with a dev trial.
            </Text>
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      <View style={styles.footer}>
        <ContinueButton
          label={SUPERWALL_AVAILABLE ? 'Start My Free Trial' : 'Start Dev Trial'}
          onPress={handleStart}
          disabled={loading}
        />
        <Text style={styles.restore} onPress={handleRestore}>
          Restore Purchases
        </Text>
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
  content: {
    flex: 1,
    justifyContent: 'center',
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
    marginBottom: 16,
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
