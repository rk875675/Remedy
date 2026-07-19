import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { OptionCard } from '../../components/onboarding/OptionCard';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { useOnboarding, useTrackOnboardingStep } from '../../context/OnboardingContext';
import { colors } from '../../constants/colors';
import { type } from '../../constants/typography';
import { trackEvent } from '../../lib/analytics';

type PriorAttemptAnswer = 'yes' | 'no';

const ICON_SIZE = 17;
const ICON_COLOR = '#FFFFFF';

const options: { label: string; icon: React.ReactNode; value: PriorAttemptAnswer }[] = [
  { label: 'Yes', icon: <Feather name="thumbs-up" size={ICON_SIZE} color={ICON_COLOR} />, value: 'yes' },
  { label: 'No', icon: <Feather name="thumbs-down" size={ICON_SIZE} color={ICON_COLOR} />, value: 'no' },
];

export default function Q9Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { progress, setLocalAnswer } = useOnboarding();
  useTrackOnboardingStep('q9');
  // Analytics/intent signal only (not in the strict answers schema). Persisted via
  // progress so it restores on resume/back-navigation.
  const [answer, setAnswer] = useState<PriorAttemptAnswer | null>(
    () => (progress?.tried_before as PriorAttemptAnswer | null) ?? null,
  );

  function handleSelect(value: PriorAttemptAnswer) {
    setAnswer(value);
    setLocalAnswer('tried_before', value);
  }

  function handleContinue() {
    if (!answer) return;
    trackEvent('onboarding_prior_attempts', { tried_before: answer === 'yes' });
    router.push('/(onboarding)/q6');
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
              icon={opt.icon}
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
