import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import { petImage } from '../../constants/petImages';
import { useReduceMotion } from '../../lib/useReduceMotion';
import { DUST_EARTH } from './Dust';

// The ball in the art is 0.89 of its canvas wide, so its radius is 0.445 of the drawn size.
const BALL_RADIUS = 0.445;
const PUFF_SIZE = 11;
/** Spots along the track (as a fraction of the travel) where the ball kicks up dust. */
const PUFF_SPOTS = [0.22, 0.5, 0.78];

const PUSH_MS = 110;
const UNWIND_MS = 140;
const IMPACT_MS = 100;
const PAUSE_MS = 210;
const TRAIL_PUFF_MS = 400;
const END_PUFF_MS = 190;
const HOP_CROUCH = 60;
const HOP_RISE = 150;
const HOP_FALL = 140;
const HOP_LAND = 50;
const HOP_RECOVER = 80;
const HOP_MS = HOP_CROUCH + HOP_RISE + HOP_FALL + HOP_LAND + HOP_RECOVER;
const SQUASH_AMOUNT = 0.34;
const HOP_FRACTION = 0.18;
const WALL_SQUASH = 0.5;
const PUSH_STRETCH = -0.28;
const STEPS = 12;

const easeTravel = Easing.inOut(Easing.quad);

/** Inverse of Easing.inOut(Easing.quad): how far through the leg the ball reaches `f`. */
function legTimeAt(f: number): number {
  return f < 0.5 ? Math.sqrt(f / 2) : 1 - Math.sqrt((1 - f) / 2);
}

function hopStart(legMs: number): number {
  const earliest = PUSH_MS + UNWIND_MS;
  const latest = legMs - IMPACT_MS - 40 - HOP_MS;
  if (latest <= earliest) return earliest;
  return Math.round((earliest + latest) / 2);
}

function puffOpacity(u: number, peak: number): number {
  if (u <= 0 || u >= 1) return 0;
  const v = 1 - (1 - u) * (1 - u);
  const env = v <= 0.2 ? v / 0.2 : (1 - v) / 0.8;
  return env * peak;
}

function puffScale(u: number, max: number): number {
  if (u <= 0 || u >= 1) return 0.5;
  const v = 1 - (1 - u) * (1 - u);
  return 0.5 + v * (max - 0.5);
}

function puffRise(u: number): number {
  if (u <= 0 || u >= 1) return 0;
  const v = 1 - (1 - u) * (1 - u);
  return -6 * v;
}

type Frames = { inputRange: number[]; outputRange: number[] };

/** Last write at a millisecond wins. The value at the end of the cycle matches the start. */
function compile(points: Array<[number, number]>, cycle: number): Frames {
  const map = new Map<number, number>();
  for (const [t, v] of points) {
    map.set(Math.max(0, Math.min(cycle, Math.round(t))), v);
  }
  const start = map.get(0) ?? 0;
  map.set(0, start);
  map.set(cycle, start);
  const inputRange = [...map.keys()].sort((a, b) => a - b);
  return { inputRange, outputRange: inputRange.map((t) => map.get(t) ?? 0) };
}

function addPuff(
  opacity: Array<[number, number]>,
  scale: Array<[number, number]>,
  rise: Array<[number, number]>,
  start: number,
  dur: number,
  peak: number,
  maxScale: number,
) {
  const n = 7;
  for (let i = 0; i <= n; i += 1) {
    const u = i / n;
    const t = start + (dur * i) / n;
    opacity.push([t, puffOpacity(u, peak)]);
    scale.push([t, puffScale(u, maxScale)]);
    rise.push([t, puffRise(u)]);
  }
}

type PuffView = {
  key: string;
  left: number;
  opacity: Animated.AnimatedInterpolation<number>;
  translateY: Animated.AnimatedInterpolation<number>;
  scale: Animated.AnimatedInterpolation<number>;
};

