import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../constants/colors';

type PersonalizingLayoutProps = {
  step: number;
  totalSteps: number;
  children: React.ReactNode;
};

const bars = [
  { label: 'Pain profile', stepsRange: [1, 2] },
  { label: 'Activity level', stepsRange: [3, 4] },
  { label: 'Preferences', stepsRange: [4, 5] },
];

export function PersonalizingLayout({ step, totalSteps, children }: PersonalizingLayoutProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.header}>Personalizing your plan</Text>

      <View style={styles.barsContainer}>
        {bars.map((bar) => {
          const progress = Math.min(
            Math.max((step - bar.stepsRange[0] + 1) / (bar.stepsRange[1] - bar.stepsRange[0] + 1), 0),
            1,
          );

          return (
            <View key={bar.label} style={styles.barRow}>
              <Text style={[styles.barLabel, progress > 0 && styles.barLabelActive]}>
                {bar.label}
              </Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
              </View>
            </View>
          );
        })}
      </View>

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 16,
  },
  barsContainer: {
    gap: 12,
    marginBottom: 32,
  },
  barRow: {
    gap: 6,
  },
  barLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  barLabelActive: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  barTrack: {
    height: 6,
    backgroundColor: '#E8E0DC',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
});
