import React, { useState } from 'react';
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
import { PAIN_DURATION_OPTIONS } from '../../constants/onboardingQuestions';
import type { OnboardingAnswers } from '../../types/database';

export default function Q2Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { answers, setAnswer, clearAnswer } = useOnboarding();
  useTrackOnboardingStep('q2');
  const completeStep = useOnboardingStepCompletion();
  // Track the exact row so the highlight is unambiguous even when several rows share a
  // bucket. Restore from the stored bucket on back-navigation (first matching row).
  const [selectedId, setSelectedId] = useState<string | null>(
    () => PAIN_DURATION_OPTIONS.find((o) => o.value === answers.pain_duration)?.id ?? null,
  );

  function handleSelect(opt: (typeof PAIN_DURATION_OPTIONS)[number]) {
    const isDeselect = selectedId === opt.id;
    // The engine bucket, not the row id — several rows share a bucket and the bucket
    // is what every downstream analysis segments on.
    onboardingOptionSelected({
      step_key: 'q2',
      option_value: opt.value,
      is_multi_select: false,
      is_deselect: isDeselect,
    });
    if (isDeselect) {
      setSelectedId(null);
      clearAnswer('pain_duration');
    } else {
      setSelectedId(opt.id);
      setAnswer('pain_duration', opt.value);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <PersonalizingLayout currentStep="q2" compact>
        <View style={styles.content}>
          <Text style={styles.heading}>How long have you had it?</Text>
          <View style={styles.options}>
            {PAIN_DURATION_OPTIONS.map((opt) => (
              <OptionCard
                key={opt.id}
                label={opt.label}
                minHeight={76}
                hintLift={9}
                selected={selectedId === opt.id}
                onPress={() => handleSelect(opt)}
                hint={
                  selectedId === opt.id ? (
                    <PersonalizationHint field="pain_duration" value={opt.value} />
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
          router.push('/(onboarding)/q3');
        }}
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
    marginBottom: 20,
  },
  options: {
    gap: 10,
  },
});
