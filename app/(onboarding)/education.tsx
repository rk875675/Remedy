import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { colors, serifFont } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';

const slide = {
  icon: '◎',
  title: 'Structured rehab, in your pocket',
  body: 'Real PT-designed programs that guide you through every session — built for recovery, not random workouts.',
};

export default function EducationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: true, headerShown: false }} />
      <View style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.content}>
          <View style={styles.iconWrap}>
            <View style={styles.iconHalo} />
            <View style={styles.iconArea}>
              <Text style={styles.icon}>{slide.icon}</Text>
            </View>
          </View>

          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.body}>{slide.body}</Text>
        </View>

        <View style={styles.footer}>
          <ContinueButton label="Continue" onPress={() => router.push('/(onboarding)/q0')} />
          <TouchableOpacity
            style={styles.signInLink}
            onPress={() => router.push('/(auth)/sign-in')}
            activeOpacity={0.6}
          >
            <Text style={styles.signInText}>Already have an account? <Text style={styles.signInBold}>Sign in</Text></Text>
          </TouchableOpacity>
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
  iconWrap: {
    width: 128,
    height: 128,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  iconHalo: {
    position: 'absolute',
    width: 128,
    height: 128,
    borderRadius: radius.circle,
    backgroundColor: colors.primaryMuted,
  },
  iconArea: {
    width: 100,
    height: 100,
    borderRadius: radius.circle,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.medium,
  },
  icon: {
    fontSize: 40,
    color: '#FFFFFF',
  },
  title: {
    fontSize: 30,
    fontFamily: serifFont,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 40,
  },
  body: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 12,
  },
  footer: {
    gap: 20,
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
