import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { petImage } from '../../constants/petImages';
import { useReduceMotion } from '../../lib/useReduceMotion';
import { DUST_EARTH } from './Dust';

// The ball in the art is 0.89 of its canvas wide, so its radius is 0.445 of the drawn size.
const BALL_RADIUS = 0.445;
const PAUSE_MS = 140;
const PUFF_MS = 520;
/** Spots along the track (as a fraction of the travel) where the ball kicks up dust. */
const PUFF_SPOTS = [0.22, 0.5, 0.78];

/** Inverse of Easing.inOut(Easing.quad): how far through the leg the ball reaches `f`. */
function legTimeAt(f: number): number {
  return f < 0.5 ? Math.sqrt(f / 2) : 1 - Math.sqrt((1 - f) / 2);
}

/**
 * The pet, curled up, rolling back and forth across the full width it is given,
 * kicking up a little dust behind it. For waiting screens: it reads as "busy"
 * without a spinner. With Reduce Motion on it sits still in the middle.
 */
export function PetRollTrack({ size = 72 }: { size?: number }) {
  const reduceMotion = useReduceMotion();
  const [trackWidth, setTrackWidth] = useState(0);
  const x = useRef(new Animated.Value(0.5)).current;
  const puffs = useRef(PUFF_SPOTS.map(() => new Animated.Value(0))).current;
  const travel = Math.max(0, trackWidth - size);
  const moving = reduceMotion === false && travel > 0;

  useEffect(() => {
    if (!moving) {
      x.setValue(0.5);
      return;
    }
    x.setValue(0);
    puffs.forEach((p) => p.setValue(0));
    const legMs = Math.max(900, Math.round(travel * 5.5));
    const period = 2 * (legMs + PAUSE_MS);
    const leg = (toValue: number) =>
      Animated.timing(x, {
        toValue,
        duration: legMs,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      });
    const puff = (value: Animated.Value) =>
      Animated.sequence([
        Animated.timing(value, {
          toValue: 1,
          duration: PUFF_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(value, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]);
    // Each spot puffs twice per lap: once as the ball passes going out, once coming back.
    const dust = PUFF_SPOTS.map((spot, i) => {
      const value = puffs[i] ?? new Animated.Value(0);
      const out = legMs * legTimeAt(spot);
      const back = legMs + PAUSE_MS + legMs * legTimeAt(1 - spot);
      return Animated.sequence([
        Animated.delay(Math.round(out)),
        puff(value),
        Animated.delay(Math.max(0, Math.round(back - out - PUFF_MS))),
        puff(value),
        Animated.delay(Math.max(0, Math.round(period - back - PUFF_MS))),
      ]);
    });
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([leg(1), Animated.delay(PAUSE_MS), leg(0), Animated.delay(PAUSE_MS)]),
        ...dust,
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [moving, travel, x, puffs]);

  const motion = useMemo(() => {
    const degrees = Math.round((travel / (size * BALL_RADIUS)) * (180 / Math.PI));
    return {
      translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, travel] }),
      rotate: x.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${degrees}deg`] }),
    };
  }, [x, travel, size]);

  const puffStyles = useMemo(
    () =>
      puffs.map((value) => ({
        opacity: value.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
        transform: [
          { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) },
          { scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.8] }) },
        ],
      })),
    [puffs],
  );

  return (
    <View
      style={[styles.track, { height: size + 4 }]}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      pointerEvents="none"
      accessible
      accessibilityRole="image"
      accessibilityLabel="Your armadillo, rolling"
    >
      {trackWidth > 0 ? (
        <>
          {moving
            ? PUFF_SPOTS.map((spot, i) => (
                <Animated.View
                  key={spot}
                  style={[
                    styles.puff,
                    { left: spot * travel + size / 2 - PUFF_SIZE / 2 },
                    puffStyles[i],
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
                transform: [{ translateX: motion.translateX }],
              },
            ]}
          />
          <Animated.Image
            source={petImage(1, 'celebrating')}
            resizeMode="contain"
            style={{
              width: size,
              height: size,
              transform: [{ translateX: motion.translateX }, { rotate: motion.rotate }],
            }}
          />
        </>
      ) : null}
    </View>
  );
}

const PUFF_SIZE = 11;

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
