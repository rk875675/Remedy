import { useEffect, useRef, useState } from 'react';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import type { ReminderTime } from '../../constants/onboardingFlow';
import { OPTION_SCENES } from '../../constants/onboardingImages';
import { petScale } from '../../constants/petImages';
import { PET_WORKOUT_REMINDERS } from '../../constants/petLines';
import { shadows } from '../../constants/shadows';
import {
  AskHeader,
  NoteCard,
  NotificationMock,
  ObFooter,
  ObScreen,
  OptionList,
  OptionRow,
  PrimaryButton,
  TextLink,
  ob,
  obCenterContent,
} from '../../components/onboarding/kit';
import { Pet } from '../../components/pet/Pet';
import {
  STORAGE_NOTIF,
  STORAGE_NOTIF_TIME,
  STORAGE_WORKOUT_DAYS,
  STORAGE_WORKOUT_DAYS_SINCE,
} from '../../components/progress/WorkoutDaysModal';
import { useAuth } from '../../context/AuthContext';
import { useOnboarding } from '../../context/OnboardingContext';
import { dailyReminderDisabled, dailyReminderEnabled } from '../../lib/analytics/events/engagement';
import { useAfterTransition } from '../../lib/useAfterTransition';
import { useOnboardingPet } from '../../lib/useOnboardingPet';
import { useReduceMotion } from '../../lib/useReduceMotion';
import { hapticTabSwitch } from '../../lib/haptics';
import { localDateKey } from '../../lib/progress';
import {
  cancelWorkoutReminders,
  requestPermissions,
  scheduleWorkoutReminders,
  workoutReminderPreview,
} from '../../lib/notifications';
import { trackDecision, trackOption, useObStep } from '../../lib/onboardingFlow';
import { computeDefaultWorkoutDays } from '../../lib/workoutDays';

const COPY = {
  bubble: "I'll nudge you when it's time.",
  setup: 'Set up reminders',
  skip: 'Not now',
  ask: 'When should I remind you?',
  note: 'You can change this anytime in your profile.',
  morning: 'In the morning',
  morningSub: 'Around 8:00',
  midday: 'Around lunch',
  middaySub: 'Around 12:30',
  evening: 'In the evening',
  eveningSub: 'Around 6:30',
} as const;

const CLOCK: Record<ReminderTime, { hour: number; minute: number }> = {
  morning: { hour: 8, minute: 0 },
  midday: { hour: 12, minute: 30 },
  evening: { hour: 18, minute: 30 },
};

const REMINDER_TOKEN = {
  morning: 'reminder_morning',
  midday: 'reminder_midday',
  evening: 'reminder_evening',
} as const;

const SLOTS: readonly ReminderTime[] = ['morning', 'midday', 'evening'];

const REMINDER_LINE: Record<ReminderTime, string> = {
  morning: "Mornings. I'll be up.",
  midday: "Lunchtime. I'll find you.",
  evening: "Evenings. I'll be there.",
};

function isSlot(value: string | null | undefined): value is ReminderTime {
  return value === 'morning' || value === 'midday' || value === 'evening';
}

function TypedBubble({ line }: { line: string }) {
  const reduce = useReduceMotion();
  const ready = useAfterTransition();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (reduce === null) return;
    if (reduce) {
      setCount(line.length);
      return;
    }
    if (!ready) return;
    setCount(0);
    let shown = 0;
    const step = line.length > 70 ? 2 : 1;
    const id = setInterval(() => {
      shown = Math.min(line.length, shown + step);
      setCount(shown);
      if (shown >= line.length) clearInterval(id);
    }, ob.motion.typeMs);
    return () => clearInterval(id);
  }, [line, reduce, ready]);

  return (
    <View accessibilityRole="text" accessibilityLabel={line} style={styles.bubble}>
      <Text style={styles.bubbleText}>
        {line.slice(0, count)}
        <Text style={styles.bubbleRest}>{line.slice(count)}</Text>
      </Text>
    </View>
  );
}

/** Box the pet is drawn in. Stage 1 fills about three quarters of it. */
const PET = 268;
const HERO = 292;
/** Extra hill below the pet so the green can dissolve into the page and the notification. */
const HILL_FADE = 96;

/** Full stage-1 drawing, yellow bell included, so the bell never swings off and leaves a hole. */
const BELL = require('../../assets/pet/s1_bell.png');

