import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { obType } from './tokens';

export type ObFooterProps = {
  children: React.ReactNode;
  /** Centred caption above the buttons, for a quiet aside. */
  note?: string;
};

/** Vertical stack dropped into `ObScreen`'s pinned footer. */
export function ObFooter({ children, note }: ObFooterProps) {
  return (
    <View style={styles.stack}>
      {note ? <Text style={styles.note}>{note}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 10,
  },
  note: {
    ...obType.caption,
    textAlign: 'center',
  },
});
