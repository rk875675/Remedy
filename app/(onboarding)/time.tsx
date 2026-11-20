import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PetMood } from '../../constants/petImages';
import {
  AskHeader,
  Icon,
  ObFooter,
  ObScreen,
  PrimaryButton,
  ob,
  obCenterContent,
  obType,
} from '../../components/onboarding/kit';
import { useOnboarding } from '../../context/OnboardingContext';
import { hapticSelection } from '../../lib/haptics';
import { programWeeksBeforeSafety } from '../../lib/intakeSummary';
import { parseCompleteAnswers } from '../../lib/planPreview';
import { trackOption, useObStep } from '../../lib/onboardingFlow';
import { useAfterTransition } from '../../lib/useAfterTransition';
import { useReduceMotion } from '../../lib/useReduceMotion';
import type { OnboardingAnswers } from '../../types/database';

type Minute = 15 | 20 | 30;
type DayOption = 3 | 4 | 5 | 6 | 7;
type Activity = OnboardingAnswers['activity_level'];
type Duration = OnboardingAnswers['pain_duration'];

const COPY = {
  ask: 'How much time can you give this?',
  minutesLabel: 'MINUTES PER SESSION',
  daysLabel: 'DAYS PER WEEK',
  recommended: 'Recommended',
} as const;

const MINUTES: readonly Minute[] = [15, 20, 30];
const DAYS: readonly DayOption[] = [3, 4, 5, 6, 7];

const MINUTE_TOKEN = {
  15: 'minutes_15',
  20: 'minutes_20',
  30: 'minutes_30',
} as const;

const DAY_TOKEN = {
  3: 'days_3',
  4: 'days_4',
  5: 'days_5',
  6: 'days_6',
  7: 'days_7',
} as const;

// Same table as the old q8 screen (activity x pain duration).
// 6 and 7 are offered, never recommended. Missing answers fall back to 4.
const RECOMMENDATION: Record<Activity, Record<Duration, DayOption>> = {
  sedentary: { acute: 3, subacute: 3, chronic: 3 },
  light: { acute: 3, subacute: 3, chronic: 4 },
  active: { acute: 3, subacute: 4, chronic: 4 },
  athlete: { acute: 4, subacute: 4, chronic: 5 },
};

function recommendedDays(activity: Activity | undefined, duration: Duration | undefined): DayOption {
  if (!activity || !duration) return 4;
  return RECOMMENDATION[activity][duration] ?? 4;
}

function recommendedMinute(intensity: number | undefined, flare: string | undefined): Minute {
  if ((intensity ?? 0) >= 7 || flare === 'days') return 15;
  return 20;
}

function savedMinute(value: number | null | undefined): Minute | null {
  if (value === 15 || value === 20 || value === 30) return value;
  return null;
}

function savedDay(value: number | null | undefined): DayOption | null {
  if (value === 3 || value === 4 || value === 5 || value === 6 || value === 7) return value;
  return null;
}

function minutesReaction(minutes: Minute): { line: string; mood: PetMood } {
  if (minutes === 15) return { line: "Fifteen minutes. That's enough.", mood: 'ready' };
  if (minutes === 20) return { line: 'Twenty minutes. A good block.', mood: 'ready' };
  return { line: "Thirty minutes. We'll use them.", mood: 'celebrating' };
}

function daysReaction(days: DayOption): { line: string; mood: PetMood } {
  if (days <= 3) return { line: `${days} days a week. Solid.`, mood: 'ready' };
  if (days <= 5) return { line: `${days} days a week. Let's go.`, mood: 'celebrating' };
  return { line: `${days} days. Ambitious. I like it.`, mood: 'celebrating' };
}

/** One line for whatever is currently chosen, including both when both are set. */
function scheduleLine(minutes: Minute | null, days: DayOption | null): { line: string; mood: PetMood } {
  if (minutes !== null && days !== null) {
    const tail = days <= 3 ? 'Solid.' : days <= 5 ? "Let's go." : 'Ambitious. I like it.';
    const mood: PetMood = days >= 4 || minutes === 30 ? 'celebrating' : 'ready';
    return { line: `${minutes} min, ${days} days a week. ${tail}`, mood };
  }
  if (days !== null) return daysReaction(days);
  if (minutes !== null) return minutesReaction(minutes);
  return { line: COPY.ask, mood: 'pointing' };
}

