import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors } from '../../constants/colors';
import { pacePhaseLabels } from '../../lib/exerciseDetails';
import { useAfterTransition } from '../../lib/useAfterTransition';
import { useReduceMotion } from '../../lib/useReduceMotion';

const SIZE = 56;
const STROKE = 4;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type PaceRingProps = {
  pattern: readonly number[];
};

/**
 * Visual metronome for one rep. It does not count reps or advance the set.
 * Hidden for a single phase, an empty pattern, or Reduce Motion.
 */
export function PaceRing({ pattern }: PaceRingProps) {
  const patternKey = pattern.join(',');
  const labels = useMemo(() => pacePhaseLabels(pattern), [pattern, patternKey]);
  const reduce = useReduceMotion();
  const ready = useAfterTransition();
  const [index, setIndex] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (labels === null || reduce !== false || !ready) return;
    let alive = true;
    let cursor = 0;

    const tick = () => {
      if (!alive) return;
      setIndex(cursor);
      progress.setValue(0);
      const seconds = pattern[cursor] ?? 0;
      const duration = Math.max(0, seconds) * 1000;
      Animated.timing(progress, {
        toValue: 1,
        duration: duration === 0 ? 16 : duration,
        easing: Easing.linear,
        // Stroke dashoffset is an SVG prop. It cannot use the native driver.
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (!finished || !alive || labels.length === 0) return;
        cursor = (cursor + 1) % labels.length;
        tick();
      });
    };

    tick();
    return () => {
      alive = false;
      progress.stopAnimation();
    };
  }, [labels, pattern, patternKey, progress, ready, reduce]);

  if (labels === null || reduce !== false) return null;

  const label = labels[index] ?? labels[0];
  const seconds = pattern[index] ?? 0;
  const strokeDashoffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [CIRCUMFERENCE, 0],
  });

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}, ${seconds} seconds`}
    >
      <Svg width={SIZE} height={SIZE}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={colors.primaryMuted}
          strokeWidth={STROKE}
          fill="none"
        />
        <AnimatedCircle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={colors.primary}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={strokeDashoffset}
          fill="none"
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </Svg>
      <View style={styles.labelWrap} pointerEvents="none">
        <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: SIZE,
    height: SIZE,
  },
  labelWrap: {
    position: 'absolute',
    left: 6,
    right: 6,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center',
  },
});
