import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { petImage } from '../../constants/petImages';
import { useReduceMotion } from '../../lib/useReduceMotion';

// The ball in the art is 0.89 of its canvas wide, so its radius is 0.445 of the drawn size.
const BALL_RADIUS = 0.445;

/**
 * The pet, curled up, rolling back and forth across the full width it is given.
 * For waiting screens: it reads as "busy" without a spinner.
 * With Reduce Motion on it sits still in the middle.
 */
export function PetRollTrack({ size = 72 }: { size?: number }) {
  const reduceMotion = useReduceMotion();
  const [trackWidth, setTrackWidth] = useState(0);
  const x = useRef(new Animated.Value(0.5)).current;
  const travel = Math.max(0, trackWidth - size);

  useEffect(() => {
    if (reduceMotion !== false || travel <= 0) {
      x.setValue(0.5);
      return;
    }
    x.setValue(0);
    const duration = Math.max(900, Math.round(travel * 5.5));
    const leg = (toValue: number) =>
      Animated.timing(x, {
        toValue,
        duration,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      });
    const loop = Animated.loop(
      Animated.sequence([leg(1), Animated.delay(140), leg(0), Animated.delay(140)]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, travel, x]);

  const motion = useMemo(() => {
    const degrees = Math.round((travel / (size * BALL_RADIUS)) * (180 / Math.PI));
    const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [0, travel] });
    return {
      translateX,
      rotate: x.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${degrees}deg`] }),
    };
  }, [x, travel, size]);

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
});
