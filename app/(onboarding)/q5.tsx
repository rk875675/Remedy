import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { OptionCard } from '../../components/onboarding/OptionCard';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { PersonalizingLayout } from '../../components/onboarding/PersonalizingLayout';
import { useOnboarding, useTrackOnboardingStep } from '../../context/OnboardingContext';
import { colors } from '../../constants/colors';
import { type } from '../../constants/typography';
import type { PainTrigger } from '../../types/database';

const ICON_SIZE = 17;
const ICON_COLOR = '#FFFFFF';

// Trimmed to four broad triggers. The PainTrigger enum still carries `exercise`/`other`
// for back-compat, but the UI folds those into the remaining options.
const options: { label: string; icon: React.ReactNode; value: PainTrigger }[] = [
  { label: 'Sitting too long', icon: <Ionicons name="desktop-outline" size={ICON_SIZE} color={ICON_COLOR} />, value: 'sitting' },
  { label: 'Bending or lifting', icon: <Ionicons name="trending-down-outline" size={ICON_SIZE} color={ICON_COLOR} />, value: 'bending' },
  { label: 'Standing or walking', icon: <Ionicons name="walk-outline" size={ICON_SIZE} color={ICON_COLOR} />, value: 'standing' },
  { label: 'Mornings / after rest', icon: <Ionicons name="moon-outline" size={ICON_SIZE} color={ICON_COLOR} />, value: 'morning' },
];

export default function Q5Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { answers, setAnswer } = useOnboarding();
  useTrackOnboardingStep('q5');

  const selected = answers.pain_trigger ?? [];

  function toggle(val: PainTrigger) {
    const next = selected.includes(val)
      ? selected.filter((v) => v !== val)
      : [...selected, val];
    setAnswer('pain_trigger', next);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <PersonalizingLayout>
        <View style={styles.content}>
          <Text style={styles.heading}>What makes your pain worse?</Text>
          <Text style={styles.subheading}>Select all that apply</Text>
          <View style={styles.options}>
            {options.map((opt) => (
              <OptionCard
                key={opt.value}
                label={opt.label}
                icon={opt.icon}
                selected={selected.includes(opt.value)}
                onPress={() => toggle(opt.value)}
              />
            ))}
          </View>
        </View>
      </PersonalizingLayout>

      <ContinueButton
        onPress={() => router.push('/(onboarding)/q7')}
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
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  heading: {
    ...type.question,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  subheading: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 24,
  },
  options: {
    gap: 12,
  },
});
