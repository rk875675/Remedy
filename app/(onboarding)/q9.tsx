import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WarmBackground } from '../../components/onboarding/WarmBackground';
import { OptionCard } from '../../components/onboarding/OptionCard';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { PetSays } from '../../components/pet/PetSays';
import { useOnboarding, useTrackOnboardingStep } from '../../context/OnboardingContext';
import { colors } from '../../constants/colors';
import { PET_Q9, type PetSay } from '../../constants/petOnboardingLines';
import { type } from '../../constants/typography';
import { setPersonProperties } from '../../lib/analytics';
import { onboardingHintShown, onboardingOptionSelected } from '../../lib/analytics/events/onboarding';
import type { AppBelief } from '../../lib/analytics/events/enums';
import { useOnboardingStepCompletion } from '../../lib/analytics/onboardingSteps';
import { useOnboardingPet } from '../../lib/useOnboardingPet';

const options: {
  label: string;
  value: AppBelief;
}[] = [
  { label: 'Yes', value: 'yes' },
  { label: 'Maybe', value: 'maybe' },
  { label: 'No', value: 'no' },
];

function q9Say(value: AppBelief | null): PetSay {
  if (value === 'yes') return PET_Q9.yes;
  if (value === 'maybe') return PET_Q9.unsure;
  if (value === 'no') return PET_Q9.no;
  return PET_Q9.prompt;
}

export default function Q9Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { progress, setLocalAnswer } = useOnboarding();
  const { stage } = useOnboardingPet();
  useTrackOnboardingStep('q9');
  const completeStep = useOnboardingStepCompletion();
  // Analytics signal only (not in the strict answers schema). Persisted via progress
  // so it restores on resume/back-navigation.
  const answer = progress?.app_belief ?? null;
  const say = q9Say(answer);

  function handleSelect(value: AppBelief) {
    const isDeselect = answer === value;
    onboardingOptionSelected({
      step_key: 'q9',
      option_value: value,
      is_multi_select: false,
      is_deselect: isDeselect,
    });
    if (isDeselect) {
      setLocalAnswer('app_belief', null);
      return;
    }
    setLocalAnswer('app_belief', value);
    setPersonProperties({ app_belief: value });
    onboardingHintShown({ step_key: 'q9', hint_key: 'app_belief' });
  }

  function handleContinue() {
    if (!answer) return;
    completeStep();
    router.push('/(onboarding)/recognize');
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <WarmBackground />
      <View style={styles.content}>
        <View style={styles.say}>
          <PetSays line={say.line} mood={say.mood} stage={stage} size={56} entrance="spin" />
        </View>
        <Text style={styles.heading}>Do you believe Remedy can fix your back pain?</Text>
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
  say: {
    marginBottom: 16,
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