function SoftHills({ width, height, ground }: { width: number; height: number; ground: number }) {
  const w = width;
  const g = ground;
  const bottom = height;
  const far = [
    `M0 ${g * 0.64}`,
    `C ${w * 0.1} ${g * 0.64} ${w * 0.14} ${g * 0.32} ${w * 0.26} ${g * 0.36}`,
    `C ${w * 0.38} ${g * 0.4} ${w * 0.44} ${g * 0.56} ${w * 0.54} ${g * 0.52}`,
    `C ${w * 0.66} ${g * 0.47} ${w * 0.72} ${g * 0.26} ${w * 0.84} ${g * 0.32}`,
    `C ${w * 0.94} ${g * 0.37} ${w} ${g * 0.5} ${w} ${g * 0.58}`,
    `L ${w} ${bottom} L 0 ${bottom} Z`,
  ].join(' ');
  const mid = [
    `M0 ${g * 0.76}`,
    `C ${w * 0.08} ${g * 0.76} ${w * 0.16} ${g * 0.5} ${w * 0.32} ${g * 0.54}`,
    `C ${w * 0.46} ${g * 0.58} ${w * 0.54} ${g * 0.44} ${w * 0.68} ${g * 0.5}`,
    `C ${w * 0.82} ${g * 0.56} ${w * 0.9} ${g * 0.68} ${w} ${g * 0.72}`,
    `L ${w} ${bottom} L 0 ${bottom} Z`,
  ].join(' ');
  const near = [
    `M0 ${bottom}`,
    `C ${w * 0.14} ${g * 0.98} ${w * 0.24} ${g * 0.78} ${w * 0.42} ${g * 0.74}`,
    `C ${w * 0.56} ${g * 0.71} ${w * 0.7} ${g * 0.76} ${w * 0.84} ${g * 0.86}`,
    `C ${w * 0.92} ${g * 0.92} ${w} ${g * 0.98} ${w} ${bottom}`,
    `Z`,
  ].join(' ');
  const washTop = g * 0.7;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessible={false}>
      <Svg width={w} height={bottom}>
        <Defs>
          <LinearGradient id="reminderHillNear" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#D7EAD4" />
            <Stop offset="1" stopColor="#C9DFC6" />
          </LinearGradient>
          <LinearGradient id="reminderHillWash" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={ob.color.bg} stopOpacity="0" />
            <Stop offset="0.42" stopColor={ob.color.bg} stopOpacity="0.45" />
            <Stop offset="0.78" stopColor={ob.color.bg} stopOpacity="0.88" />
            <Stop offset="1" stopColor={ob.color.bg} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Path d={far} fill="#E8F3E5" />
        <Path d={mid} fill="#D3E6CF" />
        <Path d={near} fill="url(#reminderHillNear)" />
        <Rect x={0} y={washTop} width={w} height={bottom - washTop} fill="url(#reminderHillWash)" />
      </Svg>
    </View>
  );
}

function RingingBell({ size, label }: { size: number; label: string }) {
  const reduce = useReduceMotion();
  const ready = useAfterTransition();
  const shake = useRef(new Animated.Value(0)).current;
  const hop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce !== false || !ready) {
      shake.setValue(0);
      hop.setValue(0);
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tilt = (value: number, duration: number, ding: boolean, next: () => void) => {
      if (ding) hapticTabSwitch();
      Animated.timing(shake, {
        toValue: value,
        duration,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
        isInteraction: false,
      }).start(({ finished }) => {
        if (finished && !stopped) next();
      });
    };
    const ring = () => {
      Animated.sequence([
        Animated.timing(hop, {
          toValue: 1,
          duration: 90,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(hop, {
          toValue: 0,
          duration: 240,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]).start();
      tilt(1, 80, true, () => {
        tilt(-0.85, 110, true, () => {
          tilt(0.55, 100, true, () => {
            tilt(-0.28, 110, false, () => {
              tilt(0, 150, false, () => {
                timer = setTimeout(ring, 1100);
              });
            });
          });
        });
      });
    };
    ring();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      shake.stopAnimation();
      hop.stopAnimation();
    };
  }, [ready, reduce, shake, hop]);

  const drawn = size * petScale(1, 'bell');
  const frame = {
    position: 'absolute' as const,
    bottom: 0,
    left: (size - drawn) / 2,
    width: drawn,
    height: drawn,
  };
  const rotate = shake.interpolate({ inputRange: [-1, 1], outputRange: ['-9deg', '9deg'] });
  const nudge = shake.interpolate({ inputRange: [-1, 1], outputRange: [-7, 7] });
  const lift = hop.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  const shadowWidth = drawn * 0.55;

  return (
    <View style={{ width: size, height: size }} accessibilityRole="image" accessibilityLabel={label}>
      <View
        pointerEvents="none"
        style={[
          styles.ground,
          {
            width: shadowWidth,
            height: drawn * 0.07,
            borderRadius: shadowWidth / 2,
            left: (size - shadowWidth) / 2,
          },
        ]}
      />
      <Animated.Image
        pointerEvents="none"
        source={BELL}
        resizeMode="contain"
        style={[
          frame,
          {
            transformOrigin: '50% 46%',
            transform: [{ translateY: lift }, { translateX: nudge }, { rotate }],
          },
        ]}
      />
    </View>
  );
}

function ReminderStack({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.stack}>
      <View
        pointerEvents="none"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.ghost, styles.ghostFar]}
      />
      <View
        pointerEvents="none"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.ghost, styles.ghostNear]}
      />
      <NotificationMock title={title} body={body} />
    </View>
  );
}

