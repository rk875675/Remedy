import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, serifFont } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';

const steps = [
  'Analyzing your pain profile...',
  'Matching exercises to your needs...',
  'Building your weekly schedule...',
  'Finalizing your program...',
];

const SOCIAL_PROOF =
  '80% of adults experience back pain at some point — most recover fully with the right movement plan.';

export default function FinalizingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);

  const fillAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const proofOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Gentle breathing pulse on the icon while the plan "builds".
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

    Animated.timing(proofOpacity, {
      toValue: 1,
      duration: 400,
      delay: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = prev + 2;
        if (next >= 100) {
          clearInterval(interval);
          setTimeout(() => router.replace('/(onboarding)/match'), 400);
          return 100;
        }
        return next;
      });
    }, 50);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: progress,
      duration: 60,
      easing: Easing.linear,
      // Width interpolation cannot use the native driver.
      useNativeDriver: false,
    }).start();

    if (progress < 25) setCurrentStep(0);
    else if (progress < 50) setCurrentStep(1);
    else if (progress < 75) setCurrentStep(2);
    else setCurrentStep(3);
  }, [progress]);

  const fillWidth = fillAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 }]}>
      <View style={styles.content}>
        <Animated.View style={[styles.iconWrap, { transform: [{ scale: pulseAnim }] }]}>
          <View style={styles.iconHalo} />
          <View style={styles.iconArea}>
            <Text style={styles.icon}>◎</Text>
          </View>
        </Animated.View>

        <Text style={styles.title}>Building your plan</Text>

        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: fillWidth }]} />
        </View>

        <View style={styles.steps}>
          {steps.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <Text style={[styles.stepCheck, i < currentStep && styles.stepCheckDone]}>
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
