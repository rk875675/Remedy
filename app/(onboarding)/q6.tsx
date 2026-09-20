import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OptionCard } from '../../components/onboarding/OptionCard';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { PersonalizingLayout } from '../../components/onboarding/PersonalizingLayout';
import { PersonalizationHint } from '../../components/onboarding/PersonalizationHint';
import { useOnboarding, useTrackOnboardingStep } from '../../context/OnboardingContext';
import { colors } from '../../constants/colors';
import { type } from '../../constants/typography';
import { onboardingOptionSelected } from '../../lib/analytics/events/onboarding';
import { useOnboardingStepCompletion } from '../../lib/analytics/onboardingSteps';
import { MAIN_GOAL_OPTIONS } from '../../constants/onboardingQuestions';
import { GOAL_ILLUSTRATIONS } from '../../constants/onboardingImages';
import type { MainGoal } from '../../types/database';

export default function Q6Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { answers, setAnswer } = useOnboarding();
  useTrackOnboardingStep('q6');
  const completeStep = useOnboardingStepCompletion();

  const selected = answers.main_goal ?? [];

  function toggle(val: MainGoal) {
    const isDeselect = selected.includes(val);
    const next = isDeselect ? selected.filter((v) => v !== val) : [...selected, val];
    setAnswer('main_goal', next);
    onboardingOptionSelected({
      step_key: 'q6',
      option_value: val,
      is_multi_select: true,
      is_deselect: isDeselect,
      selection_count: next.length,
    });
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <PersonalizingLayout currentStep="q6" compact>
        <View style={styles.content}>
          <Text style={styles.heading}>What's your main goal?</Text>
          <Text style={styles.subheading}>Select all that apply</Text>
          <View style={styles.options}>
            {MAIN_GOAL_OPTIONS.map((opt) => (
              <OptionCard
                key={opt.value}
                label={opt.label}
                illustration={GOAL_ILLUSTRATIONS[opt.value]}
                photoSize={80}
                selected={selected.includes(opt.value)}
                onPress={() => toggle(opt.value)}
                hint={
                  selected[0] === opt.value ? (
                    <PersonalizationHint field="main_goal" value={opt.value} />
                  ) : null
                }
              />
            ))}
          </View>
        </View>
      </PersonalizingLayout>

      <ContinueButton
        onPress={() => {
          completeStep(selected.length);
          router.push('/(onboarding)/q1');
        }}
        disabled={selected.length === 0}
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
    marginBottom: 6,
  },
  subheading: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 20,
  },
  options: {
    gap: 10,
  },
});
