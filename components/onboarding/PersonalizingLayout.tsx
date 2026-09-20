import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { colors } from '../../constants/colors';
import { useOnboarding } from '../../context/OnboardingContext';
import type { OnboardingAnswers } from '../../types/database';

type PersonalizingLayoutProps = {
  children: React.ReactNode;
  /**
   * The step key of the screen that owns this layout (e.g. 'q1', 'q6').
   * The bars will only count fields whose data is collected on this step or
   * earlier in the flow — so swiping back reveals a partially-filled state
   * that matches the screen being revealed, not the furthest-answered state.
   */
  currentStep: PersonalizingStep;
  compact?: boolean;
};

/**
 * The ordered steps that use PersonalizingLayout.
 * Order matches the actual navigation sequence: q6 → q1 → q2 → … → q8.
 */
const PERSONALIZING_STEPS = ['q6', 'q1', 'q2', 'q3', 'q4', 'q5', 'q7', 'q8'] as const;
type PersonalizingStep = (typeof PERSONALIZING_STEPS)[number];

const STEP_INDEX: Readonly<Record<PersonalizingStep, number>> = {
  q6: 0,
  q1: 1,
  q2: 2,
  q3: 3,
  q4: 4,
  q5: 5,
  q7: 6,
  q8: 7,
};

type AnswerField = keyof Omit<
  OnboardingAnswers,
  'id' | 'user_id' | 'completed_at' | 'created_at'
>;

/**
 * The step index at which each field is first collected.
 * A field is not counted toward bar progress until the current screen is at
 * or past the step that asks for it.
 */
const FIELD_UNLOCKED_AT: Partial<Record<AnswerField, number>> = {
  main_goal: 0,                      // q6
  pain_location: 1,                  // q1
  pain_duration: 2,                  // q2
  pain_type: 3,                      // q3
  activity_level: 4,                 // q4
  pain_trigger: 5,                   // q5
  equipment: 6,                      // q7
  sessions_per_week_preference: 7,   // q8
};

const bars: { label: string; fields: AnswerField[] }[] = [
  { label: 'Your pain', fields: ['main_goal', 'pain_location'] },
  { label: 'How active', fields: ['pain_duration', 'pain_type'] },
  {
    label: 'Your setup',
    fields: ['activity_level', 'pain_trigger', 'equipment', 'sessions_per_week_preference'],
  },
];

function segmentProgress(
  answers: Partial<Record<AnswerField, unknown>>,
  fields: AnswerField[],
  currentStepIndex: number,
): number {
  // Denominator is always the total fields in this bar so each bar fills
  // proportionally as new questions are asked and answered.
  const answered = fields.filter((field) => {
    // Don't count fields that haven't been asked yet on this screen.
    const unlockedAt = FIELD_UNLOCKED_AT[field] ?? 0;
    if (unlockedAt > currentStepIndex) return false;

    const value = answers[field];
    if (value == null) return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  }).length;
  return answered / fields.length;
}

function AnimatedBarFill({ progress }: { progress: number }) {
  const animated = useRef(new Animated.Value(progress)).current;
  const skipFirst = useRef(true);

  useEffect(() => {
    // First paint is already at `progress`. Animating width on mount
    // (JS driver) hitches the screen slide that just pushed this page.
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    Animated.timing(animated, {
      toValue: progress,
      duration: 350,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress, animated]);

  const width = animated.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return <Animated.View style={[styles.barFill, { width }]} />;
}

export function PersonalizingLayout({ children, currentStep, compact = false }: PersonalizingLayoutProps) {
  const { answers } = useOnboarding();
  const currentStepIndex = STEP_INDEX[currentStep];

  return (
    <View style={styles.container}>
      <Text style={[styles.header, compact && styles.headerCompact]}>Building your plan</Text>

      <View style={[styles.barsContainer, compact && styles.barsContainerCompact]}>
        {bars.map((bar) => {
          const progress = segmentProgress(answers, bar.fields, currentStepIndex);

          return (
            <View key={bar.label} style={styles.barRow}>
              <Text style={[styles.barLabel, progress > 0 && styles.barLabelActive]}>
                {bar.label}
              </Text>
              <View style={styles.barTrack}>
                <AnimatedBarFill progress={progress} />
              </View>
            </View>
          );
        })}
      </View>

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 16,
  },
  headerCompact: {
    marginBottom: 10,
  },
  barsContainer: {
    gap: 12,
    marginBottom: 32,
  },
  barsContainerCompact: {
    gap: 8,
    marginBottom: 16,
  },
  barRow: {
    gap: 6,
  },
  barLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  barLabelActive: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  barTrack: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
});
