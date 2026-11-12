import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

/** One puff: where it appears (x, from the left of the Dust view) and when (ms from play). */
export type DustPoint = { x: number; delay: number; size?: number };
export type DustHandle = { play: (points: DustPoint[]) => void };

const MAX_PUFFS = 8;
const PUFF_MS = 560;
/** Kicked-up earth on the tan page. */
export const DUST_EARTH = 'rgba(122, 84, 52, 0.30)';
/** The same on the green scene, where dark dust would not show. */
export const DUST_PALE = 'rgba(246, 237, 224, 0.40)';

/**
 * Little puffs of earth left behind when the pet rolls or lands. Deliberately
 * faint and short-lived: an after-effect, not an effect. Fill the parent with
 * it (it is absolutely positioned) and call `play` with where and when.
 */
export const Dust = forwardRef<DustHandle, { color?: string }>(function Dust(
  { color = DUST_EARTH },
  ref,
) {
  const values = useRef(Array.from({ length: MAX_PUFFS }, () => new Animated.Value(0))).current;
  const [run, setRun] = useState<{ id: number; points: DustPoint[] }>({ id: 0, points: [] });

  useImperativeHandle(
    ref,
    () => ({
      play(points) {
        setRun((prev) => ({ id: prev.id + 1, points: points.slice(0, MAX_PUFFS) }));
      },
    }),
    [],
  );

  useEffect(() => {
    if (run.points.length === 0) return;
    const puffs: Animated.CompositeAnimation[] = [];
    run.points.forEach((point, i) => {
      const value = values[i];
      if (!value) return;
      value.setValue(0);
      puffs.push(
        Animated.sequence([
          Animated.delay(Math.max(0, Math.round(point.delay))),
          Animated.timing(value, {
            toValue: 1,
            duration: PUFF_MS,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      );
    });
    const all = Animated.parallel(puffs);
    all.start();
    return () => all.stop();
  }, [run, values]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {run.points.map((point, i) => {
        const value = values[i];
        if (!value) return null;
        const size = point.size ?? 10;
        return (
          <Animated.View
            key={`${run.id}-${i}`}
            style={{
              position: 'absolute',
              left: point.x - size / 2,
              bottom: 0,
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: color,
              opacity: value.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
              transform: [
                { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) },
                { scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.8] }) },
              ],
            }}
          />
        );
      })}
    </View>
  );
});

/**
 * How far through an eased move (0..1 of its duration) the value first reaches
 * `target` (0..1 of its distance). Used to time a puff to the moment the pet
 * passes a spot. Assumes the easing only moves forward.
 */
export function easedTimeAt(easing: (t: number) => number, target: number): number {
  if (target <= 0) return 0;
  if (target >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (easing(mid) < target) lo = mid;
    else hi = mid;
  }
  return hi;
}
