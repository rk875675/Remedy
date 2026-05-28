import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OptionCard } from '../../components/onboarding/OptionCard';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { PersonalizingLayout } from '../../components/onboarding/PersonalizingLayout';
import { useOnboarding } from '../../context/OnboardingContext';
import { colors } from '../../constants/colors';
import type { OnboardingAnswers } from '../../types/database';

const options: { label: string; value: OnboardingAnswers['pain_duration'] }[] = [
  { label: 'Less than 2 weeks', value: 'acute' },
  { label: '2 weeks \u2013 3 months', value: 'subacute' },
  { label: '3+ months', value: 'chronic' },
];

export default function Q2Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { answers, setAnswer } = useOnboarding();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <PersonalizingLayout step={2} totalSteps={5}>
        <View style={styles.content}>
          <Text style={styles.heading}>How long have you had it?</Text>
          <View style={styles.options}>
            {options.map((opt) => (
              <OptionCard
                key={opt.value}
                label={opt.label}
                selected={answers.pain_duration === opt.value}
                onPress={() => setAnswer('pain_duration', opt.value)}
              />
            ))}
          </View>
        </View>
      </PersonalizingLayout>

      <ContinueButton
        onPress={() => router.push('/(onboarding)/q3')}
        disabled={!answers.pain_duration}
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
    fontSize: 26,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 28,
  },
  options: {
    gap: 12,
  },
});
