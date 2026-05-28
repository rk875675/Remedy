import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProgressBar } from '../../components/onboarding/ProgressBar';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { colors } from '../../constants/colors';

export default function Interstitial3Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <ProgressBar current={7} total={10} />

      <View style={styles.content}>
        <Text style={styles.heading}>Save over $1,000</Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Average PT program</Text>
            <Text style={styles.rowValue}>$1,500+</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Remedy</Text>
            <Text style={[styles.rowValue, { color: colors.primary }]}>$79.99/yr</Text>
          </View>
        </View>
      </View>

      {/* VAULTED: re-evaluate post-launch */}
      {/* <ContinueButton onPress={() => router.push('/(onboarding)/review')} /> */}
      <ContinueButton onPress={() => router.push('/(onboarding)/finalizing')} />
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
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 32,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
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
  },
  divider: {
    height: 1,
    backgroundColor: '#E8E0DC',
  },
});
