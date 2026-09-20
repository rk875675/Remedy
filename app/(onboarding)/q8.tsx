import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OptionCard } from '../../components/onboarding/OptionCard';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { PersonalizingLayout } from '../../components/onboarding/PersonalizingLayout';
import { useOnboarding, useTrackOnboardingStep } from '../../context/OnboardingContext';
import { colors } from '../../constants/colors';
import { type } from '../../constants/typography';
import { onboardingHintShown, onboardingOptionSelected } from '../../lib/analytics/events/onboarding';
import { useOnboardingStepCompletion } from '../../lib/analytics/onboardingSteps';
import { useAfterTransition } from '../../lib/useAfterTransition';
import { sessionLength } from '../../lib/analytics/events/enums';
import type { z } from 'zod';
import { SESSIONS_PER_WEEK_VALUES, type SessionsPerWeekValue } from '../../constants/onboardingQuestions';
import type { OnboardingAnswers } from '../../types/database';

// ---------------------------------------------------------------------------
// Session-length (minutes) — local signal, not stored in the strict answers schema
// ---------------------------------------------------------------------------

const MINUTE_OPTIONS: {
  value: number;
  label: string;
  analyticsValue: z.infer<typeof sessionLength>;
}[] = [
  { value: 15, label: '15 minutes', analyticsValue: 'minutes_15' },
  { value: 20, label: '20 minutes', analyticsValue: 'minutes_20' },
  { value: 30, label: '30+ minutes', analyticsValue: 'minutes_30' },
];
const RECOMMENDED_MINUTES = 15;

// ---------------------------------------------------------------------------
// Days-per-week — 3 | 4 | 5 | 6 | 7.
// DB CHECK and Zod schemas updated in migration 067 to allow 2–7.
// ---------------------------------------------------------------------------

type DayOption = SessionsPerWeekValue;
const DAY_OPTIONS: readonly DayOption[] = SESSIONS_PER_WEEK_VALUES;

// Client mirror of assignment_rules v1 recommendation (activity × pain_duration).
// Keep in sync with migration 014 and engine.ts. Max recommendation is 5 — 6 and 7
// are available for users who want more but are never auto-recommended.
const RECOMMENDATION: Record<
  OnboardingAnswers['activity_level'],
  Record<OnboardingAnswers['pain_duration'], DayOption>
> = {
  sedentary: { acute: 3, subacute: 3, chronic: 3 },
  light:     { acute: 3, subacute: 3, chronic: 4 },
  active:    { acute: 3, subacute: 4, chronic: 4 },
  athlete:   { acute: 4, subacute: 4, chronic: 5 },
};

function recommendedDays(
  activity: OnboardingAnswers['activity_level'] | undefined,
  duration: OnboardingAnswers['pain_duration'] | undefined,
): DayOption {
  if (!activity || !duration) return 4;
  return RECOMMENDATION[activity]?.[duration] ?? 4;
}

// ---------------------------------------------------------------------------
// Display order — recommended always sits in the CENTER slot (index 2 of 5).
// We compute a reordered array from the full sorted options list so that no
// matter which value is recommended it is rendered at the middle position.
//
// Strategy:
//   1. Collect options below R (descending) and above R (ascending).
//   2. We have 2 left slots and 2 right slots to fill.
//   3. Fill left slots from closest-below first; if below runs out, borrow from above.
//   4. Fill right slots from closest-above first; if above runs out, borrow from below.
//   Result: [left2, left1, R, right1, right2] — R always at index 2.
// ---------------------------------------------------------------------------

function centeredDisplayOrder(options: readonly DayOption[], recommended: DayOption): DayOption[] {
  const below = options.filter((d) => d < recommended).sort((a, b) => b - a); // desc: closest first
  const above = options.filter((d) => d > recommended).sort((a, b) => a - b); // asc: closest first

  const left: DayOption[] = [];
  const right: DayOption[] = [];

  // Fill 2 left and 2 right slots, borrowing from the other side when one runs out.
  const belowQ = [...below];
  const aboveQ = [...above];

  for (let i = 0; i < 2; i++) {
    if (belowQ.length > 0) {
      left.unshift(belowQ.shift()!);
    } else {
      // No more below — take from the front of the already-assigned right slots
      // or the next above.
      const extra = aboveQ.shift();
      if (extra !== undefined) left.unshift(extra);
    }
  }
  for (let i = 0; i < 2; i++) {
    if (aboveQ.length > 0) {
      right.push(aboveQ.shift()!);
    } else {
      const extra = belowQ.shift();
      if (extra !== undefined) right.push(extra);
    }
  }

  return [...left, recommended, ...right];
}

