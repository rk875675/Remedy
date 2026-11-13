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
import { MAIN_GOAL_OPTIONS } from '../../constants/onboardingQuestions';
import { GOAL_ILLUSTRATIONS } from '../../constants/onboardingImages';
import { getBubbleCopy } from '../../constants/personalizationBubbles';
import { PET_Q6, type PetSay } from '../../constants/petOnboardingLines';
import { type } from '../../constants/typography';
import { onboardingHintShown, onboardingOptionSelected } from '../../lib/analytics/events/onboarding';
import { useOnboardingStepCompletion } from '../../lib/analytics/onboardingSteps';
import type { MainGoal } from '../../types/database';

const Q6_REACTION_KEYS = Object.keys(PET_Q6.reactions);

function isQ6Key(key: string): key is keyof typeof PET_Q6.reactions {
  return Q6_REACTION_KEYS.includes(key);
}

function q6Say(selectedKeys: readonly MainGoal[], lastTapped: MainGoal | null): PetSay {
  const apply = (key: keyof typeof PET_Q6.reactions): PetSay => {
    const reaction = PET_Q6.reactions[key];
    const hint = getBubbleCopy('main_goal', key);
    if (hint) return { line: hint, mood: reaction.mood };
    return reaction;
  };

  if (lastTapped !== null && selectedKeys.includes(lastTapped)) {
    return isQ6Key(lastTapped) ? apply(lastTapped) : PET_Q6.prompt;
  }
  for (let i = selectedKeys.length - 1; i >= 0; i -= 1) {
    const key = selectedKeys[i];
    if (key && isQ6Key(key)) return apply(key);
  }
  return PET_Q6.prompt;
}

export default function Q6Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { answers, setAnswer } = useOnboarding();
  useTrackOnboardingStep('q6');
  const completeStep = useOnboardingStepCompletion();
  const [lastTapped, setLastTapped] = useState<MainGoal | null>(null);

  const selected = answers.main_goal ?? [];
  const say = q6Say(selected, lastTapped);

  function toggle(val: MainGoal) {
    setLastTapped(val);
    const isDeselect = selected.includes(val);
    const next = isDeselect ? selected.filter((v) => v !== val) : [...selected, val];
    setAnswer('main_goal', next);
    onboardingOptionSelected({
      step_key: 'q6',
      option_value: val,
      is_multi_select: true,
      is_deselect: isDeselect,
      selection_count: next.length,
    });
    if (!isDeselect && getBubbleCopy('main_goal', val)) {
      onboardingHintShown({ step_key: 'q6', hint_key: 'main_goal' });
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <WarmBackground />
      <PersonalizingLayout currentStep="q6" compact say={say}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.heading}>What's your main goal?</Text>
          <Text style={styles.subheading}>Select all that apply</Text>
          <View style={styles.options}>
            {MAIN_GOAL_OPTIONS.map((opt) => (
              <OptionCard
                key={opt.value}
                label={opt.label}
                illustration={GOAL_ILLUSTRATIONS[opt.value]}
                photoSize={80}
                selected={selected.includes(opt.value)}
                onPress={() => toggle(opt.value)}
              />
            ))}
          </View>
        </ScrollView>
      </PersonalizingLayout>

      <ContinueButton
        onPress={() => {
          completeStep(selected.length);
          router.push('/(onboarding)/q1');
        }}
        disabled={selected.length === 0}
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
    paddingBottom: 24,
  },
  heading: {
    ...type.question,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  subheading: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 20,
  },
  options: {
    gap: 10,
  },
});
