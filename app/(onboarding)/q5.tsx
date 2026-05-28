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
import type { OnboardingAnswers } from '../../types/database';

const ICON_SIZE = 17;
const ICON_COLOR = '#FFFFFF';

const options: { label: string; icon: React.ReactNode; value: OnboardingAnswers['pain_trigger'] }[] = [
  { label: 'Sitting too long', icon: <Ionicons name="desktop-outline" size={ICON_SIZE} color={ICON_COLOR} />, value: 'sitting' },
  { label: 'Bending forward', icon: <Ionicons name="trending-down-outline" size={ICON_SIZE} color={ICON_COLOR} />, value: 'bending' },
  { label: 'Standing', icon: <Ionicons name="body-outline" size={ICON_SIZE} color={ICON_COLOR} />, value: 'standing' },
  { label: 'Morning stiffness', icon: <Ionicons name="moon-outline" size={ICON_SIZE} color={ICON_COLOR} />, value: 'morning' },
  { label: 'Exercise', icon: <Ionicons name="barbell-outline" size={ICON_SIZE} color={ICON_COLOR} />, value: 'exercise' },
];

export default function Q5Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { answers, setAnswer } = useOnboarding();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <PersonalizingLayout step={5} totalSteps={5}>
        <View style={styles.content}>
          <Text style={styles.heading}>What makes your pain worse?</Text>
          <View style={styles.options}>
            {options.map((opt) => (
              <OptionCard
                key={opt.value}
                label={opt.label}
                icon={opt.icon}
                selected={answers.pain_trigger === opt.value}
                onPress={() => setAnswer('pain_trigger', opt.value)}
              />
            ))}
          </View>
        </View>
      </PersonalizingLayout>

      <ContinueButton
        onPress={() => router.push('/(onboarding)/interstitial3')}
        disabled={!answers.pain_trigger}
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
    fontSize: 26,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 28,
  },
  options: {
    gap: 12,
  },
});
