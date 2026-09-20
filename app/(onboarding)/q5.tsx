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
import { PAIN_TRIGGER_OPTIONS } from '../../constants/onboardingQuestions';
import { TRIGGER_ILLUSTRATIONS } from '../../constants/onboardingImages';
import type { PainTrigger } from '../../types/database';

export default function Q5Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { answers, setAnswer } = useOnboarding();
  useTrackOnboardingStep('q5');
  const completeStep = useOnboardingStepCompletion();

  const selected = answers.pain_trigger ?? [];

  function toggle(val: PainTrigger) {
    const isDeselect = selected.includes(val);
    const next = isDeselect ? selected.filter((v) => v !== val) : [...selected, val];
    setAnswer('pain_trigger', next);
    onboardingOptionSelected({
      step_key: 'q5',
      option_value: val,
      is_multi_select: true,
      is_deselect: isDeselect,
      selection_count: next.length,
    });
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <PersonalizingLayout currentStep="q5" compact>
        <View style={styles.content}>
          <Text style={styles.heading}>What makes your pain worse?</Text>
          <Text style={styles.subheading}>Select all that apply</Text>
          <View style={styles.options}>
            {PAIN_TRIGGER_OPTIONS.map((opt) => (
              <OptionCard
                key={opt.value}
                label={opt.label}
                illustration={TRIGGER_ILLUSTRATIONS[opt.value]}
                photoSize={80}
                selected={selected.includes(opt.value)}
                onPress={() => toggle(opt.value)}
              />
            ))}
          </View>
        </View>
      </PersonalizingLayout>

      <ContinueButton
        onPress={() => {
          completeStep(selected.length);
          router.push('/(onboarding)/q7');
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
