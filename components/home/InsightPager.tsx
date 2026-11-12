import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../constants/colors';
import { HOME_INSIGHTS, getDailyInsightIndex } from '../../constants/homeInsights';
import type { PetStage } from '../../constants/petImages';
import { PET_TIP_HEADING, petLine } from '../../constants/petLines';
import { PetBadge } from '../pet/PetBadge';

type InsightPagerProps = {
  petStage?: PetStage;
  petName?: string | null;
};

/** One daily tip, keyed to the local calendar day. */
export function InsightPager({ petStage, petName }: InsightPagerProps) {
  const index = getDailyInsightIndex();
  const tip =
    HOME_INSIGHTS[index]
    ?? HOME_INSIGHTS[0]
    ?? 'Most people get back pain at some point in life.';

  return (
    <View style={styles.card}>
      {petStage != null ? (
        <View style={styles.tagRow}>
          <PetBadge stage={petStage} mood="ready" size={40} />
          <Text style={[styles.tag, styles.tagBesidePet]}>{petLine(PET_TIP_HEADING, petName)}</Text>
        </View>
      ) : (
        <Text style={styles.tag}>For today</Text>
      )}
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
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  tagBesidePet: {
    flex: 1,
    marginBottom: 0,
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
