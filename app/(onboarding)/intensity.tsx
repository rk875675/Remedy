import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { PetMood } from '../../constants/petImages';
import {
  AskHeader,
  ObFooter,
  ObScreen,
  PrimaryButton,
  ob,
  obType,
  toneColors,
  type ObTone,
} from '../../components/onboarding/kit';
import { Pet } from '../../components/pet/Pet';
import { useOnboarding } from '../../context/OnboardingContext';
import { hapticSelection } from '../../lib/haptics';
import { useObStep } from '../../lib/onboardingFlow';
import { useOnboardingPet } from '../../lib/useOnboardingPet';
import { useReduceMotion } from '../../lib/useReduceMotion';

const COPY = {
  ask: 'How strong on a normal day?',
  none: 'None',
  mild: 'Mild',
  moderate: 'Moderate',
  strong: 'Strong',
  severe: 'Severe',
  continue: 'Continue',
} as const;

const MARKS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** Math degrees. 90 is the top of the clock. The scale runs over the top. */
const START = 230;
const SWEEP = 280;
const STEP = SWEEP / 10;
/** A tap tips him this far per number, and never more than a short roll. */
const ROLL_PER_STEP = 48;
const ROLL_CAP = 140;
const TRACK = '#D4C4B0';

const BANDS: readonly { word: string; values: readonly number[] }[] = [
  { word: COPY.none, values: [0] },
  { word: COPY.mild, values: [1, 2, 3] },
  { word: COPY.moderate, values: [4, 5, 6] },
  { word: COPY.strong, values: [7, 8] },
  { word: COPY.severe, values: [9, 10] },
];

type MoveKind = 'tap' | 'drag' | 'place' | 'none';

type Geo = {
  c: number;
  size: number;
  labelR: number;
  trackR: number;
  pet: number;
};

function wordFor(value: number): string {
  return BANDS.find((band) => band.values.includes(value))?.word ?? COPY.severe;
}

function toneFor(value: number): ObTone {
  if (value <= 3) return 'accent';
  if (value <= 6) return 'warn';
  return 'clay';
}

function moodFor(value: number): PetMood {
  if (value <= 3) return 'ready';
  if (value <= 6) return 'concerned';
  return 'stiff';
}

function solidFill(value: number): string {
  const tone = toneColors(toneFor(value));
  return value <= 3 || value >= 7 ? tone.border : tone.fg;
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy - r * Math.sin(rad),
  };
}

/** Sweep 1 is clockwise on screen, so a decreasing angle rides over the top. */
function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p0 = polar(cx, cy, r, a0);
  const p1 = polar(cx, cy, r, a1);
  const large = Math.abs(a0 - a1) > 180 ? 1 : 0;
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

function thetaFor(n: number): number {
  return START - n * STEP;
}

function spinFor(n: number): number {
  return n * STEP - 140;
}

