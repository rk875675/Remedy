import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OptionCard } from '../../components/onboarding/OptionCard';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { useOnboarding, useTrackOnboardingStep } from '../../context/OnboardingContext';
import { colors } from '../../constants/colors';
import { type } from '../../constants/typography';
import { setPersonProperties } from '../../lib/analytics';
import { onboardingOptionSelected } from '../../lib/analytics/events/onboarding';
import { useOnboardingStepCompletion } from '../../lib/analytics/onboardingSteps';

type PriorAttemptAnswer = 'yes' | 'no';

const options: { label: string; value: PriorAttemptAnswer }[] = [
  { label: 'Yes', value: 'yes' },
  { label: 'No', value: 'no' },
];

export default function Q9Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { progress, setLocalAnswer } = useOnboarding();
  useTrackOnboardingStep('q9');
  const completeStep = useOnboardingStepCompletion();
  // Analytics/intent signal only (not in the strict answers schema). Persisted via
  // progress so it restores on resume/back-navigation.
  const [answer, setAnswer] = useState<PriorAttemptAnswer | null>(
    () => (progress?.tried_before as PriorAttemptAnswer | null) ?? null,
  );

  function handleSelect(value: PriorAttemptAnswer) {
    const isDeselect = answer === value;
    onboardingOptionSelected({
      step_key: 'q9',
      option_value: value,
      is_multi_select: false,
      is_deselect: isDeselect,
    });
    if (isDeselect) {
      setAnswer(null);
      setLocalAnswer('tried_before', null);
    } else {
      setAnswer(value);
      setLocalAnswer('tried_before', value);
      setPersonProperties({ prior_attempts: value });
    }
  }

  function handleContinue() {
    if (!answer) return;
    completeStep();
    router.push('/(onboarding)/recognize');
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.content}>
        <Text style={styles.heading}>Have you tried to fix your back pain before?</Text>
        <View style={styles.options}>
          {options.map((opt) => (
            <OptionCard
              key={opt.value}
              label={opt.label}
              selected={answer === opt.value}
              onPress={() => handleSelect(opt.value)}
            />
          ))}
        </View>
      </View>

      <ContinueButton onPress={handleContinue} disabled={!answer} />
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
