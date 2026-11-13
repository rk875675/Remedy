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
import { PAIN_TRIGGER_OPTIONS } from '../../constants/onboardingQuestions';
import { TRIGGER_ILLUSTRATIONS } from '../../constants/onboardingImages';
import { PET_Q5, type PetSay } from '../../constants/petOnboardingLines';
import { type } from '../../constants/typography';
import { onboardingOptionSelected } from '../../lib/analytics/events/onboarding';
import { useOnboardingStepCompletion } from '../../lib/analytics/onboardingSteps';
import type { PainTrigger } from '../../types/database';

const Q5_REACTION_KEYS = Object.keys(PET_Q5.reactions);

function isQ5Key(key: string): key is keyof typeof PET_Q5.reactions {
  return Q5_REACTION_KEYS.includes(key);
}

function q5Say(selectedKeys: readonly PainTrigger[], lastTapped: PainTrigger | null): PetSay {
  if (lastTapped !== null && selectedKeys.includes(lastTapped)) {
    return isQ5Key(lastTapped) ? PET_Q5.reactions[lastTapped] : PET_Q5.prompt;
  }
  for (let i = selectedKeys.length - 1; i >= 0; i -= 1) {
    const key = selectedKeys[i];
    if (key && isQ5Key(key)) return PET_Q5.reactions[key];
  }
  return PET_Q5.prompt;
}

export default function Q5Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { answers, setAnswer } = useOnboarding();
  useTrackOnboardingStep('q5');
  const completeStep = useOnboardingStepCompletion();
  const [lastTapped, setLastTapped] = useState<PainTrigger | null>(null);

  const selected = answers.pain_trigger ?? [];
  const say = q5Say(selected, lastTapped);

  function toggle(val: PainTrigger) {
    setLastTapped(val);
    const isDeselect = selected.includes(val);
    const next = isDeselect ? selected.filter((v) => v !== val) : [...selected, val];
    setAnswer('pain_trigger', next);
    onboardingOptionSelected({
      step_key: 'q5',
      option_value: val,
      is_multi_select: true,
      is_deselect: isDeselect,
      selection_count: next.length,
    });
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 4, paddingBottom: insets.bottom + 4 }]}>
      <WarmBackground />
      <PersonalizingLayout currentStep="q5" compact say={say}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          scrollEnabled={false}
          bounces={false}
          alwaysBounceVertical={false}
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.heading}>What makes your pain worse?</Text>
          <Text style={styles.subheading}>Select all that apply</Text>
          <View style={styles.options}>
            {PAIN_TRIGGER_OPTIONS.map((opt) => (
              <OptionCard
                key={opt.value}
                label={opt.label}
                illustration={TRIGGER_ILLUSTRATIONS[opt.value]}
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
          router.push('/(onboarding)/q7');
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
    marginBottom: 16,
  },
  scrollContent: {
    paddingBottom: 0,
  },
  heading: {
    ...type.question,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  subheading: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  options: {
    gap: 10,
  },
});