function normDeg(deg: number): number {
  const wrapped = deg % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/** 0 at mark 0, 280 at mark 10, then the open gap along the bottom. */
function travelFromTheta(thetaDeg: number): number {
  let delta = START - normDeg(thetaDeg);
  if (delta < 0) delta += 360;
  return delta;
}

function clampedTravel(raw: number): number {
  if (raw <= SWEEP) return raw;
  const gapMid = (SWEEP + 360) / 2;
  return raw < gapMid ? SWEEP : 0;
}

function nearestMark(raw: number): number {
  const steps = Math.round(clampedTravel(raw) / STEP);
  return Math.min(10, Math.max(0, steps));
}

function Clock({
  size,
  value,
  onChoose,
}: {
  size: number;
  value: number | null;
  onChoose: (n: number) => void;
}) {
  const reduce = useReduceMotion();
  const { stage } = useOnboardingPet();
  const reduceRef = useRef(reduce);
  reduceRef.current = reduce;
  const dragging = useRef(false);
  const moved = useRef(false);
  const suppressPress = useRef(false);
  const seen = useRef(value !== null);
  const intent = useRef<MoveKind>('none');
  const pending = useRef<number | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChooseRef = useRef(onChoose);
  onChooseRef.current = onChoose;
  const spinNow = useRef(value === null ? 0 : spinFor(value));
  const spin = useRef(new Animated.Value(spinNow.current)).current;
  const tumble = useRef(new Animated.Value(0)).current;
  const shown = useRef(new Animated.Value(value === null ? 0 : 1)).current;
  const motion = useRef<Animated.CompositeAnimation | null>(null);
  const hostRef = useRef<View>(null);
  const origin = useRef({ x: 0, y: 0, ready: false });

  const pet = Math.round(Math.min(72, Math.max(48, size * 0.18)));
  const labelR = size / 2 - pet / 2 - 10;
  const stroke = size > 340 ? 16 : 13;
  const trackR = labelR - stroke / 2 - 14;
  const c = size / 2;
  const geo = useRef<Geo>({ c, size, labelR, trackR, pet });
  geo.current = { c, size, labelR, trackR, pet };

  function stopMotion() {
    motion.current?.stop();
    motion.current = null;
  }

  function park(n: number) {
    stopMotion();
    const to = spinFor(n);
    spinNow.current = to;
    spin.setValue(to);
    tumble.setValue(0);
    seen.current = true;
  }

  /** A short tip in the direction of travel, then he lands upright. */
  function rollAlong(n: number) {
    stopMotion();
    const to = spinFor(n);
    const delta = to - spinNow.current;
    if (reduceRef.current !== false || !seen.current || Math.abs(delta) < 1) {
      park(n);
      return;
    }
    seen.current = true;
    spinNow.current = to;
    const steps = delta / STEP;
    const tip = Math.max(-ROLL_CAP, Math.min(ROLL_CAP, steps * ROLL_PER_STEP));
    const ms = Math.min(640, Math.max(260, Math.abs(steps) * 120));
    const ease = Easing.out(Easing.cubic);
    const play = Animated.sequence([
      Animated.parallel([
        Animated.timing(spin, { toValue: to, duration: ms, easing: ease, useNativeDriver: true }),
        Animated.timing(tumble, { toValue: tip, duration: ms, easing: ease, useNativeDriver: true }),
      ]),
      Animated.spring(tumble, {
        toValue: 0,
        tension: 140,
        friction: 9,
        useNativeDriver: true,
      }),
    ]);
    motion.current = play;
    play.start(() => {
      if (motion.current === play) motion.current = null;
    });
  }

  function follow(raw: number) {
    stopMotion();
    const at = clampedTravel(raw) - 140;
    spinNow.current = at;
    spin.setValue(at);
  }

  function settle(n: number) {
    stopMotion();
    const to = spinFor(n);
    spinNow.current = to;
    seen.current = true;
    if (reduceRef.current !== false) {
      spin.setValue(to);
      tumble.setValue(0);
      return;
    }
    const play = Animated.parallel([
      Animated.spring(spin, {
        toValue: to,
        tension: 90,
        friction: 10,
        useNativeDriver: true,
      }),
      Animated.spring(tumble, {
        toValue: 0,
        tension: 120,
        friction: 9,
        useNativeDriver: true,
      }),
    ]);
    motion.current = play;
    play.start(() => {
      if (motion.current === play) motion.current = null;
    });
  }

  function rememberOrigin() {
    hostRef.current?.measureInWindow((x, y, w, h) => {
      if (w <= 0 || h <= 0) return;
      origin.current = { x, y, ready: true };
    });
  }

  function localPoint(pageX: number, pageY: number, locationX: number, locationY: number) {
    const o = origin.current;
    if (!o.ready) return { x: locationX, y: locationY };
    return { x: pageX - o.x, y: pageY - o.y };
  }

  function rawAt(x: number, y: number): number | null {
    const g = geo.current;
    const dx = x - g.c;
    const dy = y - g.c;
    if (dx * dx + dy * dy < (g.size * 0.16) ** 2) return null;
    const theta = Math.atan2(-dy, dx) * (180 / Math.PI);
    return travelFromTheta(theta);
  }

  const chooseMark = useRef<(n: number, why: MoveKind) => void>(() => {});
  chooseMark.current = (n, why) => {
    if (valueRef.current === n) return;
    intent.current = why;
    onChooseRef.current(n);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: (_, gesture) => {
        if (Math.hypot(gesture.dx, gesture.dy) <= 8) return false;
        suppressPress.current = true;
        moved.current = true;
        return true;
      },
      onPanResponderTerminationRequest: () => true,
      onPanResponderGrant: (event, gesture) => {
        dragging.current = true;
        suppressPress.current = true;
        moved.current = Math.hypot(gesture.dx, gesture.dy) > 8;
        const at = localPoint(gesture.x0, gesture.y0, event.nativeEvent.locationX, event.nativeEvent.locationY);
        const raw = rawAt(at.x, at.y);
        pending.current = raw === null ? null : nearestMark(raw);
      },
      onPanResponderMove: (event, gesture) => {
        moved.current = true;
        const at = localPoint(
          gesture.moveX,
          gesture.moveY,
          event.nativeEvent.locationX,
          event.nativeEvent.locationY,
        );
        const raw = rawAt(at.x, at.y);
        if (raw === null) return;
        follow(raw);
        const next = nearestMark(raw);
        const why: MoveKind = valueRef.current === null ? 'place' : 'drag';
        chooseMark.current(next, why);
      },
      onPanResponderRelease: () => {
        dragging.current = false;
        const mark = pending.current;
        const wasDrag = moved.current;
        pending.current = null;
        moved.current = false;
        if (mark !== null && (!wasDrag || valueRef.current === null)) {
          chooseMark.current(mark, 'tap');
        } else if (valueRef.current !== null) {
          settle(valueRef.current);
        }
        requestAnimationFrame(() => {
          suppressPress.current = false;
        });
      },
      onPanResponderTerminate: () => {
        dragging.current = false;
        pending.current = null;
        if (valueRef.current !== null) settle(valueRef.current);
        requestAnimationFrame(() => {
          suppressPress.current = false;
        });
      },
    }),
  ).current;

  useEffect(() => {
    if (value === null) return;
    const why = intent.current;
    intent.current = 'none';
    if (why === 'drag' || why === 'place') return;
    if (why === 'tap') {
      rollAlong(value);
      return;
    }
    park(value);
    // Motion helpers close over the animated nodes. value is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const placed = value !== null;

  useEffect(() => {
    const to = placed ? 1 : 0;
    if (reduceRef.current !== false) {
      shown.setValue(to);
      return;
    }
    const fade = Animated.timing(shown, {
      toValue: to,
      duration: ob.motion.base,
      useNativeDriver: true,
    });
    fade.start();
    return () => fade.stop();
  }, [placed, shown]);

  const turn = spin.interpolate({
    inputRange: [-180, 180],
    outputRange: ['-180deg', '180deg'],
    extrapolate: 'extend',
  });
  const upright = spin.interpolate({
    inputRange: [-180, 180],
    outputRange: ['180deg', '-180deg'],
    extrapolate: 'extend',
  });
  const roll = tumble.interpolate({
    inputRange: [-180, 180],
    outputRange: ['-180deg', '180deg'],
    extrapolate: 'extend',
  });

  if (size <= 0 || labelR < 28 || trackR < 16) return null;

  const hit = Math.round(Math.max(48, Math.min(72, labelR * ((STEP * Math.PI) / 180))));
  const track = arcPath(c, c, trackR, thetaFor(0), thetaFor(10));
  const progress = value !== null && value > 0 ? arcPath(c, c, trackR, thetaFor(0), thetaFor(value)) : null;
  const progressColor = value === null ? ob.color.accent : solidFill(value);
  const lit = value === null ? ob.color.ink : progressColor;

  return (
    <View
      ref={hostRef}
      testID="intensity-scale"
      collapsable={false}
      onLayout={rememberOrigin}
      accessibilityRole="adjustable"
      accessibilityLabel="Pain on a normal day"
      accessibilityValue={{
        min: 0,
        max: 10,
        now: value ?? 0,
        text: value === null ? 'Not chosen' : `${value}, ${wordFor(value)}`,
      }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        intent.current = 'tap';
        if (value === null) {
          onChoose(0);
          return;
        }
        if (event.nativeEvent.actionName === 'increment') onChoose(Math.min(10, value + 1));
        if (event.nativeEvent.actionName === 'decrement') onChoose(Math.max(0, value - 1));
      }}
      style={{ width: size, height: size }}
      {...pan.panHandlers}
    >
      <Svg width={size} height={size} pointerEvents="none" accessible={false}>
        <Path d={track} stroke={TRACK} strokeWidth={stroke} strokeLinecap="round" fill="none" />
        {progress ? (
          <Path
            d={progress}
            stroke={progressColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
          />
        ) : null}
      </Svg>
      {MARKS.map((n) => {
        const at = polar(c, c, labelR, thetaFor(n));
        const on = value === n;
        const passed = value !== null && n < value;
        return (
          <Pressable
            key={n}
            testID={`intensity-${n}`}
            accessibilityRole="radio"
            accessibilityLabel={`${n}, ${wordFor(n)}`}
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (suppressPress.current || dragging.current) return;
              intent.current = 'tap';
              onChoose(n);
            }}
            style={[
              styles.mark,
              {
                left: at.x - hit / 2,
                top: at.y - hit / 2,
                width: hit,
                height: hit,
                opacity: on ? 0 : 1,
              },
            ]}
          >
            <Text style={[styles.markText, { color: passed ? lit : ob.color.ink }]}>{n}</Text>
          </Pressable>
        );
      })}
      <CenterFace value={value} size={size} />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.token,
          {
            width: pet,
            height: pet,
            left: c - pet / 2,
            top: c - pet / 2,
            opacity: shown,
            transform: [{ rotate: turn }, { translateY: -labelR }, { rotate: upright }, { rotate: roll }],
          },
        ]}
      >
        <Pet stage={stage} mood={value === null ? 'concerned' : moodFor(value)} size={pet} shadow />
      </Animated.View>
    </View>
  );
}

