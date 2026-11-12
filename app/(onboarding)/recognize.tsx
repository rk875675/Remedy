import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WarmBackground } from '../../components/onboarding/WarmBackground';
import { OptionCard } from '../../components/onboarding/OptionCard';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { PetSays } from '../../components/pet/PetSays';
import { useOnboarding, useTrackOnboardingStep } from '../../context/OnboardingContext';
import { colors } from '../../constants/colors';
import { recognizeOptionsFor, type RecognizeKey } from '../../constants/mindset';
import { recognizeIllustrationsFor } from '../../constants/onboardingImages';
import { PET_RECOGNIZE, type PetSay } from '../../constants/petOnboardingLines';
import { type } from '../../constants/typography';
import { onboardingHintShown, onboardingOptionSelected } from '../../lib/analytics/events/onboarding';
import { useOnboardingStepCompletion } from '../../lib/analytics/onboardingSteps';
import { useOnboardingPet } from '../../lib/useOnboardingPet';

export default function RecognizeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { progress, setLocalAnswer } = useOnboarding();
  const { stage } = useOnboardingPet();
  useTrackOnboardingStep('recognize');
  const completeStep = useOnboardingStepCompletion();

  const selected = progress?.recognize_selected ?? [];
  const options = recognizeOptionsFor(progress?.tried_before);
  const illustrations = recognizeIllustrationsFor(progress?.tried_before);
  const reaction =
    selected.length >= 3 ? PET_RECOGNIZE.many : selected.length > 0 ? PET_RECOGNIZE.some : PET_RECOGNIZE.prompt;
  // Caption sat on the first selected card, with that card's own hint (tried-before copy).
  const firstHint = options.find((opt) => opt.value === selected[0])?.hint;
  const say: PetSay = firstHint ? { line: firstHint, mood: reaction.mood } : reaction;

  function toggle(value: RecognizeKey) {
    const isDeselect = selected.includes(value);
    const next = isDeselect ? selected.filter((item) => item !== value) : [...selected, value];
    setLocalAnswer('recognize_selected', next);
    onboardingOptionSelected({
      step_key: 'recognize',
      option_value: value,
      is_multi_select: true,
      is_deselect: isDeselect,
      selection_count: next.length,
    });
    if (!isDeselect && options.some((opt) => opt.value === value && opt.hint)) {
      onboardingHintShown({ step_key: 'recognize', hint_key: 'recognize' });
    }
  }

  function handleContinue() {
    setLocalAnswer('recognize_completed', true);
    completeStep(selected.length);
    router.push('/(onboarding)/seen');
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <WarmBackground />
      <View style={styles.content}>
        <View style={styles.say}>
          <PetSays line={say.line} mood={say.mood} stage={stage} size={56} entrance="drop" />
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.heading}>Which of these sound like you?</Text>
          <Text style={styles.subheading}>Select any that apply</Text>
          <View style={styles.options}>
            {options.map((opt) => (
              <OptionCard
                key={opt.value}
                label={opt.label}
                illustration={illustrations[opt.value]}
                photoSize={80}
                selected={selected.includes(opt.value)}
                onPress={() => toggle(opt.value)}
              />
            ))}
          </View>
        </ScrollView>
      </View>

      <ContinueButton onPress={handleContinue} />
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
  },
  say: {
    marginBottom: 16,
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
});
