import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useAfterTransition } from '../../../lib/useAfterTransition';
import { useReduceMotion } from '../../../lib/useReduceMotion';
import { ob } from './tokens';

export type SegmentedProgressProps = {
  /** How many chapter pills. Default 4. */
  segments?: number;
  /** 1-based chapter currently in progress. */
  chapter: number;
  /** 0..1 fill of the current chapter. Earlier chapters are full. */
  progress: number;
};

const PROGRESS_MS = 350;
/** A chapter that has started always shows a short cap, so the bar never looks blank. */
const MIN_FILL = 0.08;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function fillFor(index: number, chapter: number, progress: number): number {
  const position = index + 1;
  if (position < chapter) return 1;
  if (position > chapter) return 0;
  return Math.max(clamp01(progress), MIN_FILL);
}

function SegmentFill({ fill }: { fill: number }) {
  const reduce = useReduceMotion();
  const ready = useAfterTransition();
  const width = useRef(new Animated.Value(fill)).current;

  useEffect(() => {
    if (!ready || reduce !== false) {
      width.setValue(fill);
      return;
    }
    const anim = Animated.timing(width, {
      toValue: fill,
      duration: PROGRESS_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
      isInteraction: false,
    });
    anim.start();
    return () => anim.stop();
  }, [fill, ready, reduce, width]);

  return (
    <View style={styles.track}>
      <Animated.View
        style={[
          styles.fill,
          {
            width: width.interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', '100%'],
            }),
          },
        ]}
      />
    </View>
  );
}

export function SegmentedProgress({ segments = 4, chapter, progress }: SegmentedProgressProps) {
  const count = Math.max(1, Math.floor(segments));
  const clamped = clamp01(progress);
  const now = Math.min(count, Math.max(0, chapter - 1 + clamped));

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Part ${chapter} of ${count}`}
      accessibilityValue={{ min: 0, max: count, now, text: `Part ${chapter} of ${count}` }}
      style={styles.row}
    >
      {Array.from({ length: count }, (_, index) => (
        <SegmentFill key={index} fill={fillFor(index, chapter, progress)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ob.size.progressGap,
    height: ob.size.progressHeight,
  },
  track: {
    flex: 1,
    minWidth: 0,
    height: ob.size.progressHeight,
    borderRadius: 3,
    backgroundColor: ob.color.line,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: ob.color.accent,
  },
});
