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
import { PAIN_LOCATION_OPTIONS } from '../../constants/onboardingQuestions';
import { LOCATION_IMAGES } from '../../constants/onboardingImages';
import type { OnboardingAnswers } from '../../types/database';

export default function Q1Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { answers, setAnswer, clearAnswer } = useOnboarding();
  useTrackOnboardingStep('q1');
  const completeStep = useOnboardingStepCompletion();

  function handleSelect(value: OnboardingAnswers['pain_location']) {
    const isDeselect = answers.pain_location === value;
    onboardingOptionSelected({
      step_key: 'q1',
      option_value: value,
      is_multi_select: false,
      is_deselect: isDeselect,
    });
    if (isDeselect) {
      clearAnswer('pain_location');
    } else {
      setAnswer('pain_location', value);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <PersonalizingLayout currentStep="q1" compact>
        <View style={styles.content}>
          <Text style={styles.heading}>Where is your back pain?</Text>
          <View style={styles.options}>
            {PAIN_LOCATION_OPTIONS.map((opt) => (
              <OptionCard
                key={opt.value}
                label={opt.label}
                image={LOCATION_IMAGES[opt.value]}
                photoSize={84}
                selected={answers.pain_location === opt.value}
                onPress={() => handleSelect(opt.value)}
                hint={
                  answers.pain_location === opt.value ? (
                    <PersonalizationHint field="pain_location" value={opt.value} />
                  ) : null
                }
              />
            ))}
          </View>
        </View>
      </PersonalizingLayout>

      <ContinueButton
        onPress={() => {
          completeStep();
          router.push('/(onboarding)/q2');
        }}
        disabled={!answers.pain_location}
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
