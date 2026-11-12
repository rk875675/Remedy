import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { colors } from '../../constants/colors';
import type { PetMood } from '../../constants/petImages';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';
import { PetSays } from '../pet/PetSays';
import { useOnboarding } from '../../context/OnboardingContext';
import { useOnboardingPet } from '../../lib/useOnboardingPet';
import type { OnboardingAnswers } from '../../types/database';

type PersonalizingLayoutProps = {
  children: React.ReactNode;
  /**
   * The step key of the screen that owns this layout (e.g. 'q1', 'q6').
   * The plan card will only reflect fields whose data is collected on this step or
   * earlier in the flow — so swiping back reveals a partially-filled state
   * that matches the screen being revealed, not the furthest-answered state.
   */
  currentStep: PersonalizingStep;
  compact?: boolean;
  /** Pet line above the plan card. Omitted on screens that do not show the pet. */
  say?: { line: string; mood: PetMood };
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

const PROGRESS_FIELDS = Object.keys(FIELD_UNLOCKED_AT) as AnswerField[];

const FOCUS_LABEL: Record<OnboardingAnswers['pain_location'], string> = {
  upper: 'Upper back',
  lower: 'Lower back',
  all: 'Whole back',
};

// Mirrors assignment_rules v1 global.duration_weeks (migration 014, live DB).
// Keep in sync if the rules change, or the card will disagree with the match screen.
const WEEKS: Record<OnboardingAnswers['pain_duration'], number> = {
  acute: 4,
  subacute: 5,
  chronic: 6,
};

// Coarse read of the engine's starting intensity: acute pain starts one tier lower
// (starting_intensity_offset) and activity scales intensity (intensity_multiplier).
function startLabel(
  duration: OnboardingAnswers['pain_duration'],
  activity: OnboardingAnswers['activity_level'] | undefined,
): string {
  if (duration === 'acute' || activity === 'sedentary') return 'Gentle';
  if (activity === 'active' || activity === 'athlete') return 'Stronger';
  return 'Steady';
}

function isAnswered(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
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

export function PersonalizingLayout({
  children,
  currentStep,
  compact = false,
  say,
}: PersonalizingLayoutProps) {
  const { answers } = useOnboarding();
  const { stage } = useOnboardingPet();
  const currentStepIndex = STEP_INDEX[currentStep];

  // Only reflect answers collected on this step or earlier, so swiping back shows
  // the card as it was on the screen being revealed.
  const visible = <K extends AnswerField>(field: K) =>
    (FIELD_UNLOCKED_AT[field] ?? 0) <= currentStepIndex && isAnswered(answers[field])
      ? answers[field]
      : undefined;

  const location = visible('pain_location');
  const duration = visible('pain_duration');
  const activity = visible('activity_level');

  const slots = [
    { label: 'Focus', value: location ? FOCUS_LABEL[location] : null },
    { label: 'Start', value: duration ? startLabel(duration, activity) : null },
    { label: 'Length', value: duration ? `${WEEKS[duration]} weeks` : null },
  ];

  const progress =
    PROGRESS_FIELDS.filter((field) => visible(field) !== undefined).length / PROGRESS_FIELDS.length;

  return (
    <View style={styles.container}>
      {say ? (
        <View style={styles.say}>
          <PetSays line={say.line} mood={say.mood} stage={stage} size={56} />
        </View>
      ) : null}
      <View style={[styles.card, (compact || say != null) && styles.cardCompact]}>
        <Text style={styles.header}>Your plan</Text>
        <View style={styles.slots}>
          {slots.map((slot) => (
            <View key={slot.label} style={styles.slot}>
              <Text style={styles.slotLabel}>{slot.label}</Text>
              <Text
                style={[styles.slotValue, !slot.value && styles.slotValueEmpty]}
                numberOfLines={1}
              >
                {slot.value ?? '—'}
              </Text>
            </View>
          ))}
        </View>
        <View style={styles.barTrack}>
          <AnimatedBarFill progress={progress} />
        </View>
      </View>

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  say: {
    marginBottom: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    marginBottom: 28,
    ...shadows.low,
  },
  cardCompact: {
    marginBottom: 16,
  },
  header: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textTertiary,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  slots: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  slot: {
    flex: 1,
    gap: 2,
  },
  slotLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  slotValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primaryDeep,
    letterSpacing: -0.2,
  },
  slotValueEmpty: {
    color: colors.textTertiary,
    fontWeight: '500',
  },
  barTrack: {
    height: 4,
    backgroundColor: colors.borderLight,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
});
