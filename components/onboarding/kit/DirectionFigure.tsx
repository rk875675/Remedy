import React, { useEffect, useRef } from 'react';
import { Animated, Image } from 'react-native';
import { useAfterTransition } from '../../../lib/useAfterTransition';
import { useReduceMotion } from '../../../lib/useReduceMotion';
import { ob } from './tokens';

type DirectionFigureProps = {
  pose: 'curl' | 'arch';
  size?: number;
  /** Springs slightly larger when this pose is the chosen one. */
  active?: boolean;
};

const CURL = require('../../../assets/onboarding/illo-relief-curl.png');
const ARCH = require('../../../assets/onboarding/illo-relief-arch.png');

const LABEL = {
  curl: 'Person curled forward',
  arch: 'Person standing tall, arching back',
} as const;

/** Flat illustration of the two postures. Same person, white ground. */
export function DirectionFigure({ pose, size = 120, active = false }: DirectionFigureProps) {
  const reduce = useReduceMotion();
  const ready = useAfterTransition();
  const scale = useRef(new Animated.Value(1)).current;
  const rock = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce === null) return;
    if (!active || reduce) {
      scale.setValue(1);
      rock.setValue(0);
      return;
    }
    if (!ready) return;
    const spring = Animated.spring(scale, {
      toValue: 1.04,
      tension: ob.motion.spring.tension,
      friction: ob.motion.spring.friction,
      useNativeDriver: true,
    });
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(rock, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(rock, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
    );
    spring.start();
    loop.start();
    return () => {
      spring.stop();
      loop.stop();
    };
  }, [active, reduce, ready, scale, rock]);

  const rotate = rock.interpolate({
    inputRange: [0, 1],
    outputRange: ['-1.5deg', '1.5deg'],
  });
  const fill = pose === 'curl' ? 1.32 : 1.12;

  return (
    <Animated.View
      style={{ width: size, height: size, transform: [{ scale }, { rotate }], overflow: 'hidden' }}
    >
      <Image
        accessible
        accessibilityRole="image"
        accessibilityLabel={LABEL[pose]}
        source={pose === 'curl' ? CURL : ARCH}
        resizeMode="contain"
        style={{
          width: size * fill,
          height: size * fill,
          marginLeft: (size - size * fill) / 2,
          marginTop: (size - size * fill) / 2,
        }}
      />
    </Animated.View>
  );
}
