import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OptionCard } from '../../components/onboarding/OptionCard';
import { PersonalizingLayout } from '../../components/onboarding/PersonalizingLayout';
import { colors } from '../../constants/colors';
import { type } from '../../constants/typography';
import { trackEvent } from '../../lib/analytics';

type DownloadReason =
  | 'tried_everything'
  | 'need_structure'
  | 'recommended'
  | 'avoid_intervention'
  | 'in_pain';

const ICON_STYLE = { fontSize: 17, color: '#FFFFFF' as const };

const options: { label: string; icon: React.ReactNode; value: DownloadReason }[] = [
  { label: "I've tried everything else", icon: <Text style={ICON_STYLE}>◐</Text>, value: 'tried_everything' },
  { label: 'I need a structured plan', icon: <Text style={ICON_STYLE}>▬</Text>, value: 'need_structure' },
  { label: 'Someone recommended it', icon: <Text style={ICON_STYLE}>♡</Text>, value: 'recommended' },
  { label: 'I want to avoid surgery or injections', icon: <Text style={ICON_STYLE}>⊕</Text>, value: 'avoid_intervention' },
  { label: "I'm just in a lot of pain", icon: <Text style={ICON_STYLE}>△</Text>, value: 'in_pain' },
];

export default function Q0Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  function handleSelect(value: DownloadReason) {
    trackEvent('onboarding_download_reason', { reason: value });
    router.push('/(onboarding)/q6');
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <PersonalizingLayout>
        <View style={styles.content}>
          <Text style={styles.heading}>Why did you download Remedy?</Text>
          <View style={styles.options}>
            {options.map((opt) => (
              <OptionCard
                key={opt.value}
                label={opt.label}
                icon={opt.icon}
                selected={false}
                onPress={() => handleSelect(opt.value)}
              />
            ))}
          </View>
        </View>
      </PersonalizingLayout>
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
