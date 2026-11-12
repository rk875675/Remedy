import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WarmBackground } from '../../components/onboarding/WarmBackground';
import { OptionCard } from '../../components/onboarding/OptionCard';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { useOnboarding, useTrackOnboardingStep } from '../../context/OnboardingContext';
import { colors } from '../../constants/colors';
import { type } from '../../constants/typography';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';
import { setPersonProperties } from '../../lib/analytics';
import { onboardingHintShown, onboardingOptionSelected } from '../../lib/analytics/events/onboarding';
import type { AppBelief } from '../../lib/analytics/events/enums';
import { useOnboardingStepCompletion } from '../../lib/analytics/onboardingSteps';

const options: {
  label: string;
  value: AppBelief;
  title: string;
  body: string;
  tone: 'yes' | 'maybe' | 'no';
}[] = [
  { label: 'Yes', value: 'yes', title: 'We like you already', body: "Let's prove you right.", tone: 'yes' },
  { label: 'Maybe', value: 'maybe', title: "We'll earn the yes", body: 'Give it a few weeks.', tone: 'maybe' },
  { label: 'No', value: 'no', title: 'Challenge accepted', body: "We'll take that personally.", tone: 'no' },
];

const BUBBLE = '#FFF4EA';
const HOLD_MS = 4400;
const BOB_MS = 400;

export default function Q9Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { progress, setLocalAnswer } = useOnboarding();
  useTrackOnboardingStep('q9');
  const completeStep = useOnboardingStepCompletion();
  // Analytics signal only (not in the strict answers schema). Persisted via progress
  // so it restores on resume/back-navigation.
  const answer = progress?.app_belief ?? null;

  const opacity = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(-16)).current;
  const scale = useRef(new Animated.Value(0.85)).current;
  const bob = useRef(new Animated.Value(0)).current;
  const playing = useRef<Animated.CompositeAnimation | null>(null);
  const [sticker, setSticker] = useState<(typeof options)[number] | null>(null);

  useEffect(() => () => playing.current?.stop(), []);

  function showSticker(next: (typeof options)[number] | null) {
    playing.current?.stop();
    if (!next) {
      playing.current = Animated.timing(opacity, {
        toValue: 0,
        duration: 140,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      });
      playing.current.start();
      return;
    }
    setSticker(next);
    opacity.setValue(0);
    slide.setValue(-16);
    scale.setValue(0.85);
    bob.setValue(0);
    const bobOnce = Animated.sequence([
      Animated.timing(bob, {
        toValue: -4,
        duration: BOB_MS,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
      Animated.timing(bob, {
        toValue: 0,
        duration: BOB_MS,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
    ]);
    playing.current = Animated.sequence([
      Animated.parallel([
        Animated.spring(slide, {
          toValue: 0,
          useNativeDriver: true,
          speed: 14,
          bounciness: 10,
        }),
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          speed: 14,
          bounciness: 12,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.loop(bobOnce, { iterations: Math.round(HOLD_MS / (BOB_MS * 2)) }),
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 260,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(slide, {
          toValue: -10,
          duration: 260,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]);
    playing.current.start();
  }

  function handleSelect(value: AppBelief) {
    const isDeselect = answer === value;
    onboardingOptionSelected({
      step_key: 'q9',
      option_value: value,
      is_multi_select: false,
      is_deselect: isDeselect,
    });
    if (isDeselect) {
      setLocalAnswer('app_belief', null);
      showSticker(null);
      return;
    }
    const next = options.find((o) => o.value === value) ?? null;
    setLocalAnswer('app_belief', value);
    setPersonProperties({ app_belief: value });
    onboardingHintShown({ step_key: 'q9', hint_key: 'app_belief' });
    showSticker(next);
  }

  function handleContinue() {
    if (!answer) return;
    completeStep();
    router.push('/(onboarding)/recognize');
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <WarmBackground />
      <View style={styles.content}>
        <Text style={styles.heading}>Do you believe Remedy can fix your back pain?</Text>
        <View style={styles.options}>
          {options.map((opt) => (
            <OptionCard
              key={opt.value}
              label={opt.label}
              selected={answer === opt.value}
              onPress={() => handleSelect(opt.value)}
            />
          ))}
        </View>
      </View>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.toast,
          { top: insets.top + 8 },
          { opacity, transform: [{ translateY: Animated.add(slide, bob) }, { scale }] },
        ]}
      >
        <View style={styles.tail} />
        <View
          style={[
            styles.dot,
            sticker?.tone === 'no' && styles.dotNo,
            sticker?.tone === 'maybe' && styles.dotMaybe,
          ]}
        />
        <View style={styles.toastText}>
          <Text style={styles.toastTitle}>{sticker?.title ?? ''}</Text>
          <Text style={styles.toastBody}>{sticker?.body ?? ''}</Text>
        </View>
      </Animated.View>

      <ContinueButton onPress={handleContinue} disabled={!answer} />
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
  },
  heading: {
    ...type.question,
    color: colors.textPrimary,
    marginBottom: 28,
  },
  options: {
    gap: 12,
  },
  toast: {
    position: 'absolute',
    right: 16,
    maxWidth: 290,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: BUBBLE,
    borderRadius: radius.card + 4,
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 20,
    ...shadows.medium,
    shadowColor: '#8A4B36',
    shadowOpacity: 0.14,
  },
  tail: {
    position: 'absolute',
    bottom: -6,
    right: 30,
    width: 16,
    height: 16,
    borderRadius: 3,
    backgroundColor: BUBBLE,
    transform: [{ rotate: '45deg' }],
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  dotMaybe: {
    backgroundColor: colors.warning,
  },
  dotNo: {
    backgroundColor: colors.secondary,
  },
  toastText: {
    flexShrink: 1,
  },
  toastTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  toastBody: {
    fontSize: 15,
    lineHeight: 20,
    color: colors.textSecondary,
  },
});
