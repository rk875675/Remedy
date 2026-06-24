import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OptionCard } from '../../components/onboarding/OptionCard';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { PersonalizingLayout } from '../../components/onboarding/PersonalizingLayout';
import { PersonalizationBubble } from '../../components/onboarding/PersonalizationBubble';
import { useOnboarding } from '../../context/OnboardingContext';
import { colors } from '../../constants/colors';
import { type } from '../../constants/typography';
import type { OnboardingAnswers } from '../../types/database';

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
                onPress={() => setAnswer('equipment', opt.value)}
              />
            ))}
          </View>
          <PersonalizationBubble field="equipment" value={answers.equipment} />
        </View>
      </PersonalizingLayout>

      <ContinueButton
        onPress={() => router.push('/(onboarding)/q8')}
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
