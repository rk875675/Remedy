import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { Pet } from '../../pet/Pet';
import { ob } from '../kit';
import { useAfterTransition } from '../../../lib/useAfterTransition';
import { useReduceMotion } from '../../../lib/useReduceMotion';

/**
 * Landscape behind the headline. Separate mounds overlap at different
 * sizes and heights. Trees sit in small groves and get bigger as they get closer.
 */
export function WelcomeStage() {
  const [box, setBox] = useState({ width: 0, height: 0 });

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.extend]}
      accessibilityLabel="Rolling hills, with the armadillo at different stages"
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        const next = { width: Math.round(width), height: Math.round(height) };
        setBox((current) => (current.width === next.width && current.height === next.height ? current : next));
      }}
    >
      {box.width > 0 && box.height > 0 ? <Scene width={box.width} height={box.height} /> : null}
    </View>
  );
}

const BEHIND_FOOTER = 260;

function Mounds({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      {children}
    </Svg>
  );
}

export function Tree({
  x,
  y,
  h,
  fill,
  opacity,
  lean = 0,
  spread = 1,
}: {
  x: number;
  y: number;
  h: number;
  fill: string;
  opacity: number;
  lean?: number;
  spread?: number;
}) {
  const crown = h * 0.74;
  const wide = crown * 0.58 * spread;
  const tall = crown * 0.5;
  const trunkTop = y - h * 0.2;
  const cx = x + lean;
  const cy = trunkTop - tall * 0.7;
  const trunk = Math.max(2.2, h * 0.065);
  return (
    <>
      <Ellipse cx={x + lean * 0.3} cy={y + 1} rx={wide * 0.42} ry={Math.max(2, h * 0.035)} fill="#243C2C" opacity={opacity * 0.16} />
      <Path
        d={`M ${x - trunk * 0.7} ${y} C ${x - trunk * 0.15} ${y - h * 0.08}, ${cx - trunk * 0.35} ${trunkTop}, ${cx} ${trunkTop - 1} C ${cx + trunk * 0.45} ${trunkTop}, ${x + trunk * 0.2} ${y - h * 0.06}, ${x + trunk * 0.85} ${y} Z`}
        fill="#6A5344"
        opacity={opacity * 0.9}
      />
      <Ellipse cx={cx - wide * 0.32} cy={cy + tall * 0.18} rx={wide * 0.58} ry={tall * 0.7} fill={fill} opacity={opacity} />
      <Ellipse cx={cx + wide * 0.3} cy={cy + tall * 0.26} rx={wide * 0.5} ry={tall * 0.62} fill={fill} opacity={opacity * 0.94} />
      <Ellipse cx={cx + lean * 0.15} cy={cy - tall * 0.22} rx={wide * 0.46} ry={tall * 0.56} fill={fill} opacity={opacity} />
      <Ellipse cx={cx - wide * 0.08} cy={cy - tall * 0.38} rx={wide * 0.24} ry={tall * 0.2} fill="#F7FBF4" opacity={opacity * 0.28} />
    </>
  );
}

