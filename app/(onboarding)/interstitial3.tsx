import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProgressBar } from '../../components/onboarding/ProgressBar';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { colors, serifFont } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';

type TextSlide = {
  id: string;
  icon: string;
  title: string;
  kind: 'text';
  body: string;
};

type PriceSlide = {
  id: string;
  icon: string;
  title: string;
  kind: 'price';
};

type SlideData = TextSlide | PriceSlide;

const SLIDES: SlideData[] = [
  {
    id: '1',
    icon: '◎',
    title: '4 in 5 people will experience back pain in their lifetime.',
    kind: 'text',
    body: 'Most wait years before getting real help. The average episode lasts over 3 months.',
  },
  {
    id: '2',
    icon: '♡',
    title: 'I built Remedy because back pain is everywhere.',
    kind: 'text',
    body: "My mom. My coworkers. My friends. Everyone was hurting — and couldn't justify $150 a session for PT. There had to be a better way.",
  },
  {
    id: '3',
    icon: '◐',
    title: 'PT-quality rehab. Not PT prices.',
    kind: 'price',
  },
];

export default function Interstitial3Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [idx, setIdx] = useState(0);

  const slide = SLIDES[idx];
  if (!slide) return null;

  function advance() {
    if (idx < SLIDES.length - 1) {
      setIdx(idx + 1);
    } else {
      router.push('/(onboarding)/finalizing');
    }
  }

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: false, headerShown: false }} />
      <View
        style={[
          styles.container,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
        ]}
      >
        <ProgressBar current={8} total={11} />

        <View style={styles.content}>
          <View style={styles.iconWrap}>
            <View style={styles.iconHalo} />
            <View style={styles.iconArea}>
              <Text style={styles.iconText}>{slide.icon}</Text>
            </View>
          </View>

          <Text style={styles.title}>{slide.title}</Text>

          {slide.kind === 'text' ? (
            <Text style={styles.body}>{slide.body}</Text>
          ) : (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Average PT program</Text>
                <Text style={styles.rowValue}>$1,500+</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Remedy</Text>
                <View style={styles.priceCol}>
                  <Text style={[styles.rowValue, styles.rowValueAccent]}>
                    $6.66/mo
                  </Text>
                  <Text style={styles.rowSubValue}>billed $79.99/year</Text>
                </View>
              </View>
            </View>
          )}
        </View>

        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === idx && styles.dotActive]}
            />
          ))}
        </View>

        <ContinueButton
          label={idx === SLIDES.length - 1 ? 'Get Started' : 'Next'}
          onPress={advance}
        />
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
  iconText: {
    fontSize: 40,
    color: '#FFFFFF',
  },
  title: {
    fontSize: 28,
    fontFamily: serifFont,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 38,
    letterSpacing: -0.3,
  },
  body: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: 24,
    width: '100%',
    ...shadows.medium,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  rowLabel: {
    fontSize: 17,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  rowValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  rowValueAccent: {
    color: colors.primary,
  },
  priceCol: {
    alignItems: 'flex-end',
  },
  rowSubValue: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.circle,
    backgroundColor: colors.textTertiary,
  },
  dotActive: {
    width: 20,
    backgroundColor: colors.textPrimary,
  },
});
