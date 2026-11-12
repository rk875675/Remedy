import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { WarmBackground } from '../../components/onboarding/WarmBackground';
import { PetSays } from '../../components/pet/PetSays';
import { useTrackOnboardingStep } from '../../context/OnboardingContext';
import { colors, serifFont } from '../../constants/colors';
import { PET_PRESENTS } from '../../constants/petOnboardingLines';
import { useOnboardingPet } from '../../lib/useOnboardingPet';

// Reassurance reframe. The source line must keep naming the published review:
// "most back pain has no specific structural cause" is population-level research,
// never Remedy data (FTC substantiation / App Store 1.4.1).
const LINES = [
  "Most back pain isn't an injury or disease you'd see on a scan.",
  "Usually it's a strong back that's gotten stiff, guarded, and out of practice.",
];

export default function FounderScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { stage } = useOnboardingPet();
  useTrackOnboardingStep('founder');

  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 450,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [fade]);

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: true, headerShown: false }} />
      <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
        <WarmBackground />
        <View style={styles.petSays}>
          <PetSays line={PET_PRESENTS.founder.line} mood={PET_PRESENTS.founder.mood} stage={stage} />
        </View>
        <Animated.ScrollView
          style={[styles.scroll, { opacity: fade }]}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Text style={styles.title}>Your back is stronger than it feels.</Text>
          {LINES.map((line) => (
            <Text key={line} style={styles.body}>
              {line}
            </Text>
          ))}
          <Text style={styles.promise}>
            And that kind of back pain gets better with the right movement.
          </Text>
        </Animated.ScrollView>

        <View style={styles.footer}>
          <Text style={styles.source}>
            Source: Maher, Underwood & Buchbinder, “Non-specific low back pain,” The Lancet, 2017.
          </Text>
          <ContinueButton label="Continue" onPress={() => router.push('/(onboarding)/education')} />
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 28,
    overflow: 'hidden',
  },
  petSays: {
    marginBottom: 20,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 38,
    lineHeight: 44,
    fontFamily: serifFont,
    fontWeight: '700',
    color: colors.primaryDeep,
    letterSpacing: -0.8,
    marginBottom: 28,
  },
  body: {
    fontSize: 19,
    lineHeight: 28,
    color: colors.textPrimary,
    letterSpacing: -0.2,
    marginBottom: 16,
  },
  promise: {
    fontSize: 19,
    lineHeight: 28,
    fontFamily: serifFont,
    fontStyle: 'italic',
    color: colors.secondary,
    marginTop: 8,
  },
  footer: {
    gap: 14,
  },
  source: {
    fontSize: 11,
    lineHeight: 15,
    color: colors.textTertiary,
    textAlign: 'center',
  },
});
