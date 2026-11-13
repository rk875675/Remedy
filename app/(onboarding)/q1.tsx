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
import { PAIN_LOCATION_OPTIONS } from '../../constants/onboardingQuestions';
import { LOCATION_IMAGES } from '../../constants/onboardingImages';
import { getBubbleCopy } from '../../constants/personalizationBubbles';
import { PET_Q1, type PetSay } from '../../constants/petOnboardingLines';
import { type } from '../../constants/typography';
import { onboardingHintShown, onboardingOptionSelected } from '../../lib/analytics/events/onboarding';
import { useOnboardingStepCompletion } from '../../lib/analytics/onboardingSteps';
import type { OnboardingAnswers } from '../../types/database';

const Q1_REACTION_KEYS = Object.keys(PET_Q1.reactions);

function isQ1Key(key: string): key is keyof typeof PET_Q1.reactions {
  return Q1_REACTION_KEYS.includes(key);
}

function q1Say(current: string | null, lastTapped: string | null): PetSay {
  const key = lastTapped !== null ? (current === lastTapped ? lastTapped : null) : current;
  if (key && isQ1Key(key)) {
    const reaction = PET_Q1.reactions[key];
    const hint = getBubbleCopy('pain_location', key);
    if (hint) return { line: hint, mood: reaction.mood };
    return reaction;
  }
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
      if (getBubbleCopy('pain_location', value)) {
        onboardingHintShown({ step_key: 'q1', hint_key: 'pain_location' });
      }
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <WarmBackground />
      <PersonalizingLayout currentStep="q1" compact say={say}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          scrollEnabled={false}
          bounces={false}
          alwaysBounceVertical={false}
          overScrollMode="never"
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
    marginBottom: 16,
  },
  scrollContent: {
    paddingBottom: 0,
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
