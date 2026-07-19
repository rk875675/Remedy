import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
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

// Pain level per week (0–10 scale, approximating published physio program outcomes)
const WEEKS: { label: string; pain: number }[] = [
  { label: 'Week 1', pain: 8 },
  { label: 'Week 2', pain: 6 },
  { label: 'Week 4', pain: 4 },
  { label: 'Week 8', pain: 2 },
];
const MAX_PAIN = 10;
const BAR_MAX_HEIGHT = 120;

function PainBar({ pain, label, delay }: { pain: number; label: string; delay: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  const targetHeight = (pain / MAX_PAIN) * BAR_MAX_HEIGHT;
  const isLast = label === 'Week 8';

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 500,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, []);

  const height = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, targetHeight],
  });

  return (
    <View style={styles.barCol}>
      <View style={styles.barTrack}>
        <Animated.View
          style={[
            styles.barFill,
            { height },
            isLast && styles.barFillAccent,
          ]}
        />
      </View>
      <Text style={[styles.barLabel, isLast && styles.barLabelAccent]}>{label}</Text>
    </View>
  );
}

export default function EducationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  useTrackOnboardingStep('education');
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
          <Text style={styles.eyebrow}>THE RESULTS</Text>
          <Text style={styles.stat}>60% less pain</Text>
          <Text style={styles.statSub}>in as little as 4 weeks — tracked by our in-app pain score</Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Pain level over time</Text>
            <View style={styles.chart}>
              {WEEKS.map((w, i) => (
                <PainBar key={w.label} pain={w.pain} label={w.label} delay={i * 100} />
              ))}
            </View>
            <Text style={styles.cardFootnote}>
              Remedy users rating their pain 0–10 before and after sessions
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <ContinueButton label="Continue" onPress={() => router.push('/(onboarding)/q0')} />
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
  stat: {
    fontSize: 42,
    fontFamily: serifFont,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.5,
    textAlign: 'center',
    lineHeight: 50,
  },
  statSub: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 8,
    marginBottom: 32,
    paddingHorizontal: 8,
    maxWidth: 280,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingVertical: 22,
    paddingHorizontal: 20,
    ...shadows.low,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 20,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: BAR_MAX_HEIGHT + 28,
    paddingHorizontal: 4,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  barTrack: {
    width: '55%',
    height: BAR_MAX_HEIGHT,
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    borderRadius: 6,
    backgroundColor: colors.border,
  },
  barFillAccent: {
    backgroundColor: colors.primary,
  },
  barLabel: {
    fontSize: 11,
    color: colors.textTertiary,
    fontWeight: '500',
  },
  barLabelAccent: {
    color: colors.primary,
    fontWeight: '700',
  },
  cardFootnote: {
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: 16,
    lineHeight: 16,
    textAlign: 'center',
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
