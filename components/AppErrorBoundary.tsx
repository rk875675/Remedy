import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ErrorBoundaryProps } from 'expo-router';
import { colors, serifFont } from '../constants/colors';
import { PET_ERROR_LINE } from '../constants/petLines';
import { PetBadge } from './pet/PetBadge';

/**
 * Expo Router error surface. Never show the raw exception — analytics or a
 * render glitch must not dump a stack on the user. Retry remounts the route.
 */
export function AppErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <View style={styles.container}>
      <PetBadge stage={1} mood="concerned" size={120} />
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.body}>Please try again.</Text>
      <Text style={styles.note}>{PET_ERROR_LINE}</Text>
      <Pressable onPress={() => void retry()} style={styles.button} accessibilityRole="button">
        <Text style={styles.buttonText}>Try again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  title: {
    fontSize: 24,
    fontFamily: serifFont,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  body: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },
  note: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
