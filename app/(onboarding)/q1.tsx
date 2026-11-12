import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WarmBackground } from '../../components/onboarding/WarmBackground';
import { OptionCard } from '../../components/onboarding/OptionCard';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { PersonalizingLayout } from '../../components/onboarding/PersonalizingLayout';
import { PersonalizationHint } from '../../components/onboarding/PersonalizationHint';
import { useOnboarding, useTrackOnboardingStep } from '../../context/OnboardingContext';
import { colors } from '../../constants/colors';
import { PAIN_LOCATION_OPTIONS } from '../../constants/onboardingQuestions';
import { LOCATION_IMAGES } from '../../constants/onboardingImages';
import { PET_Q1, type PetSay } from '../../constants/petOnboardingLines';
import { type } from '../../constants/typography';
import { onboardingOptionSelected } from '../../lib/analytics/events/onboarding';
import { useOnboardingStepCompletion } from '../../lib/analytics/onboardingSteps';
import type { OnboardingAnswers } from '../../types/database';

const Q1_REACTION_KEYS = Object.keys(PET_Q1.reactions);

function isQ1Key(key: string): key is keyof typeof PET_Q1.reactions {
  return Q1_REACTION_KEYS.includes(key);
}

function q1Say(current: string | null, lastTapped: string | null): PetSay {
  const key = lastTapped !== null ? (current === lastTapped ? lastTapped : null) : current;
  if (key && isQ1Key(key)) return PET_Q1.reactions[key];
  return PET_Q1.prompt;
}

export default function Q1Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { answers, setAnswer, clearAnswer } = useOnboarding();
  useTrackOnboardingStep('q1');
  const completeStep = useOnboardingStepCompletion();
  const [lastTapped, setLastTapped] = useState<string | null>(null);
  const say = q1Say(answers.pain_location ?? null, lastTapped);

  function handleSelect(value: OnboardingAnswers['pain_location']) {
    setLastTapped(value);
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
      <WarmBackground />
      <PersonalizingLayout currentStep="q1" compact say={say}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
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
        </ScrollView>
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
