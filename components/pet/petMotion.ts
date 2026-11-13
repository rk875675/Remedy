import { Animated, Easing } from 'react-native';

/**
 * The pet's movement vocabulary. Every pet animation in the app is built from
 * these, so the armadillo moves like one character everywhere: it crouches
 * before it jumps, stretches in the air, squashes when it lands and settles
 * with a little spring, instead of sliding and scaling like a picture.
 *
 * A "body" is five values, all run on the native driver:
 *   squash  -1 stretched tall and thin … 0 at rest … +1 squashed short and wide
 *   lift     0 on the ground … 1 one hop height up (a big jump goes past 1)
 *   tilt    -1 leaning left … +1 leaning right
 *   spin     0 … 1 is one full turn
 *   shake   -1 … +1 a sideways shudder
 *
 * Put the body on two nested Animated.Views: the outer one takes
 * `styles.mover` (lift, shake, spin, tilt), the inner one takes
 * `styles.squash` (squash and stretch with the feet kept on the ground).
 * The moves below return animations that always leave the body at rest.
 * Only one move should run on a body at a time: stop the last one and call
 * `restBody` before starting another.
 */
export type PetBody = {
  squash: Animated.Value;
  lift: Animated.Value;
  tilt: Animated.Value;
  spin: Animated.Value;
  shake: Animated.Value;
};

export function createPetBody(): PetBody {
  return {
    squash: new Animated.Value(0),
    lift: new Animated.Value(0),
    tilt: new Animated.Value(0),
    spin: new Animated.Value(0),
    shake: new Animated.Value(0),
  };
}

export type PetBodyOptions = {
  /** Height of the box being squashed, so the feet stay on the ground. */
  height: number;
  /** How far `lift: 1` raises the pet, in points. */
  hop: number;
  /** How much of the height a full squash takes off. */
  squashAmount?: number;
  tiltDegrees?: number;
  shakePoints?: number;
};