function QuestionCaption({ ask, shown }: { ask: string; shown: boolean }) {
  const reduce = useReduceMotion();
  const opacity = useRef(new Animated.Value(shown ? 1 : 0)).current;

  useEffect(() => {
    const next = shown ? 1 : 0;
    if (reduce !== false) {
      opacity.setValue(next);
      return;
    }
    const anim = Animated.timing(opacity, {
      toValue: next,
      duration: ob.motion.fast,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [shown, reduce, opacity]);

  return (
    <Animated.Text
      numberOfLines={1}
      style={[styles.caption, { opacity }]}
      accessibilityRole="header"
      accessible={shown}
      accessibilityElementsHidden={!shown}
      importantForAccessibility={shown ? 'yes' : 'no-hide-descendants'}
    >
      {ask}
    </Animated.Text>
  );
}

function Reveal({ index, children }: { index: number; children: ReactNode }) {
  const reduce = useReduceMotion();
  const ready = useAfterTransition();
  const opacity = useRef(new Animated.Value(reduce === true ? 1 : 0)).current;
  const shift = useRef(new Animated.Value(reduce === true ? 0 : 12)).current;

  useEffect(() => {
    if (reduce === null) return;
    if (reduce) {
      opacity.setValue(1);
      shift.setValue(0);
      return;
    }
    if (!ready) return;
    const anim = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: ob.motion.base,
        delay: index * ob.motion.stagger,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(shift, {
        toValue: 0,
        duration: ob.motion.base,
        delay: index * ob.motion.stagger,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [reduce, ready, index, opacity, shift]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY: shift }] }}>{children}</Animated.View>
  );
}

function FinishSticker({ text }: { text: string }) {
  const reduce = useReduceMotion();
  const ready = useAfterTransition();
  const opacity = useRef(new Animated.Value(0)).current;
  const shift = useRef(new Animated.Value(8)).current;
  const rock = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce === null) return;
    if (reduce) {
      opacity.setValue(1);
      shift.setValue(0);
      rock.setValue(0);
      return;
    }
    if (!ready) return;
    opacity.setValue(0);
    shift.setValue(8);
    rock.setValue(0);
    const intro = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: ob.motion.base,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(shift, {
        toValue: 0,
        duration: ob.motion.base,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    const sway = Animated.loop(
      Animated.sequence([
        Animated.timing(rock, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(rock, {
          toValue: -1,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    intro.start();
    sway.start();
    return () => {
      intro.stop();
      sway.stop();
    };
  }, [reduce, ready, opacity, shift, rock]);

  const tilt = rock.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-1.5deg', '1.5deg'],
  });
  const still = reduce === true;

  return (
    <View
      pointerEvents="none"
      style={styles.note}
      accessibilityLiveRegion="polite"
      accessibilityRole="text"
      accessibilityLabel={text}
    >
      <Animated.View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.sticker,
          still ? null : { opacity, transform: [{ translateY: shift }, { rotate: tilt }] },
        ]}
      >
        <View style={styles.stickerBadge}>
          <Icon name="calendar-outline" size={24} color={ob.color.accentDeep} />
        </View>
        <Text style={styles.stickerText}>{text}</Text>
      </Animated.View>
    </View>
  );
}

function MinuteTile({
  value,
  selected,
  recommended,
  onPress,
}: {
  value: Minute;
  selected: boolean;
  recommended: boolean;
  onPress: () => void;
}) {
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const label = recommended ? `${value} minutes, recommended` : `${value} minutes`;

  function springTo(toValue: number) {
    if (reduce === true) {
      scale.setValue(1);
      return;
    }
    Animated.spring(scale, {
      toValue,
      tension: ob.motion.spring.tension,
      friction: ob.motion.spring.friction,
      useNativeDriver: true,
    }).start();
  }

  return (
    <View style={styles.minuteSlot}>
      {recommended ? (
        <View pointerEvents="none" style={styles.minuteBadge}>
          <Text allowFontScaling={false} numberOfLines={1} style={styles.minuteBadgeText}>
            {COPY.recommended}
          </Text>
        </View>
      ) : null}
      <Animated.View style={{ transform: [{ scale }] }}>
        <Pressable
          testID={`minutes-${value}`}
          accessibilityRole="radio"
          accessibilityLabel={label}
          accessibilityState={{ selected }}
          onPress={() => {
            hapticSelection();
            onPress();
          }}
          onPressIn={() => springTo(ob.motion.pressScale)}
          onPressOut={() => springTo(1)}
          style={[styles.minuteTile, selected ? styles.minuteTileOn : null]}
        >
          <Text style={[styles.minuteFigure, selected ? styles.minuteFigureOn : null]}>{value}</Text>
          <Text style={[styles.minuteUnit, selected ? styles.minuteUnitOn : null]}>min</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export default function TimeScreen() {
  const { chapter, progress, goNext } = useObStep('time');
  const { answers, intake, progress: saved, setAnswer, clearAnswer, setIntake, clearIntake, setLocalAnswer } =
    useOnboarding();
  const suggestedMinutes = recommendedMinute(intake.intensity, intake.flare_settle);
  const suggestedDays = recommendedDays(answers.activity_level, answers.pain_duration);
  const restoredDay = savedDay(answers.sessions_per_week_preference);
  const userEdited = useRef(false);
  const lock = useRef(false);
  const release = useRef(false);
  const navigation = useNavigation();
  const focused = useIsFocused();

  const [minutes, setMinutes] = useState<Minute | null>(
    () => savedMinute(intake.minutes) ?? savedMinute(saved?.minutes) ?? suggestedMinutes,
  );
  const [days, setDays] = useState<DayOption | null>(() => restoredDay ?? suggestedDays);

  useEffect(() => {
    navigation.setOptions({ freezeOnBlur: false });
  }, [navigation]);

  useEffect(() => {
    return navigation.addListener('blur', () => {
      if (!lock.current) return;
      release.current = true;
      lock.current = false;
    });
  }, [navigation]);

  if (!focused && lock.current) {
    release.current = true;
    lock.current = false;
  } else if (focused && release.current) {
    release.current = false;
    lock.current = false;
  }

  useEffect(() => {
    if (userEdited.current) return;
    const nextMinutes = savedMinute(intake.minutes) ?? savedMinute(saved?.minutes);
    const nextDays = savedDay(answers.sessions_per_week_preference);
    if (nextMinutes !== null) setMinutes(nextMinutes);
    if (nextDays !== null) setDays(nextDays);
  }, [intake.minutes, saved?.minutes, answers.sessions_per_week_preference]);

  function chooseMinutes(value: Minute) {
    userEdited.current = true;
    if (value === minutes) {
      setMinutes(null);
      clearIntake('minutes');
      setLocalAnswer('minutes', null);
      trackOption('time', MINUTE_TOKEN[value], {
        multi: false,
        deselect: true,
        recommended: value === suggestedMinutes,
      });
      return;
    }
    setMinutes(value);
    setIntake('minutes', value);
    setLocalAnswer('minutes', value);
    trackOption('time', MINUTE_TOKEN[value], {
      multi: false,
      deselect: false,
      recommended: value === suggestedMinutes,
    });
  }

  function chooseDays(value: DayOption) {
    userEdited.current = true;
    if (value === days) {
      setDays(null);
      clearAnswer('sessions_per_week_preference');
      trackOption('time', DAY_TOKEN[value], {
        multi: false,
        deselect: true,
        recommended: value === suggestedDays,
      });
      return;
    }
    setDays(value);
    setAnswer('sessions_per_week_preference', value);
    trackOption('time', DAY_TOKEN[value], {
      multi: false,
      deselect: false,
      recommended: value === suggestedDays,
    });
  }

  function handleContinue() {
    if (lock.current || minutes === null || days === null) return;
    lock.current = true;
    setAnswer('sessions_per_week_preference', days);
    setIntake('minutes', minutes);
    setLocalAnswer('minutes', minutes);
    goNext();
  }

  const bubble = scheduleLine(minutes, days);

  const parsedAnswers =
    days !== null ? parseCompleteAnswers({ ...answers, sessions_per_week_preference: days }) : null;
  const weeks =
    parsedAnswers && minutes !== null ? programWeeksBeforeSafety(parsedAnswers, intake, minutes) : null;
  const note =
    days !== null && minutes !== null
      ? weeks !== null
        ? `${days} days x ${minutes} min. Your program runs ${weeks} weeks.`
        : `${days} days x ${minutes} min.`
      : null;

  return (
    <ObScreen
      testID="time"
      chapter={chapter}
      progress={progress}
      contentStyle={obCenterContent}
      footer={
        <ObFooter>
          {note ? <FinishSticker text={note} /> : null}
          <PrimaryButton
            testID="continue"
            label="Continue"
            disabled={minutes === null || days === null}
            onPress={handleContinue}
          />
        </ObFooter>
      }
    >
      <AskHeader line={bubble.line} mood={bubble.mood} />
      <QuestionCaption ask={COPY.ask} shown={bubble.line !== COPY.ask} />
      <Reveal index={0}>
        <Text style={styles.section}>{COPY.minutesLabel}</Text>
        <View
          style={styles.minuteRow}
          accessibilityRole="radiogroup"
          accessibilityLabel="Minutes per session"
        >
          {MINUTES.map((value) => (
            <MinuteTile
              key={value}
              value={value}
              selected={minutes === value}
              recommended={value === suggestedMinutes}
              onPress={() => chooseMinutes(value)}
            />
          ))}
        </View>
      </Reveal>
      <Reveal index={1}>
        <Text style={[styles.section, styles.daysSection]}>{COPY.daysLabel}</Text>
        <View style={styles.dayRow} accessibilityRole="radiogroup" accessibilityLabel="Days per week">
          {DAYS.map((value) => {
            const on = days === value;
            const recommended = value === suggestedDays;
            const label = recommended ? `${value} days a week, recommended` : `${value} days a week`;
            return (
              <View key={value} style={styles.dayCol}>
                <Pressable
                  testID={`days-${value}`}
                  accessibilityRole="radio"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    hapticSelection();
                    chooseDays(value);
                  }}
                  style={[styles.dayChip, on ? styles.dayChipOn : null]}
                >
                  <Text allowFontScaling={false} style={[styles.dayNum, on ? styles.dayNumOn : null]}>
                    {value}
                  </Text>
                </Pressable>
                {recommended ? (
                  <View
                    pointerEvents="none"
                    style={[styles.dayCaptionSlot, value === DAYS[0] ? styles.dayCaptionFirst : null]}
                  >
                    <Text allowFontScaling={false} numberOfLines={1} style={styles.dayCaption}>
                      {COPY.recommended}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </Reveal>
    </ObScreen>
  );
}

const STROKE = 1.5;

const styles = StyleSheet.create({
  caption: {
    ...obType.caption,
    marginTop: ob.space.lg,
    marginBottom: ob.space.sm,
    height: 18,
  },
  section: {
    ...obType.micro,
    marginBottom: ob.space.sm,
  },
  daysSection: {
    marginTop: ob.space.xl,
  },
  minuteRow: {
    flexDirection: 'row',
    gap: 10,
    // 20pt badge (3 + line 14 + 3) plus 4pt, so it clears the tile stroke.
    paddingTop: 24,
  },
  minuteSlot: {
    flex: 1,
  },
  minuteTile: {
    height: 84,
    borderRadius: 18,
    borderWidth: STROKE,
    borderColor: ob.color.line,
    backgroundColor: ob.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minuteTileOn: {
    borderColor: ob.color.accent,
    backgroundColor: ob.color.accentSoft,
  },
  minuteFigure: {
    ...obType.heading,
  },
  minuteFigureOn: {
    color: ob.color.accentDeep,
  },
  minuteUnit: {
    ...obType.caption,
  },
  minuteUnitOn: {
    color: ob.color.accentDeep,
  },
  minuteBadge: {
    position: 'absolute',
    top: -24,
    alignSelf: 'center',
    zIndex: 1,
    borderRadius: 8,
    backgroundColor: ob.color.accentSoft,
    paddingVertical: 3,
    paddingHorizontal: 7,
  },
  minuteBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: ob.color.accentDeep,
  },
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    overflow: 'visible',
    paddingBottom: 22,
  },
  dayCol: {
    width: 52,
    alignItems: 'center',
    overflow: 'visible',
  },
  dayChip: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: STROKE,
    borderColor: ob.color.line,
    backgroundColor: ob.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayChipOn: {
    borderColor: ob.color.accent,
    backgroundColor: ob.color.accent,
  },
  dayNum: {
    ...obType.heading,
    color: ob.color.ink,
  },
  dayNumOn: {
    color: '#FFFFFF',
  },
  dayCaptionSlot: {
    position: 'absolute',
    top: 58,
    width: 92,
    left: (52 - 92) / 2,
    alignItems: 'center',
  },
  dayCaptionFirst: {
    left: -2,
  },
  dayCaption: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: ob.color.accentDeep,
    textAlign: 'center',
  },
  note: {
    marginBottom: 36,
    paddingTop: 6,
  },
  sticker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    backgroundColor: ob.color.accentSoft,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  stickerBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: ob.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerText: {
    ...obType.bodyStrong,
    flex: 1,
    color: ob.color.ink,
  },
});