// ---------------------------------------------------------------------------
// Bubble appearance — size + colour based on distance from recommended.
// diff=0 is the tallest platform (recommended); larger diff = shorter + smaller.
// ---------------------------------------------------------------------------

type BubbleCfg = {
  diameter: number;
  bgColor: string;
  textColor: string;
  numSize: number;
  labelSize: number;
  /** Vertical offset from top of container — 0 = tallest (1st-place platform). */
  podiumTop: number;
};

const BUBBLE_CFG: Record<0 | 1 | 2 | 3, BubbleCfg> = {
  0: { diameter: 90, bgColor: '#3E6B4E', textColor: '#FFFFFF', numSize: 28, labelSize: 12, podiumTop: 0 },
  1: { diameter: 68, bgColor: '#5A8E6C', textColor: '#FFFFFF', numSize: 22, labelSize: 10, podiumTop: 26 },
  2: { diameter: 50, bgColor: '#8DB89A', textColor: '#1E4D2F', numSize: 17, labelSize: 9,  podiumTop: 50 },
  3: { diameter: 38, bgColor: '#B0CEBC', textColor: '#2A5440', numSize: 14, labelSize: 8,  podiumTop: 66 },
};

function bubbleCfg(day: DayOption, recommended: DayOption): BubbleCfg {
  const diff = Math.min(Math.abs(day - recommended), 3) as 0 | 1 | 2 | 3;
  return BUBBLE_CFG[diff];
}

// ---------------------------------------------------------------------------
// Smooth sinusoidal float animation (Easing.inOut(Easing.sin) = cosine curve).
// Starting at ±amplitude means the first frame is already at a natural rest
// position — no initial jump or pop. Each bubble has distinct speed + phase.
// ---------------------------------------------------------------------------

