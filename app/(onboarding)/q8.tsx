import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WarmBackground } from '../../components/onboarding/WarmBackground';
import { OptionCard } from '../../components/onboarding/OptionCard';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { PersonalizingLayout } from '../../components/onboarding/PersonalizingLayout';
import { useOnboarding, useTrackOnboardingStep } from '../../context/OnboardingContext';
import { colors } from '../../constants/colors';
import { type } from '../../constants/typography';
import { onboardingOptionSelected } from '../../lib/analytics/events/onboarding';
import { useAfterTransition } from '../../lib/useAfterTransition';
import { useOnboardingStepCompletion } from '../../lib/analytics/onboardingSteps';
import { sessionLength } from '../../lib/analytics/events/enums';
import { hapticSelection } from '../../lib/haptics';
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

// Days stay in numeric order (3 → 7). Size follows distance from the
// recommendation so that day is the tall one. Only the selected day is in
// color — the rest stay grey until you slide onto them.
const RING = 8;
const PAD_X = 2;
const MIN_GAP = 6;
const CHIP_W = 112;
const CHIP_H = 28;
const NOTCH_H = 7;
const GAP_BELOW_CHIP = 10;
const SIZE_BY_DIFF = [96, 64, 48, 40, 36] as const;
const BOUNCE: Record<DayOption, { amp: number; half: number; high: boolean }> = {
  3: { amp: 3, half: 2100, high: false },
  4: { amp: 4, half: 1800, high: true },
  5: { amp: 3, half: 2400, high: false },
  6: { amp: 4, half: 2000, high: true },
  7: { amp: 3, half: 2250, high: false },
};

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
  }, [ready, anim, amplitude, halfPeriod, startHigh]);

  return anim;
}

type PlacedBubble = {
  day: DayOption;
  diameter: number;
  x: number;
  ring: number;
};

function estimateRowWidth(): number {
  // The screen pads 24pt each side. Undershoot so the first paint cannot
  // hang a bubble off the edge; onLayout then uses the measured width.
  return Math.max(0, Dimensions.get('window').width - 56);
}

function placeBubbles(rowWidth: number, recommended: DayOption): PlacedBubble[] {
  if (rowWidth <= 0) return [];
  const inner = Math.max(0, rowWidth - PAD_X * 2);
  const minGaps = MIN_GAP * (DAY_OPTIONS.length - 1);
  if (inner <= minGaps) return [];
  const natural = DAY_OPTIONS.map(
    (day) => SIZE_BY_DIFF[Math.min(Math.abs(day - recommended), SIZE_BY_DIFF.length - 1)],
  );
  const naturalSum = natural.reduce((sum, diameter) => sum + diameter + RING, 0);
  const scale = Math.min(1, (inner - minGaps) / naturalSum);
  const diameters = natural.map((diameter) => Math.round(diameter * scale));
  const rings = diameters.map((diameter) => diameter + RING);
  let sum = rings.reduce((total, ring) => total + ring, 0);
  if (sum + minGaps > inner && sum > 0) {
    const shrink = (inner - minGaps) / sum;
    for (let i = 0; i < diameters.length; i++) {
      diameters[i] = Math.floor(diameters[i] * shrink);
      rings[i] = diameters[i] + RING;
    }
    sum = rings.reduce((total, ring) => total + ring, 0);
  }
  const gap = (inner - sum) / (DAY_OPTIONS.length - 1);
  let x = PAD_X;
  return DAY_OPTIONS.map((day, i) => {
    const placed = { day, diameter: diameters[i], x, ring: rings[i] };
    x += rings[i] + gap;
    return placed;
  });
}

function nearestDay(localX: number, placed: readonly PlacedBubble[]): DayOption | null {
  if (placed.length === 0) return null;
  let best = placed[0];
  let bestDist = Infinity;
  for (const item of placed) {
    const dist = Math.abs(localX - (item.x + item.ring / 2));
    if (dist < bestDist) {
      bestDist = dist;
      best = item;
    }
  }
  return best.day;
}

