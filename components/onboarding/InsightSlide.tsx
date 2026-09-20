import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ContinueButton } from './ContinueButton';
import { colors, serifFont } from '../../constants/colors';

type InsightSlideProps = {
  eyebrow: string;
  title: string;
  body: string;
  onContinue: () => void;
};

/** Text interstitial in the founder / education register. */
export function InsightSlide({ eyebrow, title, body, onContinue }: InsightSlideProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
      <View style={styles.footer}>
        <ContinueButton label="Continue" onPress={onContinue} />
      </View>
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
});