export default function RemindersScreen() {
  const { chapter, progress, goNext } = useObStep('reminders');
  const { user } = useAuth();
  const { answers, progress: saved, setLocalAnswer } = useOnboarding();
  const { stage, name } = useOnboardingPet();
  const userEdited = useRef(false);
  const lock = useRef(false);
  const restoredSlot = saved?.reminder_time;
  const [phase, setPhase] = useState<'primer' | 'when'>(isSlot(restoredSlot) ? 'when' : 'primer');
  const [slot, setSlot] = useState<ReminderTime | null>(isSlot(restoredSlot) ? restoredSlot : null);
  const [working, setWorking] = useState(false);
  const [bandWidth, setBandWidth] = useState(0);
  const reduceMotion = useReduceMotion();
  const [sampleIndex, setSampleIndex] = useState(0);
  const navigation = useNavigation();
  const focused = useIsFocused();
  // Set on blur, while this screen is still allowed to render. Coming back
  // reads it during render, because a focus effect never paints through the freeze.
  const release = useRef(false);

  useEffect(() => {
    navigation.setOptions({ freezeOnBlur: false });
  }, [navigation]);

  useEffect(() => {
    return navigation.addListener('blur', () => {
      if (!lock.current) return;
      release.current = true;
      lock.current = false;
      setWorking(false);
    });
  }, [navigation]);

  if (!focused && working) {
    release.current = true;
    lock.current = false;
    setWorking(false);
  } else if (focused && release.current) {
    release.current = false;
    lock.current = false;
    if (working) setWorking(false);
  }

  useEffect(() => {
    if (userEdited.current) return;
    if (!isSlot(restoredSlot)) return;
    setSlot(restoredSlot);
    setPhase('when');
  }, [restoredSlot]);

  useEffect(() => {
    if (phase !== 'primer' || reduceMotion !== false) return;
    const id = setInterval(() => {
      setSampleIndex((current) => (current + 1) % PET_WORKOUT_REMINDERS.length);
    }, 3400);
    return () => clearInterval(id);
  }, [phase, reduceMotion]);

  const petName = name?.trim() ? name.trim() : null;
  const sample = workoutReminderPreview(petName, sampleIndex);
  const petLabel = petName ?? 'Your armadillo';

  function openWhen() {
    userEdited.current = true;
    setPhase('when');
  }

  function chooseSlot(value: ReminderTime) {
    userEdited.current = true;
    if (value === slot) {
      setSlot(null);
      trackOption('reminders', REMINDER_TOKEN[value], { multi: false, deselect: true });
      return;
    }
    setSlot(value);
    trackOption('reminders', REMINDER_TOKEN[value], { multi: false, deselect: false });
  }

  async function skip() {
    if (lock.current) return;
    lock.current = true;
    setWorking(true);
    if (slot) trackOption('reminders', REMINDER_TOKEN[slot], { deselect: true });
    trackDecision('reminder', 'skipped');
    setLocalAnswer('reminder_time', null);
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      try {
        const wasOn = (await AsyncStorage.getItem(STORAGE_NOTIF)) === 'true';
        await cancelWorkoutReminders();
        if (wasOn) dailyReminderDisabled();
      } catch {
        // A failed cancel still leaves the step. The choice is already stored.
      }
    }
    try {
      await AsyncStorage.setItem(STORAGE_NOTIF, 'false');
    } catch {
      // The in-memory skip is what the flow reads.
    }
    goNext();
  }

  async function confirm() {
    if (!slot || lock.current) return;
    lock.current = true;
    setWorking(true);
    const chosen = slot;
    const clock = CLOCK[chosen];
    setLocalAnswer('reminder_time', chosen);

    const perWeek = answers.sessions_per_week_preference;
    const count = typeof perWeek === 'number' && perWeek >= 1 && perWeek <= 7 ? perWeek : 4;
    const days = computeDefaultWorkoutDays(count);

    try {
      await AsyncStorage.multiSet([
        [STORAGE_WORKOUT_DAYS, JSON.stringify(days)],
        [STORAGE_WORKOUT_DAYS_SINCE, localDateKey(new Date())],
        [STORAGE_NOTIF_TIME, JSON.stringify({ hour: clock.hour, minute: clock.minute })],
      ]);
    } catch {
      // Scheduling below still uses the in-memory days and clock.
    }

    let granted = false;
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      try {
        // Local reminders do not need an account. The id is only for a best-effort
        // push-token write, which no-ops when this person is still anonymous.
        granted = await requestPermissions(user?.id ?? '', 'workout_reminder');
      } catch {
        granted = false;
      }
      if (granted) {
        try {
          await scheduleWorkoutReminders(days, clock.hour, clock.minute);
        } catch {
          granted = false;
        }
      }
    }

    try {
      await AsyncStorage.setItem(STORAGE_NOTIF, granted ? 'true' : 'false');
    } catch {
      // Profile reads this flag later. The OS schedule is already attempted.
    }

    if (granted) {
      try {
        dailyReminderEnabled({
          hour: clock.hour,
          minute: clock.minute,
          purpose: 'workout_reminder',
        });
      } catch {
        // Analytics must not block the step.
      }
    }

    goNext();
  }

  if (phase === 'primer') {
    return (
      <ObScreen
        testID="reminders"
        chapter={chapter}
        progress={progress}
        contentStyle={styles.primer}
        footer={
          <ObFooter>
            <PrimaryButton testID="set-up-reminders" label={COPY.setup} onPress={openWhen} disabled={working} />
            <TextLink label={COPY.skip} onPress={() => void skip()} />
          </ObFooter>
        }
      >
        <TypedBubble line={COPY.bubble} />
        <View
          style={styles.hero}
          onLayout={(event) => {
            const next = Math.round(event.nativeEvent.layout.width);
            setBandWidth((current) => (current === next ? current : next));
          }}
        >
          {bandWidth > 0 ? (
            <SoftHills width={bandWidth} height={HERO + HILL_FADE} ground={HERO} />
          ) : null}
          <View pointerEvents="box-none" style={styles.petSeat}>
            {stage === 1 ? (
              <RingingBell size={PET} label={petLabel} />
            ) : (
              <Pet stage={stage} mood="bell" size={PET} accessibilityLabel={petLabel} />
            )}
          </View>
        </View>
        <ReminderStack title={sample.title} body={sample.body} />
      </ObScreen>
    );
  }

  const rows = {
    morning: { label: COPY.morning, sub: COPY.morningSub, image: OPTION_SCENES.fresh },
    midday: { label: COPY.midday, sub: COPY.middaySub, image: OPTION_SCENES.walk },
    evening: { label: COPY.evening, sub: COPY.eveningSub, image: OPTION_SCENES.sleep },
  };

  return (
    <ObScreen
      testID="reminders"
      chapter={chapter}
      progress={progress}
      contentStyle={obCenterContent}
      onBack={() => {
        userEdited.current = true;
        setPhase('primer');
      }}
      footer={
        <ObFooter>
          <PrimaryButton
            testID="continue"
            label="Continue"
            disabled={slot === null || working}
            loading={working}
            onPress={() => void confirm()}
          />
        </ObFooter>
      }
    >
      <AskHeader line={slot ? REMINDER_LINE[slot] : COPY.ask} mood={slot ? 'ready' : 'bell'} />
      <View style={styles.options}>
        <OptionList>
          {SLOTS.map((value) => (
            <OptionRow
              key={value}
              testID={`opt-${value}`}
              label={rows[value].label}
              sub={rows[value].sub}
              image={rows[value].image}
              mode="single"
              selected={slot === value}
              onPress={() => chooseSlot(value)}
            />
          ))}
        </OptionList>
      </View>
      <View style={styles.note}>
        <NoteCard tone="neutral" text={COPY.note} />
      </View>
    </ObScreen>
  );
}

const styles = StyleSheet.create({
  primer: {
    paddingTop: 8,
  },
  bubble: {
    justifyContent: 'center',
    backgroundColor: ob.color.surface,
    borderWidth: 1.5,
    borderColor: ob.color.ink,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  bubbleText: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: Platform.OS === 'ios' ? '800' : '700',
    letterSpacing: -0.4,
    color: ob.color.ink,
  },
  bubbleRest: {
    color: 'transparent',
  },
  hero: {
    height: HERO + HILL_FADE,
    marginTop: 4,
    marginHorizontal: -ob.space.screen,
  },
  petSeat: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: HERO,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  stack: {
    marginTop: -(HILL_FADE - 28),
    paddingBottom: 18,
  },
  ghost: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    ...shadows.low,
  },
  ghostNear: {
    top: 8,
    right: 10,
    bottom: 8,
    left: 10,
  },
  ghostFar: {
    top: 16,
    right: 22,
    bottom: 0,
    left: 22,
  },
  ground: {
    position: 'absolute',
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
  options: {
    marginTop: ob.space.lg,
  },
  note: {
    marginTop: ob.space.md,
  },
});
