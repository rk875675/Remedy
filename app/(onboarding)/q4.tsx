import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OptionCard } from '../../components/onboarding/OptionCard';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { PersonalizingLayout } from '../../components/onboarding/PersonalizingLayout';
import { useOnboarding, useTrackOnboardingStep } from '../../context/OnboardingContext';
import { colors } from '../../constants/colors';
import { type } from '../../constants/typography';
import { onboardingOptionSelected } from '../../lib/analytics/events/onboarding';
import { useOnboardingStepCompletion } from '../../lib/analytics/onboardingSteps';
import { ACTIVITY_LEVEL_OPTIONS } from '../../constants/onboardingQuestions';
import { ACTIVITY_ILLUSTRATIONS } from '../../constants/onboardingImages';
import type { OnboardingAnswers } from '../../types/database';

export default function Q4Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { answers, setAnswer, clearAnswer } = useOnboarding();
  useTrackOnboardingStep('q4');
  const completeStep = useOnboardingStepCompletion();

  function handleSelect(value: OnboardingAnswers['activity_level']) {
    const isDeselect = answers.activity_level === value;
    onboardingOptionSelected({
      step_key: 'q4',
      option_value: value,
      is_multi_select: false,
      is_deselect: isDeselect,
    });
    if (isDeselect) {
      clearAnswer('activity_level');
    } else {
      setAnswer('activity_level', value);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <PersonalizingLayout currentStep="q4" compact>
        <View style={styles.content}>
          <Text style={styles.heading}>How active are you?</Text>
          <View style={styles.options}>
            {ACTIVITY_LEVEL_OPTIONS.map((opt) => (
              <OptionCard
                key={opt.value}
                label={opt.label}
                illustration={ACTIVITY_ILLUSTRATIONS[opt.value]}
                photoSize={84}
                selected={answers.activity_level === opt.value}
                onPress={() => handleSelect(opt.value)}
              />
            ))}
          </View>
        </View>
      </PersonalizingLayout>

      <ContinueButton
        onPress={() => {
          completeStep();
          router.push('/(onboarding)/q5');
        }}
        disabled={!answers.activity_level}
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
    marginBottom: 20,
  },
  options: {
    gap: 10,
  },
});
