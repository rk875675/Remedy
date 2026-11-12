import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WarmBackground } from '../../components/onboarding/WarmBackground';
import { OptionCard } from '../../components/onboarding/OptionCard';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { PersonalizingLayout } from '../../components/onboarding/PersonalizingLayout';
import { useOnboarding, useTrackOnboardingStep } from '../../context/OnboardingContext';
import { colors } from '../../constants/colors';
import { PAIN_DURATION_OPTIONS } from '../../constants/onboardingQuestions';
import { getBubbleCopy } from '../../constants/personalizationBubbles';
import { PET_Q2, type PetSay } from '../../constants/petOnboardingLines';
import { type } from '../../constants/typography';
import { onboardingHintShown, onboardingOptionSelected } from '../../lib/analytics/events/onboarding';
import { useOnboardingStepCompletion } from '../../lib/analytics/onboardingSteps';

const Q2_REACTION_KEYS = Object.keys(PET_Q2.reactions);

function isQ2Key(key: string): key is keyof typeof PET_Q2.reactions {
  return Q2_REACTION_KEYS.includes(key);
}

function q2Say(id: string | null): PetSay {
  if (id && isQ2Key(id)) {
    const reaction = PET_Q2.reactions[id];
    const value = PAIN_DURATION_OPTIONS.find((opt) => opt.id === id)?.value;
    const hint = getBubbleCopy('pain_duration', value);
    if (hint) return { line: hint, mood: reaction.mood };
    return reaction;
  }
  return PET_Q2.prompt;
}

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
  const say = q2Say(selectedId);

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
      if (getBubbleCopy('pain_duration', opt.value)) {
        onboardingHintShown({ step_key: 'q2', hint_key: 'pain_duration' });
      }
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <WarmBackground />
      <PersonalizingLayout currentStep="q2" compact say={say}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.heading}>How long have you had it?</Text>
          <View style={styles.options}>
            {PAIN_DURATION_OPTIONS.map((opt) => (
              <OptionCard
                key={opt.id}
                label={opt.label}
                minHeight={76}
                selected={selectedId === opt.id}
                onPress={() => handleSelect(opt)}
              />
            ))}
          </View>
        </ScrollView>
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 8,
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
