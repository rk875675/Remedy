import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { OptionCard } from '../../components/onboarding/OptionCard';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { useOnboarding, useTrackOnboardingStep } from '../../context/OnboardingContext';
import { colors } from '../../constants/colors';
import { type } from '../../constants/typography';
import { setPersonProperties } from '../../lib/analytics';
import { onboardingOptionSelected } from '../../lib/analytics/events/onboarding';
import { useOnboardingStepCompletion } from '../../lib/analytics/onboardingSteps';

type HearAboutSource =
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'youtube'
  | 'google'
  | 'friend_family'
  | 'other';

const ICON_SIZE = 22;

const options: {
  label: string;
  value: HearAboutSource;
  iconName: keyof typeof Ionicons.glyphMap;
  iconColor: string;
}[] = [
  { label: 'Instagram', value: 'instagram', iconName: 'logo-instagram', iconColor: '#E4405F' },
  { label: 'Facebook', value: 'facebook', iconName: 'logo-facebook', iconColor: '#1877F2' },
  { label: 'TikTok', value: 'tiktok', iconName: 'logo-tiktok', iconColor: colors.textPrimary },
  { label: 'YouTube', value: 'youtube', iconName: 'logo-youtube', iconColor: '#FF0000' },
  { label: 'Google', value: 'google', iconName: 'logo-google', iconColor: '#4285F4' },
  { label: 'Friend or family', value: 'friend_family', iconName: 'people-outline', iconColor: colors.textPrimary },
  { label: 'Other', value: 'other', iconName: 'ellipsis-horizontal', iconColor: colors.textPrimary },
];

export default function Q0Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { progress, setLocalAnswer } = useOnboarding();
  useTrackOnboardingStep('q0');
  const completeStep = useOnboardingStepCompletion();
  // Analytics attribution signal only (not in the strict answers schema). Persisted
  // via progress so it restores on resume/back-navigation.
  const [source, setSource] = useState<HearAboutSource | null>(() => {
    const saved = progress?.hear_about;
    return options.some((opt) => opt.value === saved) ? (saved as HearAboutSource) : null;
  });

  function handleSelect(value: HearAboutSource) {
    const isDeselect = source === value;
    onboardingOptionSelected({
      step_key: 'q0',
      option_value: value,
      is_multi_select: false,
      is_deselect: isDeselect,
    });
    if (isDeselect) {
      setSource(null);
      setLocalAnswer('hear_about', null);
    } else {
      setSource(value);
      setLocalAnswer('hear_about', value);
      // Set while still anonymous, so the identify() merge at signup carries channel
      // attribution onto the identified person. See docs/ANALYTICS.md §4.
      setPersonProperties({ acquisition_source: value });
    }
  }

  function handleContinue() {
    if (!source) return;
    completeStep();
    router.push('/(onboarding)/safety');
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.content}>
        <Text style={styles.heading}>Where did you hear about us?</Text>
        <View style={styles.options}>
          {options.map((opt) => {
            const selected = source === opt.value;
            return (
              <OptionCard
                key={opt.value}
                label={opt.label}
                icon={
                  <Ionicons name={opt.iconName} size={ICON_SIZE} color={opt.iconColor} />
                }
                iconStyle="plain"
                selected={selected}
                onPress={() => handleSelect(opt.value)}
              />
            );
          })}
        </View>
      </View>

      <ContinueButton onPress={handleContinue} disabled={!source} />
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
