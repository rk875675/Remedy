import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useAfterTransition } from '../../../lib/useAfterTransition';
import { useReduceMotion } from '../../../lib/useReduceMotion';
import { Icon } from './Icon';
import { ob, obType } from './tokens';

type ProgressState = 'pending' | 'active' | 'done';

type ProgressRowProps = {
  label: string;
  sub?: string;
  state: ProgressState;
  /** 0 to 100, shown while the row is active. */
  percent?: number;
};

function clampPercent(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/** One line of the plan loader: waiting, filling, or checked. */
export function ProgressRow({ label, sub, state, percent }: ProgressRowProps) {
  const reduce = useReduceMotion();
  const ready = useAfterTransition();
  const [trackW, setTrackW] = useState(0);
  const fill = useRef(new Animated.Value(0)).current;
  const shown = clampPercent(percent);
  const caption = state === 'active' || state === 'done' ? sub : undefined;

  useEffect(() => {
    if (state !== 'active') return;
    const target = trackW * (shown / 100);
    if (reduce !== false || !ready) {
      fill.setValue(target);
      return;
    }
    Animated.timing(fill, {
      toValue: target,
      duration: ob.motion.base,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
      isInteraction: false,
    }).start();
  }, [state, shown, trackW, reduce, ready, fill]);

  return (
    <View
      accessibilityRole={state === 'active' ? 'progressbar' : 'text'}
      accessibilityLabel={caption ? `${label}. ${caption}` : label}
      accessibilityValue={
        state === 'active' ? { min: 0, max: 100, now: Math.round(shown) } : undefined
      }
    >
      <View style={styles.top}>
        <Text
          style={[
            styles.label,
            state === 'pending' && { color: ob.color.disabledText },
          ]}
        >
          {label}
        </Text>
        {state === 'active' ? (
          <Text style={styles.percent}>{`${Math.round(shown)}%`}</Text>
        ) : null}
        {state === 'done' ? (
          <View style={styles.check}>
            <Icon name="checkmark" size={14} color={ob.color.surface} />
          </View>
        ) : null}
      </View>
      {state === 'active' ? (
        <View
          style={styles.track}
          onLayout={(event) => setTrackW(event.nativeEvent.layout.width)}
        >
          <Animated.View style={[styles.fill, { width: fill }]} />
        </View>
      ) : null}
      {caption ? <Text style={styles.sub}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  top: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  label: {
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    color: ob.color.ink,
  },
  percent: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    color: ob.color.accent,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: ob.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    marginTop: 10,
    height: ob.size.progressHeight,
    borderRadius: ob.size.progressHeight / 2,
    backgroundColor: ob.color.accentSoft,
    overflow: 'hidden',
  },
  fill: {
    height: ob.size.progressHeight,
    borderRadius: ob.size.progressHeight / 2,
    backgroundColor: ob.color.accent,
  },
  sub: {
    ...obType.caption,
    marginTop: 6,
    fontWeight: '400',
  },
});