type RollMotion = {
  cycleMs: number;
  travelX: Animated.AnimatedInterpolation<number>;
  roll: Animated.AnimatedInterpolation<string>;
  lift: Animated.AnimatedInterpolation<number>;
  lean: Animated.AnimatedInterpolation<string>;
  squashY: Animated.AnimatedInterpolation<number>;
  scaleX: Animated.AnimatedInterpolation<number>;
  scaleY: Animated.AnimatedInterpolation<number>;
  shadowOpacity: Animated.AnimatedInterpolation<number>;
  shadowScale: Animated.AnimatedInterpolation<number>;
  puffs: PuffView[];
};

/**
 * One native clock for a whole cycle (six passes). Travel, squash, lean, hop
 * and dust are interpolations of that clock, so they cannot drift apart.
 * The cycle starts and ends on the same pose: held against the left end.
 */
function buildCycle(clock: Animated.Value, travel: number, size: number): RollMotion {
  const legMs = Math.max(900, Math.round(travel * 5.5));
  const passMs = legMs + PAUSE_MS;
  const cycle = passMs * 6;
  const radius = Math.max(1, size * BALL_RADIUS);
  const hopPx = size * HOP_FRACTION;
  const xPoints: Array<[number, number]> = [];
  const squashPoints: Array<[number, number]> = [[0, WALL_SQUASH]];
  const tiltPoints: Array<[number, number]> = [];
  const liftPoints: Array<[number, number]> = [[0, 0]];
  const spotKeys: Array<Array<[number, number]>> = PUFF_SPOTS.map(() => []);
  const spotScale: Array<Array<[number, number]>> = PUFF_SPOTS.map(() => []);
  const spotRise: Array<Array<[number, number]>> = PUFF_SPOTS.map(() => []);
  const endOpacity: [Array<[number, number]>, Array<[number, number]>] = [[], []];
  const endScale: [Array<[number, number]>, Array<[number, number]>] = [[], []];
  const endRise: [Array<[number, number]>, Array<[number, number]>] = [[], []];
  const hopOpacity: [Array<[number, number]>, Array<[number, number]>] = [[], []];
  const hopScale: [Array<[number, number]>, Array<[number, number]>] = [[], []];
  const hopRise: [Array<[number, number]>, Array<[number, number]>] = [[], []];
  const hopLeft = [0, 0];

  for (let i = 0; i < 6; i += 1) {
    const t0 = i * passMs;
    const dir: 1 | -1 = i % 2 === 0 ? 1 : -1;
    const startX = dir === 1 ? 0 : 1;
    const endX = dir === 1 ? 1 : 0;
    for (let s = 0; s <= STEPS; s += 1) {
      const u = s / STEPS;
      xPoints.push([t0 + u * legMs, startX + (endX - startX) * easeTravel(u)]);
    }
    const lean = 6 * dir;
    tiltPoints.push([t0, -lean], [t0 + PUSH_MS, 2.5 * dir], [t0 + PUSH_MS + UNWIND_MS, 0]);
    tiltPoints.push([t0 + legMs - IMPACT_MS, 0], [t0 + legMs, lean], [t0 + passMs, lean]);
    squashPoints.push(
      [t0, WALL_SQUASH],
      [t0 + PUSH_MS, PUSH_STRETCH],
      [t0 + PUSH_MS + UNWIND_MS, 0],
      [t0 + legMs - IMPACT_MS, 0],
      [t0 + legMs, WALL_SQUASH],
      [t0 + passMs, WALL_SQUASH],
    );

    const withHop = i % 3 === 2;
    if (withHop) {
      const hs = t0 + hopStart(legMs);
      squashPoints.push(
        [hs, 0],
        [hs + HOP_CROUCH, 0.4],
        [hs + HOP_CROUCH + HOP_RISE, -0.48],
        [hs + HOP_CROUCH + HOP_RISE + HOP_FALL, -0.12],
        [hs + HOP_CROUCH + HOP_RISE + HOP_FALL + HOP_LAND, WALL_SQUASH],
        [hs + HOP_MS, 0],
      );
      liftPoints.push(
        [hs, 0],
        [hs + HOP_CROUCH, 0],
        [hs + HOP_CROUCH + HOP_RISE, 1],
        [hs + HOP_CROUCH + HOP_RISE + HOP_FALL, 0],
        [hs + HOP_MS, 0],
      );
      const landU = (hs - t0 + HOP_CROUCH + HOP_RISE + HOP_FALL) / legMs;
      const landX = startX + (endX - startX) * easeTravel(Math.min(1, Math.max(0, landU)));
      const side = dir === 1 ? 0 : 1;
      hopLeft[side] = landX * travel + size / 2 - PUFF_SIZE / 2;
      addPuff(hopOpacity[side], hopScale[side], hopRise[side], hs + HOP_CROUCH + HOP_RISE + HOP_FALL, TRAIL_PUFF_MS, 0.9, 1.5);
    }

    PUFF_SPOTS.forEach((spot, s) => {
      const along = (spot - startX) / (endX - startX);
      const when = t0 + legMs * legTimeAt(along);
      const opacity = spotKeys[s];
      const scale = spotScale[s];
      const rise = spotRise[s];
      if (opacity && scale && rise) addPuff(opacity, scale, rise, when, TRAIL_PUFF_MS, 1, 1.8);
    });
    const endSide = dir === 1 ? 1 : 0;
    addPuff(endOpacity[endSide], endScale[endSide], endRise[endSide], t0 + legMs, END_PUFF_MS, 0.8, 1.35);
  }

  const xFrames = compile(xPoints, cycle);
  const squashFrames = compile(squashPoints, cycle);
  const tiltFrames = compile(tiltPoints, cycle);
  const liftFrames = compile(liftPoints, cycle);
  const rad = 180 / Math.PI;

  const num = (frames: Frames) =>
    clock.interpolate({ inputRange: frames.inputRange, outputRange: frames.outputRange, extrapolate: 'clamp' });
  const deg = (frames: Frames) =>
    clock.interpolate({
      inputRange: frames.inputRange,
      outputRange: frames.outputRange.map((v) => `${v}deg`),
      extrapolate: 'clamp',
    });

  function puffView(
    key: string,
    left: number,
    opacity: Array<[number, number]>,
    scale: Array<[number, number]>,
    rise: Array<[number, number]>,
  ): PuffView {
    return {
      key,
      left,
      opacity: num(compile(opacity.length > 0 ? opacity : [[0, 0]], cycle)),
      scale: num(compile(scale.length > 0 ? scale : [[0, 0.5]], cycle)),
      translateY: num(compile(rise.length > 0 ? rise : [[0, 0]], cycle)),
    };
  }

  const puffs: PuffView[] = [
    ...PUFF_SPOTS.map((spot, s) =>
      puffView(
        `spot-${spot}`,
        spot * travel + size / 2 - PUFF_SIZE / 2,
        spotKeys[s] ?? [],
        spotScale[s] ?? [],
        spotRise[s] ?? [],
      ),
    ),
    puffView('end-left', size / 2 - PUFF_SIZE / 2, endOpacity[0], endScale[0], endRise[0]),
    puffView('end-right', travel + size / 2 - PUFF_SIZE / 2, endOpacity[1], endScale[1], endRise[1]),
    puffView('hop-right', hopLeft[0], hopOpacity[0], hopScale[0], hopRise[0]),
    puffView('hop-left', hopLeft[1], hopOpacity[1], hopScale[1], hopRise[1]),
  ];

  return {
    cycleMs: cycle,
    travelX: num({
      inputRange: xFrames.inputRange,
      outputRange: xFrames.outputRange.map((v) => v * travel),
    }),
    roll: clock.interpolate({
      inputRange: xFrames.inputRange,
      outputRange: xFrames.outputRange.map((v) => `${(v * travel) / radius * rad}deg`),
      extrapolate: 'clamp',
    }),
    lift: num({
      inputRange: liftFrames.inputRange,
      outputRange: liftFrames.outputRange.map((v) => -v * hopPx),
    }),
    lean: deg(tiltFrames),
    squashY: num({
      inputRange: squashFrames.inputRange,
      outputRange: squashFrames.outputRange.map((v) => (v * size * SQUASH_AMOUNT) / 2),
    }),
    scaleX: num({
      inputRange: squashFrames.inputRange,
      outputRange: squashFrames.outputRange.map((v) => 1 + v * SQUASH_AMOUNT * 0.8),
    }),
    scaleY: num({
      inputRange: squashFrames.inputRange,
      outputRange: squashFrames.outputRange.map((v) => 1 - v * SQUASH_AMOUNT),
    }),
    shadowOpacity: num({
      inputRange: liftFrames.inputRange,
      outputRange: liftFrames.outputRange.map((v) => 1 - (v / 1.6) * 0.55),
    }),
    shadowScale: num({
      inputRange: liftFrames.inputRange,
      outputRange: liftFrames.outputRange.map((v) => 1 - (v / 1.6) * 0.4),
    }),
    puffs,
  };
}

