import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, useWindowDimensions } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WarmBackground } from '../../components/onboarding/WarmBackground';
import { PetBubble } from '../../components/pet/PetSays';
import { PetRollTrack } from '../../components/pet/PetRoll';
import { colors, serifFont } from '../../constants/colors';
import { PET_PRESENTS, fillPetLine } from '../../constants/petOnboardingLines';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';
import { useOnboarding } from '../../context/OnboardingContext';
import { useOnboardingPet } from '../../lib/useOnboardingPet';
import { prefetchPlanPreview } from '../../lib/planPreview';

const steps = [
  'Analyzing your pain profile...',
  'Matching exercises to your needs...',
  'Building your weekly schedule...',
  'Finalizing your program...',
];

// Each line stays active, then checks off. The bar fills across the same span
// so it hits 100% on the last check. Hold after that so the check is on screen
// before Your Program — the old timer left at 100% while the last line was
// still a dot (`i < currentStep` never included the final step).
const STEP_MS = 900;
const DONE_HOLD_MS = 800;

const SOCIAL_PROOF =
  '4 in 5 adults experience back pain at some point. Staying active with structured, gradual movement is one of the best-supported ways to manage it.';

export default function FinalizingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { answers } = useOnboarding();
  const { name } = useOnboardingPet();
  // Checked-off count. Equals `steps.length` once the last line has a check.
  const [completed, setCompleted] = useState(0);

  useEffect(() => {
    prefetchPlanPreview(answers);
  }, [answers]);

  const fillAnim = useRef(new Animated.Value(0)).current;
  const proofOpacity = useRef(new Animated.Value(0)).current;
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    Animated.timing(proofOpacity, {
      toValue: 1,
      duration: 400,
      delay: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [proofOpacity]);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    Animated.timing(fillAnim, {
      toValue: 1,
      duration: steps.length * STEP_MS,
      easing: Easing.linear,
      // Width interpolation cannot use the native driver.
      useNativeDriver: false,
    }).start();

    for (let i = 0; i < steps.length; i++) {
      timers.push(
        setTimeout(() => {
          if (!cancelled) setCompleted(i + 1);
        }, (i + 1) * STEP_MS),
      );
    }

    timers.push(
      setTimeout(() => {
        if (!cancelled) routerRef.current.replace('/(onboarding)/match');
      }, steps.length * STEP_MS + DONE_HOLD_MS),
    );

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      fillAnim.stopAnimation();
    };
  }, [fillAnim]);

  const fillWidth = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });
  const activeIndex = completed < steps.length ? completed : -1;

  return (
    <View
      style={[
        styles.container,
        {
          // The roll-plus-bubble stack is taller than the old side-by-side pet.
          // On a 667pt phone the original +60 top padding leaves the checklist
          // against the proof card, so that padding shrinks only on short screens.
          paddingTop: insets.top + (height < 720 ? 32 : 60),
          paddingBottom: insets.bottom + 40,
        },
      ]}
    >
      <Stack.Screen options={{ gestureEnabled: false, headerShown: false }} />
      <WarmBackground />
      <View style={styles.content}>
        <View style={styles.rollWrap}>
          <PetRollTrack size={84} />
        </View>
        <View style={styles.bubbleWrap}>
          <PetBubble line={fillPetLine(PET_PRESENTS.finalizing.line, { name })} />
        </View>

        <Text style={styles.title}>Building your plan</Text>

        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: fillWidth }]} />
        </View>

        <View style={styles.steps}>
          {steps.map((step, i) => {
            const done = i < completed;
            return (
              <View key={step} style={styles.stepRow}>
                <Text style={[styles.stepCheck, done && styles.stepCheckDone]}>
                  {done ? '✓' : '·'}
                </Text>
                <Text
                  style={[
                    styles.stepText,
                    (done || i === activeIndex) && styles.stepTextActive,
                    i === activeIndex && styles.stepTextCurrent,
                  ]}
                >
                  {step}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <Animated.View style={[styles.proofCard, { opacity: proofOpacity }]}>
        <Text style={styles.proofText}>{SOCIAL_PROOF}</Text>
      </Animated.View>
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
  rollWrap: {
    alignSelf: 'stretch',
    width: '100%',
  },
  bubbleWrap: {
    marginTop: 14,
    marginBottom: 28,
    maxWidth: 320,
    alignSelf: 'center',
  },
  title: {
    fontSize: 26,
    fontFamily: serifFont,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 28,
    letterSpacing: -0.3,
  },
  progressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 32,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
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
  proofCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: 18,
    ...shadows.low,
  },
  proofText: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
