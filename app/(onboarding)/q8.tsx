import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OptionCard } from '../../components/onboarding/OptionCard';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { PersonalizingLayout } from '../../components/onboarding/PersonalizingLayout';
import { PersonalizationBubble } from '../../components/onboarding/PersonalizationBubble';
import { useOnboarding } from '../../context/OnboardingContext';
import { colors } from '../../constants/colors';
import { type } from '../../constants/typography';
import type { OnboardingAnswers } from '../../types/database';

const options: { label: string; value: number }[] = [
  { label: '3 days', value: 3 },
  { label: '4 days', value: 4 },
  { label: '5 days', value: 5 },
];

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

function recommendedSessions(
  activity: OnboardingAnswers['activity_level'] | undefined,
  duration: OnboardingAnswers['pain_duration'] | undefined,
): number {
  if (!activity || !duration) return 3;
  return Math.max(3, RECOMMENDATION[activity]?.[duration] ?? 3);
}

export default function Q8Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { answers, setAnswer } = useOnboarding();

  const recommended = recommendedSessions(answers.activity_level, answers.pain_duration);

  // Pre-select the recommended cadence so a default is highlighted; the user can override.
  useEffect(() => {
    if (answers.sessions_per_week_preference == null) {
      setAnswer('sessions_per_week_preference', recommended);
    }
  }, [recommended]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <PersonalizingLayout>
        <View style={styles.content}>
          <Text style={styles.heading}>How many days per week do you want to work out?</Text>
          <View style={styles.options}>
            {options.map((opt) => (
              <OptionCard
                key={opt.value}
                label={opt.label}
                subtitle={opt.value === recommended ? 'Recommended for you' : undefined}
                selected={answers.sessions_per_week_preference === opt.value}
                onPress={() => setAnswer('sessions_per_week_preference', opt.value)}
              />
            ))}
          </View>
          <PersonalizationBubble
            field="sessions_per_week_preference"
            value={answers.sessions_per_week_preference}
          />
        </View>
      </PersonalizingLayout>

      <ContinueButton
        onPress={() => router.push('/(onboarding)/interstitial3')}
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
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  heading: {
    ...type.question,
    color: colors.textPrimary,
    marginBottom: 28,
  },
  options: {
    gap: 12,
  },
});
