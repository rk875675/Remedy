import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { useOnboarding, useTrackOnboardingStep } from '../../context/OnboardingContext';
import { tailoredMindsetCopy } from '../../constants/mindset';
import { colors, serifFont } from '../../constants/colors';

export default function SeenScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { progress } = useOnboarding();
  useTrackOnboardingStep('seen');
  const copy = tailoredMindsetCopy(
    progress?.tried_before,
    progress?.recognize_selected ?? [],
  );

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: true, headerShown: false }} />
      <View style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.content}>
          <Text style={styles.title}>{copy.title}</Text>
          <View style={styles.rule} />
          <Text style={styles.teach}>{copy.teach}</Text>
          <Text style={styles.weDo}>{copy.weDo}</Text>
        </View>
        <ContinueButton label="Continue" onPress={() => router.push('/(onboarding)/q6')} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 28,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontFamily: serifFont,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 36,
    letterSpacing: -0.3,
  },
  rule: {
    width: 32,
    height: 2,
    backgroundColor: colors.primary,
    marginTop: 20,
    marginBottom: 20,
  },
  teach: {
    fontSize: 17,
    fontWeight: '500',
    color: colors.textSecondary,
    lineHeight: 26,
    letterSpacing: -0.1,
  },
  weDo: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.primaryDeep,
    lineHeight: 24,
    letterSpacing: -0.1,
    marginTop: 20,
  },
});
