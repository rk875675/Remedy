import { Animated, Easing } from 'react-native';
import { call } from '../../pet/petMotion';
import type { DustPoint } from '../../pet/Dust';

/**
 * How each chapter opener arrives. The four screens used to share one roll.
 * Each act is a different move, built from the same crouch / stretch / land
 * vocabulary as the rest of the pet:
 *   1 Goals — two connected bounds in from the left, then the notepad.
 *   2 Back — leans in from the right, steps back into a crouch, then hops to the mark.
 *   3 Pattern — a fall from above, a heavy landing, a rebound, a rock.
 *   4 Plan — grows up off its feet, and the landing carries the lean to the other side.
 */
export type ChapterAct = 1 | 2 | 3 | 4;
export type BubbleFeel = 'eager' | 'careful' | 'crisp' | 'idea';
export type IdleKind = 'bob' | 'sway' | 'nod' | 'ponder';

export type EntranceRig = {
  shiftX: Animated.Value;
  shiftY: Animated.Value;
  /** Degrees. Kept inside -90..90. */
  spin: Animated.Value;
  /** -1 stretched tall, 0 at rest, +1 squashed. */
  squash: Animated.Value;
  /** Uniform size. 1 is full. The view pins the feet while this changes. */
  grow: Animated.Value;
  opacity: Animated.Value;
};

export type EntranceMetrics = {
  /** How far off the left the first hop starts. */
  travel: number;
  /** How far right the peek starts, with the face still on screen. */
  peek: number;
  /** How far above the landing the drop starts. */
  drop: number;
  petSize: number;
};

const out = Easing.out(Easing.cubic);
const rise = Easing.out(Easing.quad);
const fall = Easing.in(Easing.quad);
const smooth = Easing.inOut(Easing.sin);

function timing(
  value: Animated.Value,
  toValue: number,
  duration: number,
  easing: (t: number) => number = rise,
): Animated.CompositeAnimation {
  return Animated.timing(value, { toValue, duration, easing, useNativeDriver: true });
}

export function createEntranceRig(): EntranceRig {
  return {
    shiftX: new Animated.Value(0),
    shiftY: new Animated.Value(0),
    spin: new Animated.Value(0),
    squash: new Animated.Value(0),
    grow: new Animated.Value(1),
    opacity: new Animated.Value(1),
  };
}

export function restEntrance(rig: EntranceRig): void {
  rig.shiftX.setValue(0);
  rig.shiftY.setValue(0);
  rig.spin.setValue(0);
  rig.squash.setValue(0);
  rig.grow.setValue(1);
  rig.opacity.setValue(1);
}

/** First frame of the act, before it plays. Reduce Motion uses `restEntrance`. */
export function primeEntrance(rig: EntranceRig, chapter: ChapterAct, metrics: EntranceMetrics): void {
  restEntrance(rig);
  if (chapter === 1) {
    rig.shiftX.setValue(-metrics.travel);
    return;
  }
  if (chapter === 2) {
    rig.shiftX.setValue(metrics.peek);
    rig.spin.setValue(12);
    return;
  }
  if (chapter === 3) {
    rig.shiftY.setValue(-metrics.drop);
    rig.squash.setValue(-0.55);
    rig.spin.setValue(-16);
    return;
  }
  rig.opacity.setValue(0);
  rig.grow.setValue(0.62);
  rig.shiftY.setValue(18);
  rig.squash.setValue(0.28);
}

export function entranceFeel(chapter: ChapterAct): { bubble: BubbleFeel; idle: IdleKind } {
  if (chapter === 1) return { bubble: 'eager', idle: 'bob' };
  if (chapter === 2) return { bubble: 'careful', idle: 'sway' };
  if (chapter === 3) return { bubble: 'crisp', idle: 'nod' };
  return { bubble: 'idea', idle: 'ponder' };
}

type Hooks = {
  onPose: () => void;
  onDust: (points: DustPoint[]) => void;
};

function puff(hooks: Hooks, points: DustPoint[]): Animated.CompositeAnimation {
  return call(() => hooks.onDust(points));
}

