import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../constants/colors';

const steps = [
  'Analyzing your pain profile...',
  'Matching exercises to your needs...',
  'Building your weekly schedule...',
  'Finalizing your program...',
];

export default function FinalizingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
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
    if (progress < 25) setCurrentStep(0);
    else if (progress < 50) setCurrentStep(1);
    else if (progress < 75) setCurrentStep(2);
    else setCurrentStep(3);
  }, [progress]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 }]}>
      <View style={styles.content}>
        <View style={styles.iconArea}>
          <Text style={styles.icon}>◎</Text>
        </View>

        <Text style={styles.title}>Building your plan</Text>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>

        <View style={styles.steps}>
          {steps.map((step, i) => (
            <Text
              key={i}
              style={[
                styles.stepText,
                i <= currentStep && styles.stepTextActive,
                i === currentStep && styles.stepTextCurrent,
              ]}
            >
              {i < currentStep ? '✓  ' : '    '}{step}
            </Text>
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
  iconArea: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  icon: {
    fontSize: 36,
    color: '#FFFFFF',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 28,
  },
  progressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: '#E8E0DC',
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
  stepText: {
    fontSize: 15,
    color: '#D0C8C3',
  },
  stepTextActive: {
    color: colors.textSecondary,
  },
  stepTextCurrent: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
});
