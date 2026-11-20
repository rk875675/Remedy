import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useAfterTransition } from '../../../lib/useAfterTransition';
import { useReduceMotion } from '../../../lib/useReduceMotion';
import { ob } from './tokens';

type ConfettiProps = {
  play: boolean;
  count?: number;
};

type Bit = {
  x: number;
  y: number;
  vx: number;
  rise: number;
  fall: number;
  spin: number;
  delay: number;
  duration: number;
  w: number;
  h: number;
  round: boolean;
  color: string;
  anim: Animated.Value;
};

const COLORS = [ob.color.accent, ob.color.clay, '#F3D2B3', ob.color.ink] as const;

function makeBits(count: number): Bit[] {
  return Array.from({ length: count }, (_, index) => {
    const round = Math.random() < 0.4;
    const size = 6 + Math.random() * 6;
    const color = COLORS[Math.floor(Math.random() * COLORS.length)] ?? ob.color.accent;
    const onLeft = index % 2 === 0;
    const edge = Math.random() * 0.14;
    return {
      x: onLeft ? edge : 1 - edge,
      y: Math.random() * 0.05,
      vx: (onLeft ? 1 : -1) * (6 + Math.random() * 22),
      rise: 6 + Math.random() * 14,
      fall: 64 + Math.random() * 110,
      spin: (Math.random() < 0.5 ? -1 : 1) * (120 + Math.random() * 280),
      delay: Math.random() * 180,
      duration: 1400 + Math.random() * 450,
      w: round ? size : size * 0.7,
      h: round ? size : size * 1.35,
      round,
      color,
      anim: new Animated.Value(0),
    };
  });
}

/**
 * One-shot burst. Pieces are rolled once when the overlay mounts,
 * then launched from the top third.
 */
export function Confetti({ play, count = 28 }: ConfettiProps) {
  const reduce = useReduceMotion();
  const ready = useAfterTransition();
  const bits = useRef<Bit[] | null>(null);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    bits.current = makeBits(count);
    setGeneration((n) => n + 1);
  }, [count]);

  useEffect(() => {
    const list = bits.current;
    if (generation === 0 || !list || reduce !== false || !play || !ready) return;
    const running = list.map((bit) => {
      bit.anim.setValue(0);
      return Animated.timing(bit.anim, {
        toValue: 1,
        duration: bit.duration,
        delay: bit.delay,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
        isInteraction: false,
      });
    });
    const group = Animated.parallel(running);
    group.start();
    return () => group.stop();
  }, [play, reduce, ready, generation]);

  if (generation === 0 || reduce !== false || !play || !ready || !bits.current) return null;

  return (
    <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
      {bits.current.map((bit, index) => {
        const translateY = bit.anim.interpolate({
          inputRange: [0, 0.16, 1],
          outputRange: [0, -bit.rise, bit.fall],
        });
        const translateX = bit.anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, bit.vx],
        });
        const rotate = bit.anim.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', `${bit.spin}deg`],
        });
        const opacity = bit.anim.interpolate({
          inputRange: [0, 0.62, 1],
          outputRange: [0.7, 0.7, 0],
        });
        return (
          <Animated.View
            key={index}
            style={{
              position: 'absolute',
              left: `${bit.x * 100}%`,
              top: `${bit.y * 100}%`,
              width: bit.w,
              height: bit.h,
              borderRadius: bit.round ? bit.w / 2 : 2,
              backgroundColor: bit.color,
              opacity,
              transform: [{ translateX }, { translateY }, { rotate }],
            }}
          />
        );
      })}
    </View>
  );
}
