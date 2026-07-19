import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OptionCard } from '../../components/onboarding/OptionCard';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { PersonalizingLayout } from '../../components/onboarding/PersonalizingLayout';
import { PersonalizationBubble } from '../../components/onboarding/PersonalizationBubble';
import { useOnboarding, useTrackOnboardingStep } from '../../context/OnboardingContext';
import { colors } from '../../constants/colors';
import { type } from '../../constants/typography';
import type { OnboardingAnswers } from '../../types/database';

type Cadence = 'every_day' | 'every_other_day';

const MINUTE_OPTIONS: { value: number; label: string }[] = [
  { value: 15, label: '15 minutes' },
  { value: 20, label: '20 minutes' },
  { value: 30, label: '30+ minutes' },
];
const RECOMMENDED_MINUTES = 15;

const CADENCE_OPTIONS: { label: string; subtitle: string; value: Cadence }[] = [
  { label: 'Every day', subtitle: 'A little, consistently', value: 'every_day' },
  { label: 'Every other day', subtitle: 'With rest days between', value: 'every_other_day' },
];

// Cadence drives the engine's sessions/week. Clamped into the supported 3-5 range: the DB
// CHECK (sessions_per_week_preference BETWEEN 2 AND 5), the client/Deno schemas, and the
// 5 seeded session blueprints all cap it at 5. Chosen minutes are a session-length signal
// the engine does not consume yet, so they stay in local state (out of the strict schema).
const CADENCE_TO_SESSIONS: Record<Cadence, number> = {
  every_day: 5,
  every_other_day: 3,
};

// Client mirror of assignment_rules v1 sessions/week recommendation
// (activity_level x pain_duration). Keep in sync with migration 014.
// // RESEARCH: calibrate PT-appropriate defaults before launch.
const RECOMMENDATION: Record<
  OnboardingAnswers['activity_level'],
  Record<OnboardingAnswers['pain_duration'], number>
> = {
  sedentary: { acute: 3, subacute: 3, chronic: 3 },
  light: { acute: 3, subacute: 3, chronic: 4 },
  active: { acute: 3, subacute: 4, chronic: 4 },
  athlete: { acute: 4, subacute: 4, chronic: 5 },
};

function recommendedCadence(
  activity: OnboardingAnswers['activity_level'] | undefined,
  duration: OnboardingAnswers['pain_duration'] | undefined,
): Cadence {
  if (!activity || !duration) return 'every_other_day';
  const sessions = RECOMMENDATION[activity]?.[duration] ?? 3;
  return sessions >= 4 ? 'every_day' : 'every_other_day';
}

export default function Q8Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { answers, setAnswer, progress, setLocalAnswer } = useOnboarding();
  useTrackOnboardingStep('q8');

  const suggestedCadence = recommendedCadence(answers.activity_level, answers.pain_duration);

  // Minutes are a session-length signal the engine does not consume yet, so they stay
  // out of the strict schema — persisted via progress so they restore on resume/back.
  const [minutes, setMinutes] = useState<number>(() => progress?.minutes ?? RECOMMENDED_MINUTES);
  const [cadence, setCadence] = useState<Cadence>(suggestedCadence);

  function handleMinutes(value: number) {
    setMinutes(value);
    setLocalAnswer('minutes', value);
  }

  // Pre-select the recommended cadence so a sensible default is highlighted and the
  // program has a sessions/week value; the user can override either control.
  useEffect(() => {
    if (answers.sessions_per_week_preference == null) {
      setAnswer('sessions_per_week_preference', CADENCE_TO_SESSIONS[suggestedCadence]);
    }
  }, [suggestedCadence]);

  function handleCadence(value: Cadence) {
    setCadence(value);
    setAnswer('sessions_per_week_preference', CADENCE_TO_SESSIONS[value]);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <PersonalizingLayout>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.heading}>How much time can you give your back each day?</Text>

          <View style={styles.options}>
            {MINUTE_OPTIONS.map((opt) => (
              <OptionCard
                key={opt.value}
                label={opt.label}
                subtitle={opt.value === RECOMMENDED_MINUTES ? 'Recommended for you' : undefined}
                selected={minutes === opt.value}
                onPress={() => handleMinutes(opt.value)}
              />
            ))}
          </View>

          <Text style={styles.subheading}>How often?</Text>
          <View style={styles.options}>
            {CADENCE_OPTIONS.map((opt) => (
              <OptionCard
                key={opt.value}
                label={opt.label}
                subtitle={opt.value === suggestedCadence ? 'Recommended for you' : opt.subtitle}
                selected={cadence === opt.value}
                onPress={() => handleCadence(opt.value)}
              />
            ))}
          </View>

          <PersonalizationBubble
            field="sessions_per_week_preference"
            value={answers.sessions_per_week_preference}
          />
        </ScrollView>
      </PersonalizingLayout>

      <ContinueButton
        onPress={() => router.push('/(onboarding)/finalizing')}
        disabled={answers.sessions_per_week_preference == null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  heading: {
    ...type.question,
    color: colors.textPrimary,
    marginBottom: 24,
  },
  subheading: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 24,
    marginBottom: 16,
  },
  options: {
    gap: 12,
  },
});
