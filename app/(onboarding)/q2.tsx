import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
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

// Longer, more relatable durations. Several map into the same engine bucket
// (acute/subacute/chronic) so the assignment logic is unchanged — the extra granularity
// is purely so people with months/years/decades of pain feel seen.
const options: { id: string; label: string; value: OnboardingAnswers['pain_duration'] }[] = [
  { id: 'lt_2w', label: 'Less than 2 weeks', value: 'acute' },
  { id: '2w_3m', label: '2 weeks to 3 months', value: 'subacute' },
  { id: '3_12m', label: '3 to 12 months', value: 'chronic' },
  { id: '1_5y', label: '1 to 5 years', value: 'chronic' },
  { id: '5y_plus', label: 'More than 5 years', value: 'chronic' },
];

export default function Q2Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { answers, setAnswer } = useOnboarding();
  useTrackOnboardingStep('q2');
  // Track the exact row so the highlight is unambiguous even when several rows share a
  // bucket. Restore from the stored bucket on back-navigation (first matching row).
  const [selectedId, setSelectedId] = useState<string | null>(
    () => options.find((o) => o.value === answers.pain_duration)?.id ?? null,
  );

  function handleSelect(opt: (typeof options)[number]) {
    setSelectedId(opt.id);
    setAnswer('pain_duration', opt.value);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <PersonalizingLayout>
        <View style={styles.content}>
          <Text style={styles.heading}>How long have you had it?</Text>
          <View style={styles.options}>
            {options.map((opt) => (
              <OptionCard
                key={opt.id}
                label={opt.label}
                selected={selectedId === opt.id}
                onPress={() => handleSelect(opt)}
              />
            ))}
          </View>
          <PersonalizationBubble field="pain_duration" value={answers.pain_duration} />
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
    ...type.question,
    color: colors.textPrimary,
    marginBottom: 28,
  },
  options: {
    gap: 12,
  },
});
