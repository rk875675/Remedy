import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { petImage, petScale } from '../../../constants/petImages';
import { hapticHeavy, hapticSelection, hapticSuccess } from '../../../lib/haptics';
import { Pet } from '../../pet/Pet';
import { call } from '../../pet/petMotion';

/**
 * Meet open. The ball shakes three times, each harder than the last, splits
 * down the middle, the halves fall away, and the excited armadillo springs
 * up out of the light.
 */

const GLOW = '#FFE2A8';

type Phase = 'asleep' | 'hatching' | 'out';

type MeetHatchProps = {
  size: number;
  open: boolean;
  instant: boolean;
  onArrive: () => void;
  onDone: () => void;
};

const native = { useNativeDriver: true } as const;

function to(value: Animated.Value, toValue: number, duration: number, easing: (t: number) => number) {
  return Animated.timing(value, { toValue, duration, easing, ...native });
}

const wobble = Easing.inOut(Easing.sin);

/** One shake: a quick side-to-side wobble that dies back to centre. */
function shake(rock: Animated.Value, power: number) {
  return Animated.sequence([
    to(rock, power, 55, wobble),
    to(rock, -power, 90, wobble),
    to(rock, power * 0.6, 80, wobble),
    to(rock, -power * 0.3, 70, wobble),
    to(rock, 0, 60, wobble),
  ]);
}

export function MeetHatch({ size, open, instant, onArrive, onDone }: MeetHatchProps) {
  const cues = useRef({ onArrive, onDone });
  cues.current = { onArrive, onDone };

  const [phase, setPhase] = useState<Phase>('asleep');

  const rock = useRef(new Animated.Value(0)).current;
  const hop = useRef(new Animated.Value(0)).current;
  const split = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!open) return;
    if (instant) {
      setPhase('out');
      return;
    }

    rock.setValue(0);
    hop.setValue(0);
    split.setValue(0);
    glow.setValue(0);
    rise.setValue(0);
    setPhase('hatching');
  }, [open, instant, rock, hop, split, glow, rise]);

  useEffect(() => {
    if (phase !== 'hatching') return;
    let live = true;

    const bump = (power: number) =>
      Animated.parallel([
        shake(rock, power),
        Animated.sequence([to(hop, power * 0.004, 90, Easing.out(Easing.quad)), to(hop, 0, 120, Easing.in(Easing.quad))]),
      ]);

    const anim = Animated.sequence([
      call(() => hapticSelection()),
      bump(5),
      Animated.delay(260),
      call(() => hapticSelection()),
      bump(8),
      Animated.delay(200),
      call(() => hapticSelection()),
      bump(12),
      Animated.delay(120),
      call(() => {
        if (!live) return;
        hapticHeavy();
        cues.current.onArrive();
      }),
      Animated.parallel([
        to(split, 1, 520, Easing.out(Easing.cubic)),
        Animated.sequence([to(glow, 1, 120, Easing.out(Easing.quad)), to(glow, 0, 700, Easing.inOut(Easing.sin))]),
        Animated.sequence([
          Animated.delay(60),
          Animated.spring(rise, { toValue: 1, speed: 13, bounciness: 9, ...native }),
        ]),
        Animated.sequence([
          Animated.delay(220),
          call(() => hapticSuccess()),
        ]),
      ]),
      call(() => {
        if (!live) return;
        setPhase('out');
        cues.current.onDone();
      }),
    ]);

    anim.start();
    return () => {
      live = false;
      anim.stop();
    };
  }, [phase, rock, hop, split, glow, rise]);

  const ballDrawn = size * petScale(1, 'idle');
  const ballLeft = (size - ballDrawn) / 2;
  const half = size / 2;
  const glowSize = size * 2.2;
  const petDrawn = size * petScale(5, 'celebrating');

  if (phase === 'asleep') {
    return <Pet stage={1} mood="idle" size={size} shadow={false} accessibilityLabel="Sleeping armadillo" />;
  }
  if (phase === 'out') {
    return <Pet stage={5} mood="celebrating" size={size} shadow={false} accessibilityLabel="Your armadillo" />;
  }

  const ballMotion = {
    transform: [
      { translateY: size / 2 },
      { rotate: rock.interpolate({ inputRange: [-12, 12], outputRange: ['-12deg', '12deg'] }) },
      { translateY: -size / 2 },
      { translateY: hop.interpolate({ inputRange: [0, 1], outputRange: [0, -size]}) },
    ],
  };

  const halfStyle = (side: -1 | 1) => ({
    position: 'absolute' as const,
    top: 0,
    left: side === -1 ? 0 : half,
    width: half,
    height: size,
    overflow: 'hidden' as const,
    opacity: split.interpolate({ inputRange: [0, 0.55, 1], outputRange: [1, 1, 0] }),
    transform: [
      { translateX: split.interpolate({ inputRange: [0, 1], outputRange: [0, side * size * 0.42] }) },
      { translateY: split.interpolate({ inputRange: [0, 1], outputRange: [0, size * 0.08] }) },
      { rotate: split.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${side * 28}deg`] }) },
    ],
  });

  return (
    <View pointerEvents="none" style={{ width: size, height: size }} accessibilityLabel="Your armadillo">
      <Animated.View
        style={{
          position: 'absolute',
          width: glowSize,
          height: glowSize,
          left: (size - glowSize) / 2,
          top: size * 0.62 - glowSize / 2,
          opacity: glow,
          transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
        }}
      >
        <Svg width={glowSize} height={glowSize}>
          <Defs>
            <RadialGradient id="meetGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={GLOW} stopOpacity="1" />
              <Stop offset="0.45" stopColor={GLOW} stopOpacity="0.35" />
              <Stop offset="1" stopColor={GLOW} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={glowSize / 2} cy={glowSize / 2} r={glowSize / 2} fill="url(#meetGlow)" />
        </Svg>
      </Animated.View>

      <Animated.Image
        source={petImage(5, 'celebrating')}
        resizeMode="contain"
        fadeDuration={0}
        style={{
          position: 'absolute',
          bottom: 0,
          left: (size - petDrawn) / 2,
          width: petDrawn,
          height: petDrawn,
          opacity: rise.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
          transform: [
            { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [petDrawn * 0.3, 0] }) },
            { scale: rise.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) },
          ],
        }}
      />

      <Animated.View style={[{ position: 'absolute', width: size, height: size }, ballMotion]}>
        {([-1, 1] as const).map((side) => (
          <Animated.View key={side} style={halfStyle(side)}>
            <Animated.Image
              source={petImage(1, 'idle')}
              resizeMode="contain"
              fadeDuration={0}
              style={{
                position: 'absolute',
                bottom: 0,
                left: side === -1 ? ballLeft : ballLeft - half,
                width: ballDrawn,
                height: ballDrawn,
              }}
            />
          </Animated.View>
        ))}
      </Animated.View>
    </View>
  );
}
