import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';
import { ContinueButton } from '../components/onboarding/ContinueButton';
import { useAuth } from '../context/AuthContext';
import { colors, serifFont } from '../constants/colors';
import { ORIENTATION_SLIDES } from '../constants/mindset';
import { orientationCompleted } from '../lib/analytics/events/engagement';
import { markOrientationCompleted } from '../lib/orientation';

const sessionIdSchema = z.string().uuid();

export default function OrientationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ session?: string }>();
  const sessionId = sessionIdSchema.safeParse(params.session).success
    ? params.session
    : undefined;
  const [index, setIndex] = useState(0);
  const slide = ORIENTATION_SLIDES[index];
  const isLast = index === ORIENTATION_SLIDES.length - 1;

  if (!slide) return null;

  async function handleContinue() {
    if (!isLast) {
      setIndex((current) => current + 1);
      return;
    }
    if (user?.id) {
      await markOrientationCompleted(user.id);
    }
    orientationCompleted({ slide_count: ORIENTATION_SLIDES.length });
    if (sessionId) {
      router.replace(`/session/${sessionId}`);
      return;
    }
    router.replace('/(tabs)');
  }

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: true, headerShown: false }} />
      <View style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.content}>
          <Text style={styles.eyebrow}>{slide.eyebrow}</Text>
          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.body}>{slide.body}</Text>
        </View>

        <View style={styles.footer}>
          <View style={styles.dots}>
            {ORIENTATION_SLIDES.map((item, i) => (
              <View key={item.eyebrow} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>
          <ContinueButton
            label={isLast && sessionId ? 'Start Session' : 'Continue'}
            onPress={() => { void handleContinue(); }}
          />
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
    marginBottom: 20,
  },
  body: {
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: -0.1,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 23,
    paddingHorizontal: 8,
    maxWidth: 320,
  },
  footer: {
    gap: 16,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 4,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.primary,
  },
});
