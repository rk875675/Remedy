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

const options: { label: string; icon: React.ReactNode; value: OnboardingAnswers['pain_type'] }[] = [
  { label: 'Stiffness', icon: <Ionicons name="reorder-four-outline" size={ICON_SIZE} color={ICON_COLOR} />, value: 'stiffness' },
  { label: 'Dull ache', icon: <Ionicons name="ellipse-outline" size={ICON_SIZE} color={ICON_COLOR} />, value: 'ache' },
  { label: 'Sharp pain', icon: <Ionicons name="flash-outline" size={ICON_SIZE} color={ICON_COLOR} />, value: 'sharp' },
  { label: 'Multiple types', icon: <Ionicons name="apps-outline" size={ICON_SIZE} color={ICON_COLOR} />, value: 'multiple' },
];

export default function Q3Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { answers, setAnswer } = useOnboarding();

  const showWarning =
    answers.pain_type === 'sharp' && answers.pain_duration === 'acute';

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <PersonalizingLayout step={3} totalSteps={5}>
        <View style={styles.content}>
          <Text style={styles.heading}>How would you describe it?</Text>
          <View style={styles.options}>
            {options.map((opt) => (
              <OptionCard
                key={opt.value}
                label={opt.label}
                icon={opt.icon}
                selected={answers.pain_type === opt.value}
                onPress={() => setAnswer('pain_type', opt.value)}
              />
            ))}
          </View>

          {showWarning && (
            <Text style={styles.warning}>
              This sounds like it could be acute. We recommend seeing a doctor
              first — you can still continue.
            </Text>
          )}
        </View>
      </PersonalizingLayout>

      <ContinueButton
        onPress={() => router.push('/(onboarding)/q4')}
        disabled={!answers.pain_type}
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
  warning: {
    marginTop: 16,
    fontSize: 14,
    color: colors.warning,
    lineHeight: 20,
    paddingHorizontal: 4,
  },
});