function Scene({ width, height }: { width: number; height: number }) {
  const page = Math.max(height - BEHIND_FOOTER, height * 0.62);
  const hero = Math.round(Math.min(width * 0.4, page * 0.28));
  const s1 = Math.round(hero * 0.2);
  const s2 = Math.round(hero * 0.3);
  const s3 = Math.round(hero * 0.42);
  const s4 = Math.round(hero * 0.56);
  const farTop = page * 0.2;
  const midTop = page * 0.4;
  const nearTop = page * 0.58;

  return (
    <>
      <Sun left={width * 0.76} top={page * 0.012} size={30} />
      <Drift from={width * 0.08} top={page * 0.04} rx={34} ry={14} opacity={0.55} />
      <Drift from={width * 0.5} top={page * 0.01} rx={40} ry={16} delay={900} opacity={0.45} />
      <Flock width={width} top={page * 0.015} duration={14000} delay={0} birds={FLOCK_HIGH} />
      <Flock width={width} top={page * 0.07} duration={19000} delay={2800} birds={FLOCK_LOW} reverse />
      <Mounds width={width} height={height}>
        <Ellipse cx={width * 0.18} cy={page * 0.4} rx={width * 0.58} ry={page * 0.22} fill="#D7E8D4" />
        <Ellipse cx={width * 0.92} cy={page * 0.46} rx={width * 0.46} ry={page * 0.18} fill="#C3DCC4" />
        <Tree x={width * 0.07} y={farTop + 50} h={34} fill="#8FB59A" opacity={0.72} lean={-3} spread={1.05} />
        <Tree x={width * 0.15} y={farTop + 64} h={24} fill="#7EAA86" opacity={0.6} lean={2} spread={0.9} />
      </Mounds>
      <Bob left={width * 0.16} top={farTop - s1 * 0.2} size={s1} opacity={0.4} delay={0} lift={3}>
        <Pet stage={1} mood="idle" size={s1} shadow={false} />
      </Bob>
      <Mounds width={width} height={height}>
        <Ellipse cx={width * 0.32} cy={page * 0.64} rx={width * 0.72} ry={page * 0.26} fill="#A9CFAA" />
        <Ellipse cx={width * 1.02} cy={page * 0.7} rx={width * 0.42} ry={page * 0.18} fill="#8FB89A" />
        <Tree x={width * 0.84} y={midTop + 58} h={46} fill="#5E8F6C" opacity={0.78} lean={4} spread={1.08} />
        <Tree x={width * 0.93} y={midTop + 74} h={30} fill="#6E9A78" opacity={0.66} lean={-2} spread={0.92} />
      </Mounds>
      <Bob left={width * 0.72} top={midTop - s2 * 0.35} size={s2} opacity={0.55} delay={420} lift={4}>
        <Pet stage={2} mood="idle" size={s2} shadow={false} />
      </Bob>
      <Mounds width={width} height={height}>
        <Ellipse cx={width * 0.08} cy={height * 0.74} rx={width * 0.78} ry={height * 0.24} fill="#6D9A78" />
        <Ellipse cx={width * 0.7} cy={height * 0.82} rx={width * 0.82} ry={height * 0.28} fill={ob.color.accent} />
      </Mounds>
      <Mounds width={width} height={height}>
        <Tree x={width * 0.3} y={nearTop + page * 0.2} h={44} fill="#345C46" opacity={0.86} lean={3} spread={0.94} />
        <Tree x={width * 0.14} y={nearTop + page * 0.22} h={36} fill="#3D6A50" opacity={0.8} lean={-2} spread={1.02} />
        <Tree x={width * 0.86} y={nearTop + page * 0.16} h={66} fill="#2C5340" opacity={0.9} lean={5} spread={1.06} />
        <Tree x={width * 0.76} y={nearTop + page * 0.24} h={40} fill="#345C46" opacity={0.84} lean={-3} spread={0.9} />
      </Mounds>
      <Bob left={width * 0.04} top={nearTop + page * 0.02} size={s3} opacity={0.78} delay={180} lift={5}>
        <Pet stage={3} mood="idle" size={s3} shadow={false} />
      </Bob>
      <Bob left={width - s4 - width * 0.04} top={nearTop + page * 0.12} size={s4} opacity={0.92} delay={640} lift={6}>
        <Pet stage={4} mood="idle" size={s4} shadow={false} />
      </Bob>
      <View style={[styles.hero, { bottom: BEHIND_FOOTER - 6 }]}>
        <Pet stage={5} mood="celebrating" size={hero} shadow={false} accessibilityLabel="Fully grown armadillo" />
      </View>
    </>
  );
}

export function Drift({
  from,
  top,
  rx,
  ry,
  delay = 0,
  opacity = 0.5,
  still = false,
}: {
  from: number;
  top: number;
  rx: number;
  ry: number;
  delay?: number;
  opacity?: number;
  still?: boolean;
}) {
  const reduce = useReduceMotion();
  const ready = useAfterTransition();
  const x = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!ready || reduce !== false || still) {
      x.setValue(0);
      return;
    }
    const anim = Animated.sequence([
      Animated.delay(delay),
      Animated.loop(
        Animated.sequence([
          Animated.timing(x, { toValue: 1, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
          Animated.timing(x, { toValue: 0, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
        ]),
      ),
    ]);
    anim.start();
    return () => anim.stop();
  }, [ready, reduce, still, delay, x]);

  return (
    <Animated.View
      style={[
        styles.cloud,
        {
          left: from,
          top,
          opacity,
          transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, 14] }) }],
        },
      ]}
    >
      <Svg width={rx * 2.4} height={ry * 2.2}>
        <Ellipse cx={rx} cy={ry} rx={rx} ry={ry} fill="#FBF7F1" />
        <Ellipse cx={rx * 1.45} cy={ry * 0.85} rx={rx * 0.62} ry={ry * 0.8} fill="#FBF7F1" />
      </Svg>
    </Animated.View>
  );
}

