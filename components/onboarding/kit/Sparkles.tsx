import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useAfterTransition } from '../../../lib/useAfterTransition';
import { useReduceMotion } from '../../../lib/useReduceMotion';
import { ob } from './tokens';

type SparklesProps = {
  /** Width and height of the box the sparkles sit around. */
  size: number;
  count?: number;
  color?: string;
};

type Spark = {
  x: number;
  y: number;
  dim: number;
  period: number;
  delay: number;
  anim: Animated.Value;
};

const STAR = 'M8 0.6 L9.7 6.1 L15.4 8 L9.7 9.9 L8 15.4 L6.3 9.9 L0.6 8 L6.3 6.1 Z';

function makeSparks(count: number, size: number): Spark[] {
  return Array.from({ length: count }, (_, i) => {
    const turn = (i / count) * Math.PI * 2 - Math.PI / 2;
    const angle = turn + (Math.random() - 0.5) * 0.55;
    const dist = size * (0.32 + Math.random() * 0.14);
    const dim = Math.max(8, size * (0.055 + Math.random() * 0.035));
    return {
      x: size / 2 + Math.cos(angle) * dist - dim / 2,
      y: size / 2 + Math.sin(angle) * dist - dim / 2,
      dim,
      period: 1600 + Math.random() * 800,
      delay: Math.round(Math.random() * 480),
      anim: new Animated.Value(0),
    };
  });
}

/** Four-point stars around a box. Positions are rolled once per mount. */
export function Sparkles({ size, count = 5, color = ob.color.accent }: SparklesProps) {
  const reduce = useReduceMotion();
  const ready = useAfterTransition();
  const sparks = useRef<Spark[]>([]);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    sparks.current = makeSparks(count, size);
    setGeneration((n) => n + 1);
  }, [count, size]);

  useEffect(() => {
    const list = sparks.current;
    if (generation === 0 || list.length === 0 || reduce !== false || !ready) return;
    const running = list.map((spark) => {
      const half = spark.period / 2;
      return Animated.sequence([
        Animated.delay(spark.delay),
        Animated.loop(
          Animated.sequence([
            Animated.timing(spark.anim, {
              toValue: 1,
              duration: half,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
              isInteraction: false,
            }),
            Animated.timing(spark.anim, {
              toValue: 0,
              duration: half,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
              isInteraction: false,
            }),
          ]),
        ),
      ]);
    });
    running.forEach((anim) => anim.start());
    return () => running.forEach((anim) => anim.stop());
  }, [reduce, ready, generation]);

  const motion = reduce === false && ready;

  return (
    <View
      pointerEvents="none"
      accessible={false}
      style={{ width: size, height: size }}
    >
      {sparks.current.map((spark, index) => {
        const scale = motion
          ? spark.anim.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] })
          : 1;
        const opacity = motion
          ? spark.anim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] })
          : 0.7;
        return (
          <Animated.View
            key={index}
            style={{
              position: 'absolute',
              left: spark.x,
              top: spark.y,
              width: spark.dim,
              height: spark.dim,
              opacity,
              transform: [{ scale }],
            }}
          >
            <Svg width={spark.dim} height={spark.dim} viewBox="0 0 16 16">
              <Path d={STAR} fill={color} />
            </Svg>
          </Animated.View>
        );
      })}
    </View>
  );
}
