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
import { EQUIPMENT_OPTIONS } from '../../constants/onboardingQuestions';
import { PET_Q7, type PetSay } from '../../constants/petOnboardingLines';
import { radius } from '../../constants/spacing';
import { type } from '../../constants/typography';
import { onboardingHintShown, onboardingOptionSelected } from '../../lib/analytics/events/onboarding';
import { useOnboardingStepCompletion } from '../../lib/analytics/onboardingSteps';
import type { EquipmentTier } from '../../types/database';

const NUDGE: Partial<Record<EquipmentTier, string>> = {
  bands_dumbbells: 'A gym would give us more ways to progress.',
  open_space: 'Bands or a gym would give you more room to progress.',
};

const Q7_REACTION_KEYS = Object.keys(PET_Q7.reactions);

function isQ7Key(key: string): key is keyof typeof PET_Q7.reactions {
  return Q7_REACTION_KEYS.includes(key);
}

function q7Say(current: string | null, lastTapped: string | null): PetSay {
  const key = lastTapped !== null ? (current === lastTapped ? lastTapped : null) : current;
  if (key && isQ7Key(key)) return PET_Q7.reactions[key];
  return PET_Q7.prompt;
}

export default function Q7Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { answers, setAnswer, clearAnswer } = useOnboarding();
  useTrackOnboardingStep('q7');
  const completeStep = useOnboardingStepCompletion();
  const [lastTapped, setLastTapped] = useState<string | null>(null);
  const say = q7Say(answers.equipment ?? null, lastTapped);

  function handleSelect(value: EquipmentTier) {
    setLastTapped(value);
    const isDeselect = answers.equipment === value;
    onboardingOptionSelected({
      step_key: 'q7',
      option_value: value,
      is_multi_select: false,
      is_deselect: isDeselect,
    });
    if (isDeselect) {
      clearAnswer('equipment');
    } else {
      setAnswer('equipment', value);
      if (value !== 'gym') {
        onboardingHintShown({ step_key: 'q7', hint_key: 'equipment' });
      }
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <WarmBackground />
      <PersonalizingLayout currentStep="q7" compact say={say}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.heading}>What can you use?</Text>
          <Text style={styles.subheading}>
            Gym access gives us the most room to progress. Bands and light dumbbells are the next
            best thing.
          </Text>
          <View style={styles.options}>
            {EQUIPMENT_OPTIONS.map((opt) => (
              <OptionCard
                key={opt.value}
                label={opt.label}
                subtitle={opt.subtitle}
                badge={opt.badge}
                selected={answers.equipment === opt.value}
                onPress={() => handleSelect(opt.value)}
              />
            ))}
          </View>
          {answers.equipment && NUDGE[answers.equipment] ? (
            <View style={styles.nudge}>
              <Text style={styles.nudgeText}>{NUDGE[answers.equipment]}</Text>
            </View>
          ) : null}
        </ScrollView>
      </PersonalizingLayout>

      <ContinueButton
        onPress={() => {
          completeStep();
          router.push('/(onboarding)/q8');
        }}
        disabled={!answers.equipment}
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
    marginBottom: 8,
  },
  subheading: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.textSecondary,
    marginBottom: 20,
  },
  options: {
    gap: 10,
  },
  nudge: {
    marginTop: 12,
    borderRadius: radius.chip,
    backgroundColor: colors.secondaryMuted,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  nudgeText: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    fontWeight: '500',
  },
});