/** One rebound, then the line. Loose rest thresholds so the spring does not hold the sequence. */
function settle(value: Animated.Value): Animated.CompositeAnimation {
  return Animated.spring(value, {
    toValue: 0,
    speed: 24,
    bounciness: 4,
    restDisplacementThreshold: 0.02,
    restSpeedThreshold: 0.02,
    useNativeDriver: true,
  });
}

/**
 * One bound from `from` to `to`. Horizontal travel happens in the air and
 * eases into the plant, so the feet are still when they hit.
 * `windup` crouches first. Without it, the previous plant is the crouch.
 */
function stride(
  rig: EntranceRig,
  from: number,
  to: number,
  lift: number,
  power: number,
  windup: boolean,
  hooks: Hooks,
  dust: DustPoint[],
): Animated.CompositeAnimation {
  const air = Math.round(102 * (0.82 + power * 0.22));
  const down = Math.round(94 * (0.86 + power * 0.16));
  const carry = from + (to - from) * 0.64;
  const lean = 7 * power;
  const stretch = Math.round(air * 0.62);
  const flight = Animated.parallel([
    Animated.sequence([
      timing(rig.shiftX, carry, air, rise),
      timing(rig.shiftX, to, down, Easing.out(Easing.quad)),
    ]),
    Animated.sequence([timing(rig.shiftY, -lift, air, rise), timing(rig.shiftY, 0, down, fall)]),
    Animated.sequence([
      timing(rig.squash, -0.5 * power, stretch, rise),
      timing(rig.squash, -0.14 * power, air - stretch, smooth),
      timing(rig.squash, 0.2, down, fall),
    ]),
    Animated.sequence([timing(rig.spin, lean, air, rise), timing(rig.spin, lean * 0.15, down, fall)]),
  ]);
  const plant = Animated.sequence([
    timing(rig.squash, Math.min(0.78, 0.5 * power + 0.16), 26),
    puff(hooks, dust),
  ]);
  if (!windup) return Animated.sequence([flight, plant]);
  return Animated.sequence([
    Animated.parallel([
      timing(rig.squash, 0.46 * power, 46, smooth),
      timing(rig.spin, -lean * 0.5, 46, smooth),
    ]),
    flight,
    plant,
  ]);
}

/**
 * 1. A long bound, then a lower one onto the mark.
 * The first plant is the second crouch: no spring and no pause between them.
 */
function goalsEntrance(rig: EntranceRig, metrics: EntranceMetrics, hooks: Hooks): Animated.CompositeAnimation {
  const { travel, petSize } = metrics;
  const mid = -travel * 0.36;
  return Animated.sequence([
    stride(rig, -travel, mid, petSize * 0.16, 1, true, hooks, [{ x: petSize * 0.48, delay: 0, size: 8 }]),
    stride(rig, mid, 0, petSize * 0.075, 0.74, false, hooks, [
      { x: petSize * 0.4, delay: 0, size: 8 },
      { x: petSize * 0.58, delay: 24, size: 11 },
    ]),
    call(hooks.onPose),
    Animated.parallel([settle(rig.squash), timing(rig.spin, 0, 80, smooth)]),
  ]);
}

/**
 * 2. Lean in on its toes, step back down into a crouch, hop to the mark from that crouch.
 * The hop travels in the air and sticks the landing.
 */
function backEntrance(rig: EntranceRig, metrics: EntranceMetrics, hooks: Hooks): Animated.CompositeAnimation {
  const { peek, petSize } = metrics;
  const leaned = peek * 0.28;
  const backed = peek * 0.64;
  const lift = Math.round(petSize * 0.09);
  const air = 112;
  const down = 122;
  const stretch = Math.round(air * 0.62);

  return Animated.sequence([
    Animated.parallel([
      timing(rig.shiftX, leaned, 155, out),
      timing(rig.spin, 4, 155, smooth),
      timing(rig.squash, -0.22, 155, smooth),
      timing(rig.shiftY, -Math.round(petSize * 0.04), 155, rise),
    ]),
    Animated.parallel([
      timing(rig.shiftX, backed, 120, Easing.inOut(Easing.cubic)),
      timing(rig.spin, 14, 120, smooth),
      timing(rig.squash, 0.46, 120, fall),
      timing(rig.shiftY, 0, 120, fall),
    ]),
    Animated.parallel([
      Animated.sequence([
        timing(rig.shiftX, backed * 0.34, air, rise),
        timing(rig.shiftX, 0, down, Easing.out(Easing.quad)),
      ]),
      Animated.sequence([timing(rig.shiftY, -lift, air, rise), timing(rig.shiftY, 0, down, fall)]),
      Animated.sequence([
        timing(rig.squash, -0.42, stretch, rise),
        timing(rig.squash, -0.12, air - stretch, smooth),
        timing(rig.squash, 0.18, down, fall),
      ]),
      Animated.sequence([timing(rig.spin, -4, air, smooth), timing(rig.spin, 0, down, fall)]),
    ]),
    timing(rig.squash, 0.64, 26),
    puff(hooks, [
      { x: petSize * 0.4, delay: 0, size: 8 },
      { x: petSize * 0.58, delay: 28, size: 10 },
    ]),
    call(hooks.onPose),
    settle(rig.squash),
  ]);
}

