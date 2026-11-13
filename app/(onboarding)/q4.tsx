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
import { ACTIVITY_LEVEL_OPTIONS } from '../../constants/onboardingQuestions';
import { ACTIVITY_ILLUSTRATIONS } from '../../constants/onboardingImages';
import { PET_Q4, type PetSay } from '../../constants/petOnboardingLines';
import { type } from '../../constants/typography';
import { onboardingOptionSelected } from '../../lib/analytics/events/onboarding';
import { useOnboardingStepCompletion } from '../../lib/analytics/onboardingSteps';
import type { OnboardingAnswers } from '../../types/database';

const Q4_REACTION_KEYS = Object.keys(PET_Q4.reactions);

function isQ4Key(key: string): key is keyof typeof PET_Q4.reactions {
  return Q4_REACTION_KEYS.includes(key);
}

function q4Say(current: string | null, lastTapped: string | null): PetSay {
  const key = lastTapped !== null ? (current === lastTapped ? lastTapped : null) : current;
  if (key && isQ4Key(key)) return PET_Q4.reactions[key];
  return PET_Q4.prompt;
}

export default function Q4Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { answers, setAnswer, clearAnswer } = useOnboarding();
  useTrackOnboardingStep('q4');
  const completeStep = useOnboardingStepCompletion();
  const [lastTapped, setLastTapped] = useState<string | null>(null);
  const say = q4Say(answers.activity_level ?? null, lastTapped);

  function handleSelect(value: OnboardingAnswers['activity_level']) {
    setLastTapped(value);
    const isDeselect = answers.activity_level === value;
    onboardingOptionSelected({
      step_key: 'q4',
      option_value: value,
      is_multi_select: false,
      is_deselect: isDeselect,
    });
    if (isDeselect) {
      clearAnswer('activity_level');
    } else {
      setAnswer('activity_level', value);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <WarmBackground />
      <PersonalizingLayout currentStep="q4" compact say={say}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          scrollEnabled={false}
          bounces={false}
          alwaysBounceVertical={false}
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.heading}>How active are you?</Text>
          <View style={styles.options}>
            {ACTIVITY_LEVEL_OPTIONS.map((opt) => (
              <OptionCard
                key={opt.value}
                label={opt.label}
                illustration={ACTIVITY_ILLUSTRATIONS[opt.value]}
                photoSize={84}
                selected={answers.activity_level === opt.value}
                onPress={() => handleSelect(opt.value)}
              />
            ))}
          </View>
        </ScrollView>
      </PersonalizingLayout>

      <ContinueButton
        onPress={() => {
          completeStep();
          router.push('/(onboarding)/q5');
        }}
        disabled={!answers.activity_level}
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
