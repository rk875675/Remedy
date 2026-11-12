import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../constants/colors';
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
      <Text style={styles.tag}>For today</Text>
      <Text style={styles.text}>{tip}</Text>
      <Text style={styles.caption}>A new one tomorrow</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    marginBottom: 16,
  },
  tag: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  text: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
    lineHeight: 23,
  },
  caption: {
    marginTop: 10,
    fontSize: 12,
    color: colors.textTertiary,
  },
});
