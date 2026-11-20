import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useAfterTransition } from '../../../lib/useAfterTransition';
import { useReduceMotion } from '../../../lib/useReduceMotion';
import { ob } from './tokens';

type NsLevel = 'low' | 'some' | 'high';

type NsDialProps = {
  level: NsLevel;
  /** Sweep the hand in from Quiet once this becomes true. */
  play: boolean;
  size?: number;
};

const LEVEL_INDEX: Record<NsLevel, 0 | 1 | 2> = { low: 0, some: 1, high: 2 };

const LEVEL_LABEL: Record<NsLevel, string> = {
  low: 'Quiet',
  some: 'Partly turned up',
  high: 'Turned up',
};

/** Arc runs left → over the top → right. Degrees are math angles (0 = east). */
const SWEEP_START = 202;
const SWEEP_END = -22;
const GAP = 14;
const ZONE_SPAN = (SWEEP_START - SWEEP_END - GAP * 2) / 3;

const ZONE_INK = [ob.color.accent, ob.color.warn, ob.color.clay] as const;
const ZONE_WASH = ['#C5DDD0', '#F6DCA8', '#F0C6B4'] as const;

function zoneBounds(index: number): { a0: number; a1: number } {
  const a0 = SWEEP_START - index * (ZONE_SPAN + GAP);
  return { a0, a1: a0 - ZONE_SPAN };
}

/** Clock-hand degrees. 0 points up, positive is clockwise. */
function handForZone(index: number): number {
  const { a0, a1 } = zoneBounds(index);
  return 90 - (a0 + a1) / 2;
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy - r * Math.sin(rad),
  };
}

/** Decreasing angle, sweep flag 1: left, over the top, toward the right. */
function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p0 = polar(cx, cy, r, a0);
  const p1 = polar(cx, cy, r, a1);
  const large = Math.abs(a0 - a1) > 180 ? 1 : 0;
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

/**
 * Round clock. The hand rests on Quiet, then sweeps to this person's level.
 * The destination zone lights up and the hub taps once it lands.
 */
export function NsDial({ level, play, size = 176 }: NsDialProps) {
  const reduce = useReduceMotion();
  const ready = useAfterTransition();
  const enter = useRef(new Animated.Value(0)).current;
  const travel = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const hub = useRef(new Animated.Value(1)).current;
  const hop = useRef(new Animated.Value(0)).current;

  const index = LEVEL_INDEX[level];
  const quietHand = handForZone(0);
  const from = level === 'low' ? quietHand - 28 : quietHand;
  const to = handForZone(index);
  const distance = Math.abs(to - from);
  const sweepMs = Math.min(1280, Math.round(620 + distance * 4.4));

  useEffect(() => {
    if (reduce === null) return;
    if (reduce) {
      enter.setValue(1);
      travel.setValue(1);
      glow.setValue(1);
      hub.setValue(1);
      hop.setValue(0);
      return;
    }
    if (!play || !ready) {
      enter.setValue(0);
      travel.setValue(0);
      glow.setValue(0);
      hub.setValue(1);
      hop.setValue(0);
      return;
    }

    enter.setValue(0);
    travel.setValue(0);
    glow.setValue(0);
    hub.setValue(1);
    hop.setValue(0);

    const motion = Animated.sequence([
      Animated.spring(enter, {
        toValue: 1,
        tension: 64,
        friction: 8,
        useNativeDriver: true,
        isInteraction: false,
      }),
      Animated.parallel([
        Animated.sequence([
          Animated.timing(travel, {
            toValue: 1.08,
            duration: Math.round(sweepMs * 0.72),
            delay: 180,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
            isInteraction: false,
          }),
          Animated.spring(travel, {
            toValue: 1,
            tension: 170,
            friction: 6,
            useNativeDriver: true,
            isInteraction: false,
          }),
        ]),
        Animated.sequence([
          Animated.delay(180),
          Animated.timing(hop, {
            toValue: 1,
            duration: 240,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
            isInteraction: false,
          }),
          Animated.spring(hop, {
            toValue: 0,
            tension: 140,
            friction: 5,
            useNativeDriver: true,
            isInteraction: false,
          }),
        ]),
      ]),
      Animated.parallel([
        Animated.timing(glow, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.sequence([
          Animated.timing(hub, {
            toValue: 1.18,
            duration: 140,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
            isInteraction: false,
          }),
          Animated.spring(hub, {
            toValue: 1,
            tension: 160,
            friction: 6,
            useNativeDriver: true,
            isInteraction: false,
          }),
        ]),
      ]),
    ]);
    motion.start();
    return () => motion.stop();
  }, [play, ready, reduce, level, from, to, sweepMs, enter, travel, glow, hub, hop]);

  const stroke = Math.round(size * 0.11);
  const ringR = size * 0.34;
  const cx = size / 2;
  const cy = size / 2;
  const cap = (stroke / 2 / ringR) * (180 / Math.PI) + 3;
  const reach = ringR - stroke / 2 - 8;

  const enterScale = enter.interpolate({
    inputRange: [0, 1],
    outputRange: [0.86, 1],
  });
  const hopScale = hop.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.05],
  });
  const scale = Animated.multiply(enterScale, hopScale);
  const hopY = hop.interpolate({
    inputRange: [-0.4, 0, 1],
    outputRange: [5, 0, -12],
  });
  const tilt = hop.interpolate({
    inputRange: [-0.4, 0, 1],
    outputRange: ['1.5deg', '0deg', '-2.5deg'],
  });
  const rotate = travel.interpolate({
    inputRange: [0, 1],
    outputRange: [`${from}deg`, `${to}deg`],
    extrapolate: 'extend',
  });

  const zones = [0, 1, 2].map((zone) => {
    const bounds = zoneBounds(zone);
    return {
      key: zone,
      d: arcPath(cx, cy, ringR, bounds.a0 - cap, bounds.a1 + cap),
      wash: ZONE_WASH[zone],
      ink: ZONE_INK[zone],
    };
  });
  const active = zones[index];

  return (
    <Animated.View
      accessibilityRole="image"
      accessibilityLabel={LEVEL_LABEL[level]}
      style={{
        width: size,
        height: size,
        opacity: enter,
        transform: [{ translateY: hopY }, { rotate: tilt }, { scale }],
      }}
    >
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={ringR} stroke={ob.color.line} strokeWidth={stroke} fill={ob.color.surface} />
        {zones.map((zone) => (
          <Path
            key={zone.key}
            d={zone.d}
            stroke={zone.wash}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
          />
        ))}
      </Svg>
      {active ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: glow }]}>
          <Svg width={size} height={size}>
            <Path
              d={active.d}
              stroke={active.ink}
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
        </Animated.View>
      ) : null}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: reach * 2,
          height: reach * 2,
          left: cx - reach,
          top: cy - reach,
          alignItems: 'center',
          transform: [{ rotate }],
        }}
      >
        <View
          style={{
            position: 'absolute',
            top: 0,
            width: 11,
            height: 11,
            borderRadius: 6,
            backgroundColor: ob.color.ink,
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: 8,
            width: 4,
            height: reach - 18,
            borderRadius: 2,
            backgroundColor: ob.color.ink,
          }}
        />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: cx - 8,
          top: cy - 8,
          width: 16,
          height: 16,
          borderRadius: 8,
          backgroundColor: ob.color.surface,
          borderWidth: 2.5,
          borderColor: ob.color.ink,
          transform: [{ scale: hub }],
        }}
      />
    </Animated.View>
  );
}