function CenterFace({ value, size }: { value: number | null; size: number }) {
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (value === null || reduce !== false) return;
    scale.setValue(0.92);
    const spring = Animated.spring(scale, {
      toValue: 1,
      tension: 170,
      friction: 9,
      useNativeDriver: true,
    });
    spring.start();
    return () => spring.stop();
  }, [reduce, scale, value]);

  if (value === null) return null;
  const color = solidFill(value);
  const numSize = Math.round(Math.min(68, size * 0.16));
  const wordSize = Math.round(Math.min(18, Math.max(15, size * 0.046)));

  return (
    <Animated.View pointerEvents="none" style={[styles.face, { transform: [{ scale }] }]}>
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={[styles.num, { fontSize: numSize, lineHeight: numSize + 2, color }]}
      >
        {value}
      </Text>
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no"
        numberOfLines={1}
        style={[styles.word, { fontSize: wordSize, lineHeight: wordSize + 4, color }]}
      >
        {wordFor(value)}
      </Text>
    </Animated.View>
  );
}

export default function IntensityScreen() {
  const { chapter, progress, goNext } = useObStep('intensity');
  const { intake, setIntake } = useOnboarding();
  const stored = typeof intake.intensity === 'number' ? intake.intensity : null;
  const [value, setValue] = useState<number | null>(stored);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const valueRef = useRef<number | null>(stored);
  const lock = useRef(false);
  const unlock = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (unlock.current !== null) clearTimeout(unlock.current);
    };
  }, []);

  useEffect(() => {
    if (valueRef.current !== null) return;
    if (typeof intake.intensity !== 'number') return;
    valueRef.current = intake.intensity;
    setValue(intake.intensity);
  }, [intake.intensity]);

  function choose(next: number) {
    if (valueRef.current === next) return;
    hapticSelection();
    valueRef.current = next;
    setValue(next);
    setIntake('intensity', next);
  }

  function handleContinue() {
    const chosen = valueRef.current;
    if (chosen === null || lock.current) return;
    lock.current = true;
    setIntake('intensity', chosen);
    goNext();
    if (unlock.current !== null) clearTimeout(unlock.current);
    unlock.current = setTimeout(() => {
      lock.current = false;
      unlock.current = null;
    }, 600);
  }

  function onStageLayout(event: LayoutChangeEvent) {
    const next = {
      w: Math.round(event.nativeEvent.layout.width),
      h: Math.round(event.nativeEvent.layout.height),
    };
    setBox((prev) => (prev.w === next.w && prev.h === next.h ? prev : next));
  }

  const dial = Math.max(0, Math.min(box.w, box.h) - 8);

  return (
    <ObScreen
      testID="intensity"
      chapter={chapter}
      progress={progress}
      scroll={false}
      contentStyle={styles.screen}
      footer={
        <ObFooter>
          <PrimaryButton
            testID="continue"
            label={COPY.continue}
            disabled={value === null}
            onPress={handleContinue}
          />
        </ObFooter>
      }
    >
      <AskHeader line={COPY.ask} mood={value === null ? 'concerned' : moodFor(value)} />
      <View style={styles.stage} onLayout={onStageLayout} pointerEvents="box-none">
        <Clock size={dial} value={value} onChoose={choose} />
      </View>
    </ObScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: -ob.space.screen,
    overflow: 'hidden',
  },
  token: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
    color: ob.color.ink,
    fontVariant: ['tabular-nums'],
  },
  face: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  num: {
    ...obType.display,
    textAlign: 'center',
  },
  word: {
    fontWeight: '600',
    letterSpacing: 0.2,
    textAlign: 'center',
    marginTop: 2,
  },
});
