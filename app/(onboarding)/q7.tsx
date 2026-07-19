import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OptionCard } from '../../components/onboarding/OptionCard';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { PersonalizingLayout } from '../../components/onboarding/PersonalizingLayout';
import { EquipmentDisclaimerModal } from '../../components/onboarding/EquipmentDisclaimerModal';
import { useOnboarding, useTrackOnboardingStep } from '../../context/OnboardingContext';
import { colors } from '../../constants/colors';
import { type } from '../../constants/typography';
import type { OnboardingAnswers, EquipmentTier } from '../../types/database';

const options: {
  label: string;
  subtitle?: string;
  value: NonNullable<OnboardingAnswers['equipment']>;
}[] = [
  {
    label: 'Full gym access',
    subtitle: 'Machines, free weights, cables',
    value: 'gym',
  },
  {
    label: 'Bands & light dumbbells',
    subtitle: 'Resistance bands, 5–15 lb weights',
    value: 'bands_dumbbells',
  },
  {
    label: 'Open floor space',
    subtitle: 'Room for mat work and stretching',
    value: 'open_space',
  },
];

export default function Q7Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { answers, setAnswer } = useOnboarding();
  useTrackOnboardingStep('q7');
  // Tracks which equipment values have already triggered the disclaimer during
  // this visit to the screen — each value only pops up once, even if the user
  // taps through all three in sequence. Resets on remount (e.g. leaving and
  // returning to onboarding), which is intentional: no persistence needed.
  const [seenValues, setSeenValues] = useState<Set<EquipmentTier>>(new Set());
  const [disclaimerValue, setDisclaimerValue] = useState<EquipmentTier | null>(null);

  function handleSelect(value: EquipmentTier) {
    setAnswer('equipment', value);
    if (!seenValues.has(value)) {
      setSeenValues((prev) => new Set(prev).add(value));
      setDisclaimerValue(value);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <PersonalizingLayout>
        <View style={styles.content}>
          <Text style={styles.heading}>What equipment do you have access to?</Text>
          <View style={styles.options}>
            {options.map((opt) => (
              <OptionCard
                key={opt.value}
                label={opt.label}
                subtitle={opt.subtitle}
                selected={answers.equipment === opt.value}
                onPress={() => handleSelect(opt.value)}
              />
            ))}
          </View>
        </View>
      </PersonalizingLayout>

      <ContinueButton
        onPress={() => router.push('/(onboarding)/q8')}
        disabled={!answers.equipment}
      />

      <EquipmentDisclaimerModal value={disclaimerValue} onConfirm={() => setDisclaimerValue(null)} />
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
    marginBottom: 28,
  },
  options: {
    gap: 12,
  },
});