/** 3. Fall in stretched, hit, bounce once, rock to a stop, then the clipboard. */
function patternEntrance(rig: EntranceRig, metrics: EntranceMetrics, hooks: Hooks): Animated.CompositeAnimation {
  const { petSize } = metrics;
  return Animated.sequence([
    Animated.parallel([
      timing(rig.shiftY, 0, 520, Easing.in(Easing.cubic)),
      timing(rig.spin, 10, 520, Easing.linear),
    ]),
    Animated.parallel([timing(rig.squash, 0.9, 60), timing(rig.spin, 0, 60, out)]),
    puff(hooks, [
      { x: petSize * 0.28, delay: 0, size: 8 },
      { x: petSize * 0.42, delay: 30, size: 12 },
      { x: petSize * 0.56, delay: 20, size: 14 },
      { x: petSize * 0.7, delay: 50, size: 9 },
      { x: petSize * 0.48, delay: 210, size: 8 },
    ]),
    Animated.parallel([
      Animated.sequence([
        timing(rig.shiftY, -petSize * 0.045, 100),
        timing(rig.shiftY, 0, 120, fall),
      ]),
      Animated.sequence([timing(rig.squash, -0.25, 100), timing(rig.squash, 0.45, 120, fall)]),
    ]),
    timing(rig.squash, 0, 90, out),
    timing(rig.spin, -8, 140, smooth),
    timing(rig.spin, 6, 160, smooth),
    timing(rig.spin, -3, 130, smooth),
    timing(rig.spin, 0, 120, smooth),
    call(hooks.onPose),
    Animated.delay(380),
  ]);
}

/**
 * 4. Appear, grow up off the feet while leaning one way, and land into the other.
 * Coming home is the settle. No held poses between the sides.
 */
function planEntrance(rig: EntranceRig, metrics: EntranceMetrics, hooks: Hooks): Animated.CompositeAnimation {
  const { petSize } = metrics;
  const riseT = 280;
  const landT = 170;

  return Animated.sequence([
    Animated.parallel([timing(rig.opacity, 1, 70, out), timing(rig.squash, 0.36, 70, smooth)]),
    Animated.parallel([
      timing(rig.grow, 1, riseT, out),
      timing(rig.shiftY, -Math.round(petSize * 0.045), riseT, out),
      timing(rig.squash, -0.36, riseT, smooth),
      timing(rig.spin, -8, riseT, smooth),
    ]),
    Animated.parallel([
      timing(rig.shiftY, 0, landT, fall),
      timing(rig.squash, 0.58, landT, fall),
      timing(rig.spin, 7, landT, smooth),
    ]),
    puff(hooks, [
      { x: petSize * 0.4, delay: 0, size: 7 },
      { x: petSize * 0.58, delay: 28, size: 9 },
    ]),
    call(hooks.onPose),
    Animated.parallel([settle(rig.squash), timing(rig.spin, 0, 150, smooth)]),
  ]);
}

export function buildChapterEntrance(
  chapter: ChapterAct,
  rig: EntranceRig,
  metrics: EntranceMetrics,
  hooks: Hooks,
): Animated.CompositeAnimation {
  if (chapter === 1) return goalsEntrance(rig, metrics, hooks);
  if (chapter === 2) return backEntrance(rig, metrics, hooks);
  if (chapter === 3) return patternEntrance(rig, metrics, hooks);
  return planEntrance(rig, metrics, hooks);
}
