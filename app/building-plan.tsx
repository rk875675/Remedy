import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { usePremium } from '../context/PremiumContext';
import { useOnboarding } from '../context/OnboardingContext';
import { supabase } from '../lib/supabase';
import { isPremium, isDevUser } from '../lib/entitlements';
import { assignResultSchema, onboardingAnswersInputSchema } from '../lib/schemas';
import { getPendingPurchase, clearPendingPurchase } from '../lib/pendingPurchase';
import { trackEvent } from '../lib/analytics';
import { colors, serifFont } from '../constants/colors';
import { radius } from '../constants/spacing';
import { shadows } from '../constants/shadows';

const STEPS = [
  'Analyzing your pain profile...',
  'Selecting exercises for your equipment...',
  'Building your weekly schedule...',
  'Finalizing your program...',
];

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
  const { user } = useAuth();
  const { refreshPremium } = usePremium();
  const { answers } = useOnboarding();
  const [phase, setPhase] = useState<Phase>('assigning');
  const [currentStep, setCurrentStep] = useState(0);
  const ran = useRef(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;

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
      await supabase.from('onboarding_answers').upsert(
        { user_id: user.id, ...parsedAnswers.data },
        { onConflict: 'user_id' },
      );
    }

    const pending = await getPendingPurchase();
    if (pending) {
      const { data } = await supabase.functions.invoke('verify-purchase', {
        body: {
          transactionId: pending.originalTransactionId,
          productId: pending.productId,
          signedTransaction: pending.jws,
        },
        headers: { 'Idempotency-Key': `verify_${user.id}_${pending.originalTransactionId}` },
      });
      if (data?.success) trackEvent('purchase_verified');
      await clearPendingPurchase();
    } else if (await isDevUser(user.id)) {
      // Expo Go "dev trial": no StoreKit transaction, so create the entitlement row
      // server-side (best-effort — a dev user is already treated as premium).
      await supabase.functions.invoke('grant-dev-trial').catch(() => {});
    }

    await refreshPremium();
  }

  async function runAssignment() {
    if (!user) return;
    setPhase('assigning');
    try {
      await linkAccount();

      // Only entitled users build a plan. If somehow not entitled (e.g. a missed
      // transaction), send them back to the paywall rather than stranding them here.
      const [entitled, dev] = await Promise.all([isPremium(user.id), isDevUser(user.id)]);
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

      // Idempotency: if an active plan already exists, skip re-assignment — UNLESS this
      // is a retake, which always regenerates from the next incomplete week.
      let hasActivePlan = false;
      if (up?.active_plan_id) {
        const { data: plan } = await supabase
          .from('user_program_plans')
          .select('id')
          .eq('id', up.active_plan_id)
          .eq('status', 'active')
          .maybeSingle();
        hasActivePlan = !!plan;
      }

      if (isRetake || !hasActivePlan) {
        // Retake starts at the next incomplete week (the week currently in progress).
        const startWeek = isRetake ? Math.max(1, up?.current_week ?? 1) : undefined;
        const { data, error } = await supabase.functions.invoke('assign-program', {
          body: { user_id: user.id, ...(startWeek ? { start_week: startWeek } : {}) },
        });
        const parsed = assignResultSchema.safeParse(data);
        if (error || !parsed.success) {
          // A previous/concurrent run may have already created the plan. Don't strand the
          // user on the error screen if they actually have an active plan now.
          const { data: recheck } = await supabase
            .from('user_programs')
            .select('active_plan_id')
            .eq('user_id', user.id)
            .maybeSingle();
          if (!recheck?.active_plan_id) {
            // If assignment failed because the onboarding answers are incomplete (e.g. a
            // row missing equipment from a half-finished funnel), recover by sending the
            // user back into onboarding rather than stranding them on the error screen.
            const { data: oa } = await supabase
              .from('onboarding_answers')
              .select('equipment')
              .eq('user_id', user.id)
              .maybeSingle();
            if (!oa?.equipment) {
              router.replace('/(onboarding)');
              return;
            }
            setPhase('error');
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

      await refreshPremium();
      setPhase('done');
      router.replace('/(tabs)');
    } catch {
      setPhase('error');
    }
  }

  useEffect(() => {
    if (ran.current || !user) return;
    ran.current = true;
    runAssignment();
  }, [user]);

  // Step ticker for the loader copy while assigning.
  useEffect(() => {
    if (phase !== 'assigning') return;
    const interval = setInterval(() => {
      setCurrentStep((prev) => (prev + 1) % STEPS.length);
    }, 900);
    return () => clearInterval(interval);
  }, [phase]);

  // Watchdog: direct navigation inside the async setup chain can get swallowed, leaving
  // the user stuck on the spinner. If we're still assigning after 30s, surface the
  // state-driven error screen (with its retry) rather than spinning forever.
  useEffect(() => {
    if (phase !== 'assigning') return;
    const timeout = setTimeout(() => setPhase('error'), 30000);
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
    return (
      <View style={[styles.container, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 }]}>
        <View style={styles.content}>
          <View style={styles.iconArea}>
            <Text style={styles.icon}>!</Text>
          </View>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.errorText}>
            We could not build your program just now. Your subscription is active — please try again.
          </Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => {
              ran.current = true;
              runAssignment();
            }}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
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

        <Text style={styles.title}>Building your program</Text>

        <View style={styles.steps}>
          {STEPS.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <Text style={[styles.stepCheck, i <= currentStep && styles.stepCheckDone]}>
                {i < currentStep ? '✓' : '·'}
              </Text>
              <Text
                style={[
                  styles.stepText,
                  i <= currentStep && styles.stepTextActive,
                  i === currentStep && styles.stepTextCurrent,
                ]}
              >
                {step}
              </Text>
            </View>
          ))}
        </View>
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
    marginBottom: 28,
    letterSpacing: -0.3,
    textAlign: 'center',
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
  errorText: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 28,
  },
  retryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.card,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