function useFloatAnim(amplitude: number, halfPeriod: number, startHigh: boolean): Animated.Value {
  const anim = useRef(new Animated.Value(startHigh ? -amplitude : amplitude)).current;
  const ready = useAfterTransition();

  useEffect(() => {
    if (!ready) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: startHigh ? amplitude : -amplitude,
          duration: halfPeriod,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: startHigh ? -amplitude : amplitude,
          duration: halfPeriod,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [ready]);

  return anim;
}

// ---------------------------------------------------------------------------
// DayBubble
// ---------------------------------------------------------------------------

interface BubbleProps {
  day: DayOption;
  recommended: DayOption;
  selected: boolean;
  onPress: () => void;
  floatY: Animated.Value;
}

function DayBubble({ day, recommended, selected, onPress, floatY }: BubbleProps) {
  const cfg = bubbleCfg(day, recommended);
  const { diameter } = cfg;
  const isRec = day === recommended;
  const ringSize = diameter + 10;

  return (
    <Animated.View
      style={[
        styles.bubbleSlot,
        {
          marginTop: cfg.podiumTop,
          opacity: selected ? 1 : 0.78,
          transform: [{ translateY: floatY }, { scale: selected ? 1.08 : 1 }],
        },
      ]}
    >
      <View
        style={[
          styles.bubbleRing,
          {
            width: ringSize,
            height: ringSize,
            borderRadius: ringSize / 2,
            borderColor: selected ? colors.primaryDeep : 'transparent',
            backgroundColor: selected ? colors.primaryMuted : 'transparent',
          },
        ]}
      >
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={0.8}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={[
            {
              width: diameter,
              height: diameter,
              borderRadius: diameter / 2,
              backgroundColor: selected ? colors.primaryDeep : cfg.bgColor,
              alignItems: 'center',
              justifyContent: 'center',
            },
            selected ? styles.bubbleSelected : isRec ? styles.bubbleRecommended : null,
          ]}
        >
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: cfg.numSize,
              fontWeight: '700',
              lineHeight: cfg.numSize + 2,
              includeFontPadding: false,
            }}
          >
            {day}
          </Text>
          <Text
            style={{
              color: selected ? 'rgba(255,255,255,0.92)' : cfg.textColor,
              fontSize: cfg.labelSize,
              fontWeight: '600',
              lineHeight: cfg.labelSize + 3,
              includeFontPadding: false,
              opacity: 0.92,
            }}
          >
            days
          </Text>
        </TouchableOpacity>
      </View>

      {selected ? (
        <View style={styles.selectedCheck} />
      ) : isRec ? (
        <View style={[styles.recommendedDot, { backgroundColor: cfg.bgColor }]} />
      ) : (
        <View style={styles.markerSpacer} />
      )}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function Q8Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { answers, setAnswer, clearAnswer, progress, setLocalAnswer } = useOnboarding();
  useTrackOnboardingStep('q8');
  const completeStep = useOnboardingStepCompletion();

  const suggested = recommendedDays(answers.activity_level, answers.pain_duration);

  const [minutes, setMinutes] = useState<number>(
    () => progress?.minutes ?? RECOMMENDED_MINUTES,
  );
  const [selectedDays, setSelectedDays] = useState<DayOption | null>(() => {
    const saved = answers.sessions_per_week_preference;
    if (saved != null && (DAY_OPTIONS as number[]).includes(saved)) return saved as DayOption;
    return null;
  });
  const daysDeselected = useRef(false);

  // Compute display order with recommended at the center slot (index 2).
  const displayOrder = centeredDisplayOrder(DAY_OPTIONS, suggested);

  // Five independent float hooks — must be unconditional, one per option.
  // Params give each bubble a distinct amplitude, speed, and starting direction.
  const float3 = useFloatAnim(8,  2050, false);
  const float4 = useFloatAnim(10, 1750, true);
  const float5 = useFloatAnim(7,  2350, false);
  const float6 = useFloatAnim(9,  1950, true);
  const float7 = useFloatAnim(6,  2200, false);
  const floatMap: Record<DayOption, Animated.Value> = {
    3: float3, 4: float4, 5: float5, 6: float6, 7: float7,
  };

  // ---------------------------------------------------------------------------
  // Hint pill — fades in after a minutes tap, sits above the day bubbles,
  // then fades out on its own (or immediately when a day is tapped).
  // ---------------------------------------------------------------------------
  const hintOpacity = useRef(new Animated.Value(0)).current;
  const hintTranslate = useRef(new Animated.Value(-8)).current;
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintVisible = useRef(false);

  function clearHintTimers() {
    if (hintTimer.current) clearTimeout(hintTimer.current);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    hintTimer.current = null;
    dismissTimer.current = null;
  }

  function hideHint() {
    clearHintTimers();
    if (!hintVisible.current) return;
    hintVisible.current = false;
    Animated.parallel([
      Animated.timing(hintOpacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(hintTranslate, {
        toValue: -6,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }

  function showHint() {
    clearHintTimers();
    hintVisible.current = false;
    hintOpacity.setValue(0);
    hintTranslate.setValue(-8);
    hintTimer.current = setTimeout(() => {
      hintVisible.current = true;
      onboardingHintShown({ step_key: 'q8', hint_key: 'q8_days' });
      Animated.parallel([
        Animated.timing(hintOpacity, {
          toValue: 1,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(hintTranslate, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
      dismissTimer.current = setTimeout(hideHint, 2200);
    }, 450);
  }

  useEffect(
    () => () => {
      clearHintTimers();
    },
    [],
  );

  function handleMinutes(opt: (typeof MINUTE_OPTIONS)[number]) {
    const isDeselect = minutes === opt.value;
    if (isDeselect) {
      setMinutes(RECOMMENDED_MINUTES);
      setLocalAnswer('minutes', RECOMMENDED_MINUTES);
    } else {
      setMinutes(opt.value);
      setLocalAnswer('minutes', opt.value);
    }
    onboardingOptionSelected({
      step_key: 'q8',
      option_value: opt.analyticsValue,
      is_multi_select: false,
      is_deselect: isDeselect,
      is_recommended: opt.value === RECOMMENDED_MINUTES,
    });
    showHint();
  }

  // Pre-select the recommended value so the program always has a sessions/week
  // answer. Skipped once the user has explicitly deselected.
  useEffect(() => {
    if (!daysDeselected.current && answers.sessions_per_week_preference == null) {
      setSelectedDays(suggested);
      setAnswer('sessions_per_week_preference', suggested);
    }
  }, [suggested]);

  function handleDaySelect(day: DayOption) {
    hideHint();
    const isDeselect = selectedDays === day;
    onboardingOptionSelected({
      step_key: 'q8',
      option_value: (`days_${day}` as const),
      is_multi_select: false,
      is_deselect: isDeselect,
      is_recommended: day === suggested,
    });
    if (isDeselect) {
      daysDeselected.current = true;
      setSelectedDays(null);
      clearAnswer('sessions_per_week_preference');
    } else {
      daysDeselected.current = false;
      setSelectedDays(day);
      setAnswer('sessions_per_week_preference', day);
    }
  }

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <PersonalizingLayout currentStep="q8">
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.heading}>
            How much time do you have each day?
          </Text>

          <View style={styles.options}>
            {MINUTE_OPTIONS.map((opt) => (
              <OptionCard
                key={opt.value}
                label={opt.label}
                subtitle={
                  opt.value === RECOMMENDED_MINUTES ? 'Recommended for you' : undefined
                }
                selected={minutes === opt.value}
                onPress={() => handleMinutes(opt)}
              />
            ))}
          </View>

          <View style={styles.daysBlock}>
            <View style={styles.subheadingRow}>
              <Text style={styles.subheading}>How many days per week?</Text>
              <Text style={styles.subheadingRec}>{suggested} recommended</Text>
            </View>

            <Animated.View
              pointerEvents="none"
              style={[
                styles.hintWrap,
                { opacity: hintOpacity, transform: [{ translateY: hintTranslate }] },
              ]}
            >
              <View style={styles.hintBubble}>
                <Text style={styles.hintText}>Tap your days ↓</Text>
              </View>
            </Animated.View>

          {/* Podium row — recommended is always at center via centeredDisplayOrder().
              Fixed height so floating animation never shifts surrounding layout. */}
          <View style={styles.podiumContainer}>
            {displayOrder.map((day) => (
              <DayBubble
                key={day}
                day={day}
                recommended={suggested}
                selected={selectedDays === day}
                onPress={() => handleDaySelect(day)}
                floatY={floatMap[day]}
              />
            ))}
          </View>
          </View>
        </ScrollView>
      </PersonalizingLayout>

      <ContinueButton
        onPress={() => {
          completeStep();
          router.push('/(onboarding)/finalizing');
        }}
        disabled={answers.sessions_per_week_preference == null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingTop: 4,
    paddingBottom: 8,
  },
  heading: {
    ...type.question,
    color: colors.textPrimary,
    marginBottom: 20,
  },
  options: {
    gap: 12,
  },
  daysBlock: {
    marginTop: 18,
    position: 'relative',
    overflow: 'visible',
  },
  hintWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 28,
    alignItems: 'center',
    zIndex: 8,
    elevation: 8,
  },
  hintBubble: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
  },
  hintText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  subheadingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  subheading: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  subheadingRec: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.primary,
  },
  podiumContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    height: 168,
  },
  bubbleSlot: {
    alignItems: 'center',
  },
  bubbleRing: {
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleSelected: {
    shadowColor: colors.primaryDeep,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 7,
  },
  bubbleRecommended: {
    shadowColor: '#3E6B4E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 7,
    elevation: 4,
  },
  recommendedDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 6,
    opacity: 0.6,
  },
  selectedCheck: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginTop: 6,
    backgroundColor: colors.primaryDeep,
  },
  markerSpacer: {
    width: 7,
    height: 7,
    marginTop: 6,
  },
});
