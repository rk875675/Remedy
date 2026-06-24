import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { OptionCard } from '../../components/onboarding/OptionCard';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { PersonalizingLayout } from '../../components/onboarding/PersonalizingLayout';
import { useOnboarding } from '../../context/OnboardingContext';
import { colors } from '../../constants/colors';
import { type } from '../../constants/typography';
import type { PainTrigger } from '../../types/database';

const ICON_SIZE = 17;
const ICON_COLOR = '#FFFFFF';

const options: { label: string; icon: React.ReactNode; value: PainTrigger }[] = [
  { label: 'Sitting too long', icon: <Ionicons name="desktop-outline" size={ICON_SIZE} color={ICON_COLOR} />, value: 'sitting' },
  { label: 'Bending forward', icon: <Ionicons name="trending-down-outline" size={ICON_SIZE} color={ICON_COLOR} />, value: 'bending' },
  { label: 'Standing', icon: <Ionicons name="body-outline" size={ICON_SIZE} color={ICON_COLOR} />, value: 'standing' },
  { label: 'Morning stiffness', icon: <Ionicons name="moon-outline" size={ICON_SIZE} color={ICON_COLOR} />, value: 'morning' },
  { label: 'Exercise', icon: <Ionicons name="barbell-outline" size={ICON_SIZE} color={ICON_COLOR} />, value: 'exercise' },
  { label: 'Other', icon: <Ionicons name="ellipsis-horizontal-outline" size={ICON_SIZE} color={ICON_COLOR} />, value: 'other' },
];

export default function Q5Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { answers, setAnswer } = useOnboarding();

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
