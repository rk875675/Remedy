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
import { trackEvent } from '../../lib/analytics';

type HearAboutSource =
  | 'instagram'
  | 'facebook'
  | 'tiktok'
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
  { label: 'Google', value: 'google', iconName: 'logo-google', iconColor: colors.textPrimary },
  { label: 'Friend or family', value: 'friend_family', iconName: 'people-outline', iconColor: colors.textPrimary },
  { label: 'Other', value: 'other', iconName: 'ellipsis-horizontal', iconColor: colors.textPrimary },
];

export default function Q0Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { progress, setLocalAnswer } = useOnboarding();
  useTrackOnboardingStep('q0');
  // Analytics attribution signal only (not in the strict answers schema). Persisted
  // via progress so it restores on resume/back-navigation.
  const [source, setSource] = useState<HearAboutSource | null>(
    () => (progress?.hear_about as HearAboutSource | null) ?? null,
  );

  function handleSelect(value: HearAboutSource) {
    setSource(value);
    setLocalAnswer('hear_about', value);
  }

  function handleContinue() {
    if (!source) return;
    trackEvent('onboarding_hear_about', { source });
    router.push('/(onboarding)/q9');
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