function Bob({
  left,
  top,
  size,
  opacity,
  delay,
  lift,
  children,
}: {
  left: number;
  top: number;
  size: number;
  opacity: number;
  delay: number;
  lift: number;
  children: ReactNode;
}) {
  const reduce = useReduceMotion();
  const ready = useAfterTransition();
  const y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!ready || reduce !== false) {
      y.setValue(0);
      return;
    }
    const anim = Animated.sequence([
      Animated.delay(delay),
      Animated.loop(
        Animated.sequence([
          Animated.timing(y, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
          Animated.timing(y, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
        ]),
      ),
    ]);
    anim.start();
    return () => anim.stop();
  }, [ready, reduce, delay, y]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left,
        top,
        width: size,
        height: size,
        opacity,
        transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, -lift] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

function useLoop(delay: number, duration: number): Animated.Value {
  const reduce = useReduceMotion();
  const ready = useAfterTransition();
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!ready || reduce !== false) {
      value.setValue(0);
      return;
    }
    const anim = Animated.sequence([
      Animated.delay(delay),
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, {
            toValue: 1,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
            isInteraction: false,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
            isInteraction: false,
          }),
        ]),
      ),
    ]);
    anim.start();
    return () => anim.stop();
  }, [ready, reduce, delay, duration, value]);

  return value;
}

function Sun({ left, top, size }: { left: number; top: number; size: number }) {
  const glow = useLoop(0, 2800);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left,
        top,
        opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }),
        transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }],
      }}
    >
      <Svg width={size * 3.2} height={size * 3.2}>
        <Circle cx={size * 1.6} cy={size * 1.6} r={size * 1.35} fill="#F6E6C0" opacity={0.28} />
        <Circle cx={size * 1.6} cy={size * 1.6} r={size * 0.72} fill="#F3D7A0" opacity={0.85} />
      </Svg>
    </Animated.View>
  );
}

const FLOCK_HIGH = [
  { dx: 0, dy: 10, size: 14 },
  { dx: 22, dy: 0, size: 12 },
  { dx: 40, dy: 12, size: 13 },
  { dx: 58, dy: 3, size: 11 },
  { dx: 18, dy: 18, size: 10 },
];

const FLOCK_LOW = [
  { dx: 0, dy: 6, size: 16 },
  { dx: 26, dy: 16, size: 13 },
  { dx: 48, dy: 0, size: 14 },
  { dx: 68, dy: 12, size: 12 },
];

function useFly(delay: number, duration: number): Animated.Value {
  const reduce = useReduceMotion();
  const ready = useAfterTransition();
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!ready || reduce !== false) {
      value.setValue(reduce === true ? 0.4 : 0);
      return;
    }
    value.setValue(0);
    const anim = Animated.sequence([
      Animated.delay(delay),
      Animated.loop(
        Animated.timing(value, {
          toValue: 1,
          duration,
          easing: Easing.linear,
          useNativeDriver: true,
          isInteraction: false,
        }),
      ),
    ]);
    anim.start();
    return () => anim.stop();
  }, [ready, reduce, delay, duration, value]);

  return value;
}

function Flock({
  width,
  top,
  duration,
  delay,
  birds,
  reverse = false,
}: {
  width: number;
  top: number;
  duration: number;
  delay: number;
  birds: { dx: number; dy: number; size: number }[];
  reverse?: boolean;
}) {
  const fly = useFly(delay, duration);
  const bob = useLoop(delay, 900);
  const from = reverse ? width + 24 : -90;
  const to = reverse ? -90 : width + 24;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top,
        left: 0,
        opacity: 0.55,
        transform: [
          { translateX: fly.interpolate({ inputRange: [0, 1], outputRange: [from, to] }) },
          { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -7] }) },
        ],
      }}
    >
      {birds.map((bird) => {
        const wing = `M 1 ${bird.size * 0.55} Q ${bird.size * 0.4} ${bird.size * 0.05}, ${bird.size * 0.72} ${bird.size * 0.4} Q ${bird.size * 1.05} ${bird.size * 0.02}, ${bird.size * 1.4} ${bird.size * 0.58}`;
        return (
          <Svg
            key={`${bird.dx}-${bird.dy}`}
            width={bird.size * 1.6}
            height={bird.size}
            style={{ position: 'absolute', left: bird.dx, top: bird.dy }}
          >
            <Path d={wing} stroke="#8C8376" strokeWidth={1.4} fill="none" strokeLinecap="round" />
          </Svg>
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  extend: {
    bottom: -BEHIND_FOOTER,
  },
  cloud: {
    position: 'absolute',
  },
  hero: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});
