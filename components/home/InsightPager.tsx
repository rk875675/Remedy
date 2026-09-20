import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';
import { HOME_INSIGHTS, getDailyInsightIndex } from '../../constants/homeInsights';

/** One daily tip, keyed to the local calendar day. */
export function InsightPager() {
  const index = getDailyInsightIndex();
  const tip =
    HOME_INSIGHTS[index]
    ?? HOME_INSIGHTS[0]
    ?? 'Most people get back pain at some point in life.';

  return (
    <View style={styles.card}>
      <Text style={styles.tag}>Tip</Text>
      <Text style={styles.text}>{tip}</Text>
      <Text style={styles.caption}>New one tomorrow</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: 20,
    ...shadows.low,
    marginBottom: 16,
  },
  tag: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  text: {
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 23,
  },
  caption: {
    marginTop: 10,
    fontSize: 12,
    color: colors.textTertiary,
  },
});