/**
 * The pet, curled up, rolling back and forth across the full width it is given,
 * kicking up a little dust behind it. For waiting screens: it reads as "busy"
 * without a spinner. With Reduce Motion on it sits still in the middle.
 */
export function PetRollTrack({ size = 72 }: { size?: number }) {
  const reduceMotion = useReduceMotion();
  const [trackWidth, setTrackWidth] = useState(0);
  const mounted = useRef(true);
  const clock = useRef(new Animated.Value(0)).current;
  const travel = Math.max(0, trackWidth - size);
  const moving = reduceMotion === false && travel > 0;
  const motion = useMemo(() => buildCycle(clock, travel, size), [clock, travel, size]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!moving) return;
    clock.setValue(0);
    const loop = Animated.loop(
      Animated.timing(clock, {
        toValue: motion.cycleMs,
        duration: motion.cycleMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [moving, motion.cycleMs, clock]);

  const fullTurn = (travel / Math.max(1, size * BALL_RADIUS)) * (180 / Math.PI);
  const still = {
    transform: [{ translateX: travel / 2 }, { rotate: `${fullTurn / 2}deg` }],
  };

  return (
    <View
      style={[styles.track, { height: size + 4 }]}
      onLayout={(e) => {
        if (mounted.current) setTrackWidth(e.nativeEvent.layout.width);
      }}
      pointerEvents="none"
      accessible
      accessibilityRole="image"
      accessibilityLabel="Your armadillo, rolling"
    >
      {trackWidth > 0 ? (
        <>
          {moving
            ? motion.puffs.map((puff) => (
                <Animated.View
                  key={puff.key}
                  style={[
                    styles.puff,
                    {
                      left: puff.left,
                      opacity: puff.opacity,
                      transform: [{ translateY: puff.translateY }, { scale: puff.scale }],
                    },
                  ]}
                />
              ))
            : null}
          <Animated.View
            style={[
              styles.shadow,
              {
                width: size * 0.6,
                height: size * 0.08,
                borderRadius: size * 0.3,
                left: size * 0.2,
                opacity: moving ? motion.shadowOpacity : 1,
                transform: moving
                  ? [{ translateX: motion.travelX }, { scaleX: motion.shadowScale }]
                  : [{ translateX: travel / 2 }],
              },
            ]}
          />
          {moving ? (
            <Animated.View
              style={{
                width: size,
                height: size,
                alignSelf: 'flex-start',
                transform: [
                  { translateX: motion.travelX },
                  { translateY: motion.lift },
                  { rotate: motion.lean },
                ],
              }}
            >
              <Animated.View
                style={{
                  width: size,
                  height: size,
                  transform: [
                    { translateY: motion.squashY },
                    { scaleX: motion.scaleX },
                    { scaleY: motion.scaleY },
                  ],
                }}
              >
                <Animated.View style={{ width: size, height: size, transform: [{ rotate: motion.roll }] }}>
                  <Image
                    source={petImage(1, 'celebrating')}
                    resizeMode="contain"
                    style={{ width: size, height: size }}
                  />
                </Animated.View>
              </Animated.View>
            </Animated.View>
          ) : (
            <Image
              source={petImage(1, 'celebrating')}
              resizeMode="contain"
              style={{ width: size, height: size, alignSelf: 'flex-start', transform: still.transform }}
            />
          )}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    alignSelf: 'stretch',
    justifyContent: 'flex-end',
  },
  shadow: {
    position: 'absolute',
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.14)',
  },
  puff: {
    position: 'absolute',
    bottom: 0,
    width: PUFF_SIZE,
    height: PUFF_SIZE,
    borderRadius: PUFF_SIZE / 2,
    backgroundColor: DUST_EARTH,
  },
});
