import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { colors } from '../../constants/colors';
import { useOnboarding } from '../../context/OnboardingContext';
import type { OnboardingAnswers } from '../../types/database';

type PersonalizingLayoutProps = {
  children: React.ReactNode;
};

type AnswerField = keyof Omit<
  OnboardingAnswers,
  'id' | 'user_id' | 'completed_at' | 'created_at'
>;

const bars: { label: string; fields: AnswerField[] }[] = [
  { label: 'Pain profile', fields: ['main_goal', 'pain_location'] },
  { label: 'Activity level', fields: ['pain_duration', 'pain_type'] },
  {
    label: 'Preferences',
    fields: ['activity_level', 'pain_trigger', 'equipment', 'sessions_per_week_preference'],
  },
];

function segmentProgress(answers: Partial<Record<AnswerField, unknown>>, fields: AnswerField[]): number {
  const answered = fields.filter((field) => answers[field] != null).length;
  return answered / fields.length;
}

function AnimatedBarFill({ progress }: { progress: number }) {
  const animated = useRef(new Animated.Value(progress)).current;

  useEffect(() => {
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

export function PersonalizingLayout({ children }: PersonalizingLayoutProps) {
  const { answers } = useOnboarding();

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Personalizing your plan</Text>

      <View style={styles.barsContainer}>
        {bars.map((bar) => {
          const progress = segmentProgress(answers, bar.fields);

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
  barsContainer: {
    gap: 12,
    marginBottom: 32,
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
