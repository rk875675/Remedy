import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { OptionCard } from '../../components/onboarding/OptionCard';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { PersonalizingLayout } from '../../components/onboarding/PersonalizingLayout';
import { PersonalizationBubble } from '../../components/onboarding/PersonalizationBubble';
import { useOnboarding } from '../../context/OnboardingContext';
import { colors } from '../../constants/colors';
import { type } from '../../constants/typography';
import type { MainGoal } from '../../types/database';

const ICON_SIZE = 17;
const ICON_COLOR = '#FFFFFF';

const options: { label: string; icon: React.ReactNode; value: MainGoal }[] = [
  { label: 'Reduce daily pain', icon: <Ionicons name="heart-outline" size={ICON_SIZE} color={ICON_COLOR} />, value: 'reduce_pain' },
  { label: 'Get back to working out', icon: <Ionicons name="trending-up-outline" size={ICON_SIZE} color={ICON_COLOR} />, value: 'return_to_exercise' },
  { label: 'Sleep better', icon: <Ionicons name="moon-outline" size={ICON_SIZE} color={ICON_COLOR} />, value: 'sleep' },
  { label: 'Improve mobility', icon: <Ionicons name="walk-outline" size={ICON_SIZE} color={ICON_COLOR} />, value: 'mobility' },
];

export default function Q6Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { answers, setAnswer } = useOnboarding();

  const selected = answers.main_goal ?? [];

  function toggle(val: MainGoal) {
    const next = selected.includes(val)
      ? selected.filter((v) => v !== val)
      : [...selected, val];
    setAnswer('main_goal', next);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <PersonalizingLayout>
        <View style={styles.content}>
          <Text style={styles.heading}>What's your main goal?</Text>
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
          <PersonalizationBubble field="main_goal" value={selected[0]} />
        </View>
      </PersonalizingLayout>

      <ContinueButton
        onPress={() => router.push('/(onboarding)/q1')}
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
