import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { useTrackOnboardingStep } from '../../context/OnboardingContext';
import { colors, serifFont } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';

const slide = {
  eyebrow: 'WHY WE BUILT REMEDY',
  title: 'Back pain is everywhere.',
  statValue: '4 in 5',
  statLabel: 'people will experience back pain in their lifetime',
};

export default function FounderScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  useTrackOnboardingStep('founder');

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: true, headerShown: false }} />
      <View style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.content}>
          <Text style={styles.eyebrow}>{slide.eyebrow}</Text>
          <Text style={styles.title}>{slide.title}</Text>

          <View style={styles.badgeWrap}>
            <View style={styles.badgeHalo} />
            <View style={styles.badge}>
              <Text style={styles.badgeValue}>{slide.statValue}</Text>
            </View>
          </View>
          <Text style={styles.badgeLabel}>{slide.statLabel}</Text>
        </View>

        <View style={styles.footer}>
          <ContinueButton label="Continue" onPress={() => router.push('/(onboarding)/education')} />
        </View>
      </View>
    </>
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
    alignItems: 'center',
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  title: {
    fontSize: 28,
    fontFamily: serifFont,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 36,
    letterSpacing: -0.3,
    marginBottom: 44,
  },
  badgeWrap: {
    width: 132,
    height: 132,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeHalo: {
    position: 'absolute',
    width: 132,
    height: 132,
    borderRadius: radius.circle,
    backgroundColor: colors.primaryMuted,
  },
  badge: {
    width: 104,
    height: 104,
    borderRadius: radius.circle,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.medium,
    shadowColor: colors.primaryDeep,
    shadowOpacity: 0.25,
  },
  badgeValue: {
    fontSize: 22,
    fontFamily: serifFont,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  badgeLabel: {
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: -0.1,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 23,
    marginTop: 20,
    paddingHorizontal: 20,
    maxWidth: 280,
  },
  footer: {
    gap: 16,
  },
});
