import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { shadows } from '../../../constants/shadows';
import { hapticSelection } from '../../../lib/haptics';
import { useReduceMotion } from '../../../lib/useReduceMotion';
import { ob, obType } from './tokens';

type SliderProps = {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  leftLabel?: string;
  rightLabel?: string;
  /** Track and thumb colour for the current value. Falls back to accent. */
  tint?: (value: number) => string;
};

const THUMB = 36;
const HIT = 48;

function decimals(step: number): number {
  const text = step.toString().toLowerCase();
  if (text.includes('e-')) {
    const exp = Number(text.split('e-')[1]);
    return Number.isFinite(exp) ? exp : 0;
  }
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

function snapToStep(min: number, max: number, step: number, raw: number): number {
  if (!(step > 0) || !(max > min)) return min;
  const steps = Math.round((raw - min) / step);
  const maxSteps = Math.round((max - min) / step);
  const clamped = Math.min(maxSteps, Math.max(0, steps));
  return Number((min + clamped * step).toFixed(decimals(step)));
}

function ratioOf(value: number, min: number, max: number): number {
  if (!(max > min)) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

/**
 * Stepped slider. PanResponder covers mouse drag on web and touch on native.
 * The thumb ignores hits so locationX stays relative to the track.
 */
export function Slider({
  min,
  max,
  step = 1,
  value,
  onChange,
  leftLabel,
  rightLabel,
  tint,
}: SliderProps) {
  const reduce = useReduceMotion();
  const [trackW, setTrackW] = useState(0);
  const widthRef = useRef(0);
  const last = useRef(value);
  const grantX = useRef(0);
  const scale = useRef(new Animated.Value(1)).current;
  const reduceRef = useRef(reduce);
  reduceRef.current = reduce;
  const propsRef = useRef({ min, max, step, onChange });
  propsRef.current = { min, max, step, onChange };

  useEffect(() => {
    last.current = value;
  }, [value]);

  function setScale(to: number) {
    if (reduceRef.current) {
      scale.setValue(to);
      return;
    }
    Animated.spring(scale, {
      toValue: to,
      tension: ob.motion.spring.tension,
      friction: ob.motion.spring.friction,
      useNativeDriver: true,
    }).start();
  }

  const applyRef = useRef<(x: number) => void>(() => {});
  applyRef.current = (x: number) => {
    const width = widthRef.current;
    const current = propsRef.current;
    if (width <= THUMB) return;
    const ratio = Math.min(1, Math.max(0, (x - THUMB / 2) / (width - THUMB)));
    const next = snapToStep(
      current.min,
      current.max,
      current.step,
      current.min + ratio * (current.max - current.min),
    );
    if (next !== last.current) {
      last.current = next;
      hapticSelection();
      current.onChange(next);
    }
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        grantX.current = event.nativeEvent.locationX;
        setScale(1.12);
        applyRef.current(grantX.current);
      },
      onPanResponderMove: (_event, gesture) => {
        applyRef.current(grantX.current + gesture.dx);
      },
      onPanResponderRelease: () => setScale(1),
      onPanResponderTerminate: () => setScale(1),
    }),
  ).current;

  function nudge(delta: number) {
    const next = snapToStep(min, max, step, value + delta);
    if (next !== value) {
      hapticSelection();
      onChange(next);
    }
  }

  const tintColor = tint?.(value) ?? ob.color.accent;
  const ratio = ratioOf(value, min, max);
  const travel = Math.max(0, trackW - THUMB);
  const thumbLeft = ratio * travel;
  const fillW = trackW === 0 ? 0 : THUMB / 2 + ratio * travel;
  const intervals = step > 0 && max > min ? Math.round((max - min) / step) : 0;
  const showTicks = Number.isFinite(intervals) && intervals > 0 && intervals <= 40;

  return (
    <View>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel={
          leftLabel && rightLabel ? `${leftLabel} to ${rightLabel}` : 'Value'
        }
        accessibilityValue={{ min, max, now: value, text: String(value) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'increment') nudge(step);
          if (event.nativeEvent.actionName === 'decrement') nudge(-step);
        }}
        style={styles.hit}
        onLayout={(event) => {
          const width = event.nativeEvent.layout.width;
          widthRef.current = width;
          setTrackW(width);
        }}
        {...pan.panHandlers}
      >
        <View style={styles.track}>
          <View style={[styles.fill, { width: fillW, backgroundColor: tintColor }]} />
        </View>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thumb,
            shadows.medium,
            {
              left: thumbLeft,
              borderColor: tintColor,
              transform: [{ scale }],
            },
          ]}
        />
      </View>
      {showTicks ? (
        <View style={styles.ticks} pointerEvents="none">
          {Array.from({ length: intervals + 1 }, (_, index) => {
            const tickRatio = index / intervals;
            const center = THUMB / 2 + tickRatio * travel;
            const on = tickRatio <= ratio + 0.001;
            return (
              <View
                key={index}
                style={[
                  styles.tick,
                  {
                    left: center - 2,
                    backgroundColor: on ? tintColor : ob.color.line,
                  },
                ]}
              />
            );
          })}
        </View>
      ) : null}
      {leftLabel || rightLabel ? (
        <View style={styles.labels}>
          <Text style={styles.label}>{leftLabel ?? ''}</Text>
          <Text style={[styles.label, styles.labelRight]}>{rightLabel ?? ''}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hit: {
    height: HIT,
    justifyContent: 'center',
    cursor: 'pointer',
  },
  track: {
    height: 10,
    borderRadius: 5,
    backgroundColor: ob.color.line,
    overflow: 'hidden',
  },
  fill: {
    height: 10,
    borderRadius: 5,
  },
  thumb: {
    position: 'absolute',
    top: (HIT - THUMB) / 2,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: ob.color.surface,
    borderWidth: 1.5,
  },
  ticks: {
    height: 10,
    marginTop: 2,
  },
  tick: {
    position: 'absolute',
    top: 2,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 4,
  },
  label: {
    ...obType.caption,
    flex: 1,
  },
  labelRight: {
    textAlign: 'right',
  },
});