/** Build once (useMemo): new interpolations made mid-animation are not native-driven. */
export function petBodyStyles(body: PetBody, options: PetBodyOptions) {
  const { height, hop, squashAmount = 0.2, tiltDegrees = 8, shakePoints = 5 } = options;
  return {
    mover: {
      transform: [
        { translateX: body.shake.interpolate({ inputRange: [-1, 1], outputRange: [-shakePoints, shakePoints] }) },
        { translateY: body.lift.interpolate({ inputRange: [0, 1], outputRange: [0, -hop] }) },
        { rotate: body.spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
        {
          rotate: body.tilt.interpolate({
            inputRange: [-1, 1],
            outputRange: [`-${tiltDegrees}deg`, `${tiltDegrees}deg`],
          }),
        },
      ],
    },
    squash: {
      transform: [
        // Scaling happens about the centre; this shift puts the feet back on the ground.
        {
          translateY: body.squash.interpolate({
            inputRange: [-1, 1],
            outputRange: [(-height * squashAmount) / 2, (height * squashAmount) / 2],
          }),
        },
        {
          scaleX: body.squash.interpolate({
            inputRange: [-1, 1],
            outputRange: [1 - squashAmount * 0.8, 1 + squashAmount * 0.8],
          }),
        },
        {
          scaleY: body.squash.interpolate({
            inputRange: [-1, 1],
            outputRange: [1 + squashAmount, 1 - squashAmount],
          }),
        },
      ],
    },
    /** For a ground shadow: shrinks and fades as the pet leaves the ground. */
    shadow: {
      opacity: body.lift.interpolate({ inputRange: [0, 1.6], outputRange: [1, 0.45], extrapolate: 'clamp' }),
      transform: [
        { scaleX: body.lift.interpolate({ inputRange: [0, 1.6], outputRange: [1, 0.6], extrapolate: 'clamp' }) },
      ],
    },
  };
}

/** Stop-proof reset: call after stopping a move, before starting the next. */
export function restBody(body: PetBody): void {
  body.squash.setValue(0);
  body.lift.setValue(0);
  body.tilt.setValue(0);
  body.spin.setValue(0);
  body.shake.setValue(0);
}

const rise = Easing.out(Easing.quad);
const fall = Easing.in(Easing.quad);
const smooth = Easing.inOut(Easing.sin);

function to(
  value: Animated.Value,
  toValue: number,
  duration: number,
  easing: (t: number) => number = rise,
): Animated.CompositeAnimation {
  return Animated.timing(value, { toValue, duration, easing, useNativeDriver: true });
}

/** The springy settle that ends most moves. Loose rest thresholds so a sequence is not held up. */
function settle(value: Animated.Value, bounciness = 12): Animated.CompositeAnimation {
  return Animated.spring(value, {
    toValue: 0,
    speed: 16,
    bounciness,
    restDisplacementThreshold: 0.02,
    restSpeedThreshold: 0.02,
    useNativeDriver: true,
  });
}

/** Run a function at a point in a sequence (to swap a pose, play dust, start a line). */
export function call(fn: () => void): Animated.CompositeAnimation {
  const base = Animated.delay(0);
  return {
    ...base,
    start: (callback) =>
      base.start((result) => {
        if (result.finished) fn();
        callback?.(result);
      }),
  };
}

/** Crouch, jump with a stretch, fall, squash on landing, settle. `power` scales all of it. */
export function moveHop(body: PetBody, power = 1): Animated.CompositeAnimation {
  return Animated.sequence([
    to(body.squash, 0.45 * power, 90),
    Animated.parallel([
      to(body.lift, power, 170),
      Animated.sequence([to(body.squash, -0.55 * power, 80), to(body.squash, -0.15 * power, 90, smooth)]),
    ]),
    Animated.parallel([to(body.lift, 0, 150, fall), to(body.squash, -0.4 * power, 150, fall)]),
    to(body.squash, 0.6 * power, 60),
    settle(body.squash),
  ]);
}

/** Just the landing: for the end of a drop or a roll that comes to a stop. */
export function moveLand(body: PetBody, strength = 1): Animated.CompositeAnimation {
  return Animated.sequence([to(body.squash, Math.min(1, 0.8 * strength), 60), settle(body.squash, 14)]);
}

/** The happy one: deep crouch, a high jump with a full flip, a heavy landing. `onLand` is for dust. */
export function moveJumpSpin(body: PetBody, onLand?: () => void): Animated.CompositeAnimation {
  return Animated.sequence([
    to(body.squash, 0.7, 130),
    Animated.parallel([
      Animated.sequence([to(body.lift, 1.7, 240), to(body.lift, 0, 200, fall)]),
      Animated.sequence([to(body.squash, -0.6, 90), to(body.squash, -0.2, 150, smooth), to(body.squash, -0.45, 200, fall)]),
      Animated.sequence([Animated.delay(40), to(body.spin, 1, 380, Easing.inOut(Easing.quad))]),
    ]),
    call(() => {
      body.spin.setValue(0);
      onLand?.();
    }),
    to(body.squash, 0.85, 60),
    settle(body.squash, 14),
  ]);
}

/** Unhappy: sinks a little and shudders, the shudder dying away. */
export function moveShiver(body: PetBody): Animated.CompositeAnimation {
  return Animated.parallel([
    Animated.sequence([
      to(body.shake, 1, 45),
      to(body.shake, -1, 70),
      to(body.shake, 0.8, 60),
      to(body.shake, -0.6, 60),
      to(body.shake, 0.35, 55),
      to(body.shake, -0.2, 50),
      to(body.shake, 0, 50),
    ]),
    Animated.sequence([to(body.squash, 0.3, 120), Animated.delay(220), settle(body.squash, 6)]),
  ]);
}

/**
 * Rocking to a stop after a roll. `direction` is the way it was travelling
 * (1 = rightwards, -1 = leftwards): it tips back against it first.
 */
export function moveRock(body: PetBody, direction: 1 | -1 = 1): Animated.CompositeAnimation {
  return Animated.sequence([
    to(body.tilt, -0.8 * direction, 130, smooth),
    to(body.tilt, 0.5 * direction, 140, smooth),
    to(body.tilt, -0.28 * direction, 120, smooth),
    to(body.tilt, 0.12 * direction, 100, smooth),
    to(body.tilt, 0, 90, smooth),
  ]);
}

/** Idle: looks one way, holds, looks the other way, comes back. */
export function moveLookAround(body: PetBody): Animated.CompositeAnimation {
  return Animated.sequence([
    to(body.tilt, -1, 240, smooth),
    Animated.delay(420),
    to(body.tilt, 1, 320, smooth),
    Animated.delay(360),
    settle(body.tilt, 8),
  ]);
}

/** Idle: a long slow stretch upwards, held, then let go. */
export function moveBigStretch(body: PetBody): Animated.CompositeAnimation {
  return Animated.sequence([
    to(body.squash, -0.6, 520, smooth),
    Animated.delay(380),
    to(body.squash, 0.3, 140),
    settle(body.squash),
  ]);
}

/** Pleased with itself: a quick side-to-side wiggle that dies away, with a small bounce. */
export function moveWiggle(body: PetBody): Animated.CompositeAnimation {
  return Animated.parallel([
    Animated.sequence([
      to(body.tilt, 0.9, 70),
      to(body.tilt, -0.9, 90),
      to(body.tilt, 0.7, 80),
      to(body.tilt, -0.5, 80),
      to(body.tilt, 0.25, 70),
      settle(body.tilt, 8),
    ]),
    Animated.sequence([to(body.squash, 0.3, 90), to(body.squash, -0.2, 120), settle(body.squash)]),
  ]);
}

/** A nod: two quick dips. For "yes", "got it", a new line. */
export function moveNod(body: PetBody): Animated.CompositeAnimation {
  return Animated.sequence([
    to(body.squash, 0.35, 90),
    to(body.squash, -0.1, 90),
    to(body.squash, 0.28, 90),
    settle(body.squash),
  ]);
}

/** Idle: shifts its weight to one side, waits, shifts back. */
export function moveWeightShift(body: PetBody, direction: 1 | -1 = 1): Animated.CompositeAnimation {
  return Animated.sequence([
    Animated.parallel([to(body.tilt, 0.5 * direction, 300, smooth), to(body.shake, 0.5 * direction, 300, smooth)]),
    Animated.delay(520),
    Animated.parallel([to(body.tilt, 0, 320, smooth), to(body.shake, 0, 320, smooth)]),
  ]);
}

/**
 * Change shape: squash right down, swap at the lowest point, spring up taller
 * than normal, settle. `swap` is where the picture changes (a state update).
 */
export function movePoseSwap(body: PetBody, swap: () => void): Animated.CompositeAnimation {
  return Animated.sequence([
    to(body.squash, 0.85, 110, fall),
    call(swap),
    to(body.squash, -0.55, 130),
    settle(body.squash, 14),
  ]);
}

/** "No": a quick head shake, side to side, dying away. */
export function moveHeadShake(body: PetBody): Animated.CompositeAnimation {
  return Animated.sequence([
    to(body.tilt, -0.8, 80),
    to(body.tilt, 0.8, 110),
    to(body.tilt, -0.6, 100),
    to(body.tilt, 0.45, 90),
    to(body.tilt, -0.2, 80),
    settle(body.tilt, 6),
  ]);
}

/** Angry: two hard little stomps, each landing flat. */
export function moveStomp(body: PetBody): Animated.CompositeAnimation {
  const stomp = () =>
    Animated.sequence([
      Animated.parallel([to(body.lift, 0.3, 90), to(body.squash, -0.2, 90)]),
      Animated.parallel([to(body.lift, 0, 70, fall), to(body.squash, 0.55, 70, fall)]),
      to(body.squash, 0, 120, smooth),
    ]);
  return Animated.sequence([stomp(), Animated.delay(60), stomp()]);
}

/** Angry: puffs itself up, holds it, lets it out in a snort. */
export function moveHuff(body: PetBody): Animated.CompositeAnimation {
  return Animated.sequence([
    to(body.squash, -0.45, 360, smooth),
    Animated.delay(160),
    Animated.parallel([to(body.squash, 0.5, 110), to(body.shake, 0.5, 110)]),
    Animated.parallel([to(body.shake, 0, 90), settle(body.squash, 8)]),
  ]);
}

/** Sad: sinks slowly, sighs, comes back up to rest. */
export function moveDroop(body: PetBody): Animated.CompositeAnimation {
  return Animated.sequence([
    to(body.squash, 0.6, 520, smooth),
    Animated.delay(480),
    to(body.squash, 0.4, 220, smooth),
    to(body.squash, 0.62, 260, smooth),
    to(body.squash, 0, 520, smooth),
  ]);
}

/** Startled: shoots up stretched thin, hangs there, drops, squashes. */
export function moveStartle(body: PetBody): Animated.CompositeAnimation {
  return Animated.sequence([
    Animated.parallel([to(body.lift, 0.8, 80), to(body.squash, -0.7, 80)]),
    Animated.delay(160),
    Animated.parallel([to(body.lift, 0, 140, fall), to(body.squash, -0.3, 140, fall)]),
    to(body.squash, 0.6, 60),
    settle(body.squash, 12),
  ]);
}

/** Asleep: one slow breath in and out. Loop it. */
export function moveSnore(body: PetBody): Animated.CompositeAnimation {
  return Animated.sequence([
    to(body.squash, -0.1, 1500, smooth),
    to(body.squash, 0.1, 1700, smooth),
    to(body.squash, 0, 300, smooth),
  ]);
}

/** Happy: six quick beats, leaning and bouncing from side to side. */
export function moveDance(body: PetBody): Animated.CompositeAnimation {
  const beat = (dir: 1 | -1) =>
    Animated.parallel([
      to(body.tilt, 0.8 * dir, 140, smooth),
      to(body.shake, 0.7 * dir, 140, smooth),
      Animated.sequence([to(body.lift, 0.3, 70), to(body.lift, 0, 70, fall)]),
    ]);
  return Animated.sequence([
    beat(1),
    beat(-1),
    beat(1),
    beat(-1),
    beat(1),
    beat(-1),
    Animated.parallel([to(body.tilt, 0, 120, smooth), to(body.shake, 0, 120, smooth)]),
    moveLand(body, 0.5),
  ]);
}

/** Dizzy: lurches one way, then the other, wider and slower, and sags. */
export function moveStagger(body: PetBody): Animated.CompositeAnimation {
  const lean = (tilt: number, shake: number, ms: number) =>
    Animated.parallel([to(body.tilt, tilt, ms, smooth), to(body.shake, shake, ms, smooth)]);
  return Animated.sequence([
    lean(0.9, 0.6, 220),
    lean(-1, -0.8, 300),
    lean(0.7, 0.8, 280),
    lean(-0.5, -0.5, 260),
    to(body.squash, 0.5, 160),
    Animated.parallel([to(body.tilt, 0, 220, smooth), to(body.shake, 0, 220, smooth), settle(body.squash, 6)]),
  ]);
}
