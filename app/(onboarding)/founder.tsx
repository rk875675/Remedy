import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { useTrackOnboardingStep } from '../../context/OnboardingContext';
import { useAuth } from '../../context/AuthContext';
import { useUser } from '../../lib/superwall';
import { hapticWarning } from '../../lib/haptics';
import { colors, serifFont } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';

const slide = {
  eyebrow: 'WHY WE BUILT REMEDY',
  title: 'Back pain is everywhere.',
  statValue: '4 in 5',
  statLabel: 'people will experience back pain in their lifetime',
  statFootnote: 'Most wait years before getting real help. The average episode lasts over 3 months.',
};

export default function FounderScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  useTrackOnboardingStep('founder');
  // See app/(onboarding)/index.tsx for why this exists: a stale session must be
  // surfaced here rather than letting "Sign in" silently bounce to the tabs.
  const { user, signOut } = useAuth();
  const { signOut: superwallSignOut } = useUser();

  async function handleSignOut() {
    hapticWarning();
    void superwallSignOut();
    await signOut();
  }

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

          <View style={styles.divider} />

          <Text style={styles.footnote}>{slide.statFootnote}</Text>
        </View>

        <View style={styles.footer}>
          <ContinueButton label="Continue" onPress={() => router.push('/(onboarding)/education')} />
          {user ? (
            <TouchableOpacity style={styles.signInLink} onPress={handleSignOut} activeOpacity={0.6}>
              <Text style={styles.signInText}>
                Signed in as {user.email ?? 'an account'} on this device.{' '}
                <Text style={styles.signInBold}>Sign out</Text>
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.signInLink}
              onPress={() => router.navigate('/(auth)/sign-in')}
              activeOpacity={0.6}
            >
              <Text style={styles.signInText}>
                Already have an account? <Text style={styles.signInBold}>Sign in</Text>
              </Text>
            </TouchableOpacity>
          )}
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
    fontSize: 26,
    fontFamily: serifFont,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 34,
    letterSpacing: -0.3,
    marginBottom: 36,
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
    fontWeight: '600',
    letterSpacing: -0.1,
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 18,
    paddingHorizontal: 16,
    maxWidth: 260,
  },
  divider: {
    width: 32,
    height: 1,
    backgroundColor: colors.border,
    marginTop: 22,
    marginBottom: 18,
  },
  footnote: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 12,
    maxWidth: 300,
  },
  footer: {
    gap: 16,
  },
  signInLink: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  signInText: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  signInBold: {
    color: colors.primary,
    fontWeight: '600',
  },
});
