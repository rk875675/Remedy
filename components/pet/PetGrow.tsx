import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import type { PetMood, PetStage } from '../../constants/petImages';
import { hapticSuccess } from '../../lib/haptics';
import { useReduceMotion } from '../../lib/useReduceMotion';
import { PetBadge } from './PetBadge';
import {
  call,
  createPetBody,
  moveJumpSpin,
  petBodyStyles,
  restBody,
  type PetBody,
} from './petMotion';

const CREAM = '#F6EDE0';
const TERRACOTTA = '#AE5636';
const DOTS = 8;

const rise = Easing.out(Easing.quad);
const fall = Easing.in(Easing.quad);
const smooth = Easing.inOut(Easing.sin);

function timing(
  value: Animated.Value,
  toValue: number,
  duration: number,
  easing: (t: number) => number,
): Animated.CompositeAnimation {
  return Animated.timing(value, { toValue, duration, easing, useNativeDriver: true });
}

type PetGrowProps = {
  from: PetStage;
  to: PetStage;
  mood: PetMood;
  size: number;
  onDone?: () => void;
};

/**
 * Plays the pet growing from one stage to the next, once.
 * Overlays sit absolute so the badge keeps its footprint.
 */
export function PetGrow({ from, to, mood, size, onDone }: PetGrowProps) {
  const reduce = useReduceMotion();
  const [stage, setStage] = useState<PetStage>(reduce === true ? to : from);
  const done = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const bodyRef = useRef<PetBody | null>(null);
  if (bodyRef.current === null) bodyRef.current = createPetBody();
  const body = bodyRef.current;

  const scale = useRef(new Animated.Value(1)).current;
  const shudder = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;

  const bodyStyles = useMemo(
    () => petBodyStyles(body, { height: size, hop: size * 0.13 }),
    [body, size],
  );
  const footY = useMemo(
    () => scale.interpolate({ inputRange: [0, 1], outputRange: [size / 2, 0] }),
    [scale, size],
  );
  const shudderX = useMemo(
    () => shudder.interpolate({ inputRange: [-1, 1], outputRange: [-5, 5] }),
    [shudder],
  );
  const flashOpacity = useMemo(
    () => flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.92] }),
    [flash],
  );
  const ringScale = useMemo(
    () => ring.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1.65] }),
    [ring],
  );
  const ringOpacity = useMemo(
    () => ring.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.85, 0] }),
    [ring],
  );
  const burstOpacity = useMemo(
    () => burst.interpolate({ inputRange: [0, 0.08, 1], outputRange: [0, 1, 0] }),
    [burst],
  );
  const dots = useMemo(() => {
    const dist = size * 0.75;
    return Array.from({ length: DOTS }, (_, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / DOTS;
      return {
        color: i % 2 === 0 ? CREAM : TERRACOTTA,
        x: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * dist] }),
        y: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * dist] }),
      };
    });
  }, [burst, size]);

  useLayoutEffect(() => {
    if (reduce !== true) return;
    scale.setValue(1);
    shudder.setValue(0);
    flash.setValue(0);
    ring.setValue(0);
    burst.setValue(0);
    setStage(to);
  }, [reduce, to]);

  useEffect(() => {
    if (reduce !== true || done.current) return;
    done.current = true;
    onDoneRef.current?.();
  }, [reduce]);

  useEffect(() => {
    if (reduce !== false || done.current) return;
    let live = true;
    setStage(from);
    scale.setValue(1);
    shudder.setValue(0);
    flash.setValue(0);
    ring.setValue(0);
    burst.setValue(0);
    restBody(body);

    const wobble = (amp: number, peak: number, half: number) => {
      const step = Math.max(30, Math.round(half * 0.5));
      return Animated.parallel([
        Animated.sequence([timing(scale, peak, half, rise), timing(scale, 1, half, fall)]),
        Animated.sequence([
          timing(shudder, amp, step, rise),
          timing(shudder, -amp, half, smooth),
          timing(shudder, 0, Math.max(30, half - step), fall),
        ]),
      ]);
    };

    const anim = Animated.sequence([
      Animated.delay(500),
      wobble(0.55, 1.05, 80),
      wobble(0.8, 1.09, 60),
      wobble(1, 1.14, 45),
      Animated.parallel([timing(flash, 1, 120, rise), timing(ring, 0.4, 120, rise)]),
      call(() => {
        if (!live) return;
        setStage(to);
        hapticSuccess();
      }),
      // Native snap so the spring starts from 0.8. setValue after a native
      // timing can be ignored until the next frame.
      timing(scale, 0.8, 1, Easing.linear),
      Animated.parallel([
        timing(flash, 0, 220, Easing.out(Easing.quad)),
        timing(ring, 1, 320, rise),
        Animated.spring(scale, {
          toValue: 1,
          speed: 14,
          bounciness: 7,
          restDisplacementThreshold: 0.01,
          restSpeedThreshold: 0.01,
          useNativeDriver: true,
        }),
        timing(burst, 1, 520, Easing.out(Easing.cubic)),
      ]),
      moveJumpSpin(body),
    ]);

    anim.start(({ finished }) => {
      if (!live || !finished || done.current) return;
      done.current = true;
      onDoneRef.current?.();
    });

    return () => {
      live = false;
      anim.stop();
      restBody(body);
    };
  }, [reduce, from, to, body, scale, shudder, flash, ring, burst]);

  const disc = size * 0.86;
  const dot = Math.max(6, Math.round(size * 0.045));
  const discFrame = {
    position: 'absolute' as const,
    left: (size - disc) / 2,
    bottom: 0,
    width: disc,
    height: disc,
    borderRadius: disc / 2,
  };

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        pointerEvents="none"
        style={[
          discFrame,
          {
            borderWidth: Math.max(2, Math.round(size * 0.018)),
            borderColor: CREAM,
            opacity: ringOpacity,
            transform: [{ scale: ringScale }],
          },
        ]}
      />
      <Animated.View style={[bodyStyles.mover, { width: size, height: size }]}>
        <Animated.View style={[bodyStyles.squash, { width: size, height: size }]}>
          <Animated.View style={{ transform: [{ translateX: shudderX }, { translateY: footY }, { scale }] }}>
            <PetBadge key={stage} stage={stage} mood={mood} size={size} />
          </Animated.View>
        </Animated.View>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[discFrame, { backgroundColor: CREAM, opacity: flashOpacity }]}
      />
      {dots.map((dotAnim, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: (size - dot) / 2,
            top: (size - dot) / 2,
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            backgroundColor: dotAnim.color,
            opacity: burstOpacity,
            transform: [{ translateX: dotAnim.x }, { translateY: dotAnim.y }],
          }}
        />
      ))}
    </View>
  );
}
