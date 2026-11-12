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
import { PAIN_TYPE_OPTIONS } from '../../constants/onboardingQuestions';
import { PAIN_TYPE_IMAGES } from '../../constants/onboardingImages';
import { PET_Q3, type PetSay } from '../../constants/petOnboardingLines';
import { type } from '../../constants/typography';
import { onboardingHintShown, onboardingOptionSelected } from '../../lib/analytics/events/onboarding';
import { useOnboardingStepCompletion } from '../../lib/analytics/onboardingSteps';
import type { PainType } from '../../types/database';

const NERVE_NOTE =
  'Shooting or tingling into a leg can take months to settle, so early weeks stay calm on purpose.';

const Q3_REACTION_KEYS = Object.keys(PET_Q3.reactions);

function isQ3Key(key: string): key is keyof typeof PET_Q3.reactions {
  return Q3_REACTION_KEYS.includes(key);
}

function q3Say(
  selectedKeys: readonly PainType[],
  lastTapped: PainType | null,
  nerveNote: boolean,
): PetSay {
  const apply = (key: keyof typeof PET_Q3.reactions): PetSay => {
    const reaction = PET_Q3.reactions[key];
    if (key === 'nerve' && nerveNote && selectedKeys.includes('nerve')) {
      return { line: NERVE_NOTE, mood: reaction.mood };
    }
    return reaction;
  };

  if (lastTapped !== null && selectedKeys.includes(lastTapped)) {
    return isQ3Key(lastTapped) ? apply(lastTapped) : PET_Q3.prompt;
  }
  for (let i = selectedKeys.length - 1; i >= 0; i -= 1) {
    const key = selectedKeys[i];
    if (key && isQ3Key(key)) return apply(key);
  }
  return PET_Q3.prompt;
}

export default function Q3Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { answers, setAnswer } = useOnboarding();
  useTrackOnboardingStep('q3');
  const completeStep = useOnboardingStepCompletion();
  const [nerveNoteSeen, setNerveNoteSeen] = useState(
    () => (answers.pain_type ?? []).includes('nerve'),
  );
  const [lastTapped, setLastTapped] = useState<PainType | null>(null);

  const selected = answers.pain_type ?? [];
  const say = q3Say(selected, lastTapped, nerveNoteSeen);
  const showAcuteNote =
    (selected.includes('sharp') || selected.includes('nerve')) &&
    answers.pain_duration === 'acute';

  function toggle(val: PainType) {
    setLastTapped(val);
    const isDeselect = selected.includes(val);
    const next = isDeselect ? selected.filter((v) => v !== val) : [...selected, val];
    setAnswer('pain_type', next);
    onboardingOptionSelected({
      step_key: 'q3',
      option_value: val,
      is_multi_select: true,
      is_deselect: isDeselect,
      selection_count: next.length,
    });
    if (val === 'nerve' && !isDeselect && !nerveNoteSeen) {
      setNerveNoteSeen(true);
    }
    if (!isDeselect && val === 'nerve') {
      onboardingHintShown({ step_key: 'q3', hint_key: 'pain_type' });
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <WarmBackground />
      <PersonalizingLayout currentStep="q3" compact say={say}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.heading}>What does it feel like?</Text>
          <Text style={styles.subheading}>Select all that apply</Text>
          <View style={styles.options}>
            {PAIN_TYPE_OPTIONS.map((opt) => (
              <OptionCard
                key={opt.value}
                label={opt.label}
                image={PAIN_TYPE_IMAGES[opt.value]}
                photoSize={80}
                selected={selected.includes(opt.value)}
                onPress={() => toggle(opt.value)}
              />
            ))}
          </View>

          {showAcuteNote ? (
            <Text style={styles.acuteNote}>
              If this started in the last two weeks, check with a doctor if it gets worse. You can keep going.
            </Text>
          ) : null}
        </ScrollView>
      </PersonalizingLayout>

      <ContinueButton
        onPress={() => {
          completeStep(selected.length);
          router.push('/(onboarding)/q4');
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
    paddingBottom: 8,
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
  acuteNote: {
    marginTop: 16,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textTertiary,
  },
});
