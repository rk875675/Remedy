import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ob, obType } from './tokens';

type StatPillProps = {
  value: string;
  text: string;
};

/** Neutral pill: a big figure on the left, a wrapping caption on the right. */
export function StatPill({ value, text }: StatPillProps) {
  return (
    <View style={styles.pill}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: ob.color.tile,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  value: {
    ...obType.heading,
    color: ob.color.accent,
  },
  text: {
    ...obType.caption,
    color: ob.color.ink,
    flex: 1,
  },
});
