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
import type { OnboardingAnswers } from '../../types/database';

const ICON_SIZE = 17;
const ICON_COLOR = '#FFFFFF';

// Gym-goer and powerlifter are folded into a single "Very active" tier. The engine still
// defines an `athlete` key, but the UI no longer emits it.
const options: { label: string; icon: React.ReactNode; value: OnboardingAnswers['activity_level'] }[] = [
  { label: 'Mostly sitting day-to-day', icon: <Ionicons name="laptop-outline" size={ICON_SIZE} color={ICON_COLOR} />, value: 'sedentary' },
  { label: 'Lightly active', icon: <Ionicons name="walk-outline" size={ICON_SIZE} color={ICON_COLOR} />, value: 'light' },
  { label: 'Very active / strength training', icon: <Ionicons name="barbell-outline" size={ICON_SIZE} color={ICON_COLOR} />, value: 'active' },
];

export default function Q4Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { answers, setAnswer } = useOnboarding();
  useTrackOnboardingStep('q4');

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <PersonalizingLayout>
        <View style={styles.content}>
          <Text style={styles.heading}>What's your activity level?</Text>
          <View style={styles.options}>
            {options.map((opt) => (
              <OptionCard
                key={opt.value}
                label={opt.label}
                icon={opt.icon}
                selected={answers.activity_level === opt.value}
                onPress={() => setAnswer('activity_level', opt.value)}
              />
            ))}
          </View>
        </View>
      </PersonalizingLayout>

      <ContinueButton
        onPress={() => router.push('/(onboarding)/q5')}
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