function DayBubble({
  day,
  selected,
  diameter,
}: {
  day: DayOption;
  selected: boolean;
  diameter: number;
}) {
  const bounce = BOUNCE[day];
  const floatY = useFloatAnim(bounce.amp, bounce.half, bounce.high);
  const numSize = Math.round(diameter * (selected ? 0.36 : 0.42));
  const labelSize = Math.max(11, Math.round(diameter * 0.15));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.bubbleRing,
        { transform: [{ translateY: floatY }] },
        {
          width: diameter + RING,
          height: diameter + RING,
          borderRadius: (diameter + RING) / 2,
          borderColor: selected ? colors.primaryDeep : 'transparent',
          backgroundColor: selected ? colors.primaryMuted : 'transparent',
        },
      ]}
    >
      <View
        style={[
          styles.bubbleFace,
          {
            width: diameter,
            height: diameter,
            borderRadius: diameter / 2,
            backgroundColor: selected ? colors.primary : '#D4CDC7',
          },
          selected && styles.bubbleSelected,
        ]}
      >
        <Text
          allowFontScaling={false}
          style={{
            color: selected ? '#FFFFFF' : '#8C857E',
            fontSize: numSize,
            fontWeight: '700',
            lineHeight: numSize + 2,
            includeFontPadding: false,
          }}
        >
          {day}
        </Text>
        {selected ? (
          <Text
            allowFontScaling={false}
            style={{
              color: 'rgba(255,255,255,0.9)',
              fontSize: labelSize,
              fontWeight: '600',
              lineHeight: labelSize + 2,
              includeFontPadding: false,
            }}
          >
            days
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

function DaySlider({
  selected,
  recommended,
  onSelect,
}: {
  selected: DayOption | null;
  recommended: DayOption;
  onSelect: (day: DayOption) => void;
}) {
  const focus = selected ?? recommended;
  const widthRef = useRef(estimateRowWidth());
  const [rowWidth, setRowWidth] = useState(widthRef.current);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const placedRef = useRef<PlacedBubble[]>([]);
  const dragged = useRef(false);

  const placed = placeBubbles(rowWidth, recommended);
  placedRef.current = placed;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        dragged.current = false;
      },
      onPanResponderMove: (e, g) => {
        if (Math.abs(g.dx) < 6 || Math.abs(g.dy) > Math.abs(g.dx)) return;
        dragged.current = true;
        const day = nearestDay(e.nativeEvent.locationX, placedRef.current);
        if (day) onSelectRef.current(day);
      },
      onPanResponderRelease: (e, g) => {
        if (dragged.current) return;
        if (Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8) return;
        const day = nearestDay(e.nativeEvent.locationX, placedRef.current);
        if (day) onSelectRef.current(day);
      },
    }),
  ).current;

  const maxRing = placed.reduce((max, item) => Math.max(max, item.ring), 0);
  const bubbleTop = CHIP_H + NOTCH_H + GAP_BELOW_CHIP;
  const rec = placed.find((item) => item.day === recommended);
  const recCenter = rec ? rec.x + rec.ring / 2 : 0;
  const chipLeft = Math.max(0, Math.min(rowWidth - CHIP_W, recCenter - CHIP_W / 2));

  return (
    <View>
      <View
        style={[styles.slider, maxRing > 0 && { minHeight: bubbleTop + maxRing + 14 }]}
        accessibilityRole="adjustable"
        accessibilityLabel="Days per week"
        accessibilityHint="Slide sideways or tap a number"
        accessibilityValue={{
          min: DAY_OPTIONS[0],
          max: DAY_OPTIONS[DAY_OPTIONS.length - 1],
          now: focus,
        }}
        accessibilityActions={[
          { name: 'increment', label: 'More days' },
          { name: 'decrement', label: 'Fewer days' },
        ]}
        onAccessibilityAction={(event) => {
          const index = DAY_OPTIONS.indexOf(focus);
          const next =
            event.nativeEvent.actionName === 'increment'
              ? DAY_OPTIONS[index + 1]
              : event.nativeEvent.actionName === 'decrement'
                ? DAY_OPTIONS[index - 1]
                : undefined;
          if (next) onSelectRef.current(next);
        }}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (w > 0 && w !== widthRef.current) {
            widthRef.current = w;
            setRowWidth(w);
          }
        }}
        {...pan.panHandlers}
      >
        {placed.length > 0 && rec && (
          <>
            <View pointerEvents="none" style={[styles.recChip, { left: chipLeft }]}>
              <Text allowFontScaling={false} style={styles.recChipText}>
                Recommended
              </Text>
            </View>
            <View
              pointerEvents="none"
              style={[styles.recNotch, { left: recCenter - 6, top: CHIP_H - 1 }]}
            />
            {placed.map((item) => (
              <View
                key={item.day}
                pointerEvents="none"
                style={[
                  styles.bubbleSlot,
                  {
                    left: item.x,
                    width: item.ring,
                    top: bubbleTop,
                    height: maxRing,
                    zIndex: item.day === focus ? 2 : 0,
                  },
                ]}
              >
                <DayBubble
                  day={item.day}
                  selected={item.day === focus}
                  diameter={item.diameter}
                />
              </View>
            ))}
          </>
        )}
      </View>
      <Text style={styles.sliderCaption}>Slide or tap a number</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function Q8Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { answers, setAnswer, progress, setLocalAnswer } = useOnboarding();
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
  const selectedRef = useRef(selectedDays);

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
  }

  // Pre-select the recommended value so the program always has a sessions/week answer.
  useEffect(() => {
    if (answers.sessions_per_week_preference == null) {
      selectedRef.current = suggested;
      setSelectedDays(suggested);
      setAnswer('sessions_per_week_preference', suggested);
    }
  }, [suggested]);

  function selectDay(day: DayOption) {
    if (selectedRef.current === day) return;
    selectedRef.current = day;
    onboardingOptionSelected({
      step_key: 'q8',
      option_value: (`days_${day}` as const),
      is_multi_select: false,
      is_deselect: false,
      is_recommended: day === suggested,
    });
    setSelectedDays(day);
    setAnswer('sessions_per_week_preference', day);
    hapticSelection();
  }

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <WarmBackground />
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
            <View style={styles.daysCluster}>
              <Text style={styles.subheading}>How many days per week?</Text>

              <DaySlider
                selected={selectedDays}
                recommended={suggested}
                onSelect={selectDay}
              />
            </View>
          </View>
        </ScrollView>
      </PersonalizingLayout>

      <ContinueButton
        onPress={() => {
          completeStep();
          router.push('/(onboarding)/commit');
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
    flexGrow: 1,
    justifyContent: 'center',
    marginTop: 8,
    paddingTop: 12,
    paddingBottom: 8,
  },
  daysCluster: {
    position: 'relative',
  },
  subheading: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: colors.textPrimary,
    marginBottom: 16,
  },
  slider: {
    position: 'relative',
  },
  recChip: {
    position: 'absolute',
    top: 0,
    width: CHIP_W,
    height: CHIP_H,
    borderRadius: CHIP_H / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  recChipText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  recNotch: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: NOTCH_H,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.primary,
    zIndex: 3,
  },
  sliderCaption: {
    marginTop: 14,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  bubbleSlot: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bubbleRing: {
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleFace: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1C1C1E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  bubbleSelected: {
    shadowColor: colors.primaryDeep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
});
