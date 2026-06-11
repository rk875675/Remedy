import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { colors } from '../../constants/colors';
import { ContinueButton } from '../../components/onboarding/ContinueButton';

const NEXT_ROUTE: Href = '/(onboarding)/education';

export default function DisclaimerScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.wordmark}>Remedy</Text>

        <View style={styles.iconCircle}>
          <Text style={styles.iconSymbol}>⊕</Text>
        </View>

        <Text style={styles.heading}>A note before you begin</Text>

        <Text style={styles.body}>
          {/* HUMAN INPUT NEEDED: [attorney to review] */}
          Remedy is a fitness and wellness app, not a substitute for professional medical advice. If you have a serious injury or medical condition, consult a doctor or physical therapist before starting any exercise program.
        </Text>
      </View>

      <View style={styles.footer}>
        <ContinueButton
          label="I understand, let's go"
          onPress={() => router.push(NEXT_ROUTE)}
        />
      </View>
    </SafeAreaView>
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
  wordmark: {
    fontSize: 42,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: -0.5,
    marginBottom: 28,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  iconSymbol: {
    fontSize: 28,
    color: colors.background,
    lineHeight: 32,
  },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
  },
  body: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 26,
    textAlign: 'center',
    maxWidth: 320,
  },
  footer: {
    paddingBottom: 16,
  },
});
