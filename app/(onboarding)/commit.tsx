import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Pressable } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WarmBackground } from '../../components/onboarding/WarmBackground';
import { useOnboarding } from '../../context/OnboardingContext';
import { colors, serifFont } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';
import { hapticHeavy, hapticPrimaryAction, hapticSuccess } from '../../lib/haptics';

const HOLD_MS = 1100;
const PULSE_MS = 90;

export default function CommitScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { progress, setLocalAnswer } = useOnboarding();
  const committed = !!progress?.committed_at;
  const fill = useRef(new Animated.Value(committed ? 1 : 0)).current;
  const pulse = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPulse() {
    if (pulse.current) clearInterval(pulse.current);
    pulse.current = null;
  }

  useEffect(() => stopPulse, []);

  function goNext() {
    router.push('/(onboarding)/finalizing');
  }

  function complete() {
    stopPulse();
    if (committed) return;
    fill.setValue(1);
    hapticSuccess();
    setLocalAnswer('committed_at', new Date().toISOString());
    goNext();
  }

  function handlePressIn() {
    if (committed) return;
    hapticHeavy();
    stopPulse();
    pulse.current = setInterval(hapticHeavy, PULSE_MS);
    Animated.timing(fill, {
      toValue: 1,
      duration: HOLD_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) complete();
    });
  }

  function handlePressOut() {
    if (committed) return;
    stopPulse();
    Animated.timing(fill, {
      toValue: 0,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }

  function handleCommittedPress() {
    hapticPrimaryAction();
    goNext();
  }

  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: true, headerShown: false }} />
      <View style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
        <WarmBackground />
        <View style={styles.content}>
          <Text style={styles.title}>I'm done working around my back.</Text>
        </View>

        {committed ? (
          <Pressable
            onPress={handleCommittedPress}
            accessibilityRole="button"
            accessibilityLabel="Committed. Continue"
            style={[styles.button, styles.buttonCommitted]}
          >
            <Text style={styles.buttonText}>Committed ✓</Text>
          </Pressable>
        ) : (
          <Pressable
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            accessibilityRole="button"
            accessibilityLabel="Commit and build my plan"
            accessibilityActions={[{ name: 'activate' }]}
            onAccessibilityAction={complete}
            style={styles.button}
          >
            <Animated.View style={[styles.buttonFill, { width }]} />
            <Text style={styles.buttonText}>Hold to commit</Text>
          </Pressable>
        )}
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
    fontSize: 38,
    lineHeight: 44,
    fontFamily: serifFont,
    fontWeight: '700',
    color: colors.primaryDeep,
    letterSpacing: -0.8,
  },
  button: {
    height: 54,
    borderRadius: radius.button,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...shadows.medium,
    shadowColor: colors.primaryDeep,
    shadowOpacity: 0.25,
  },
  buttonCommitted: {
    backgroundColor: colors.primaryDeep,
  },
  buttonFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.primaryDeep,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});
