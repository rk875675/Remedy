import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { motion } from '../../constants/typography';
import { petImage, petScale, type PetMood, type PetStage } from '../../constants/petImages';

type PetProps = {
  stage: PetStage;
  mood: PetMood;
  size: number;
  shadow?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
};

type Pose = { stage: PetStage; mood: PetMood };

const BREATH_Y = 0.025;
const BREATH_X = 0.01;
const POP_FROM = 0.94;
const HOP_HEIGHT = 0.08;

export function Pet({
  stage,
  mood,
  size,
  shadow = true,
  onPress,
  accessibilityLabel,
}: PetProps) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const reduceMotionRef = useRef(false);
  const mounted = useRef(true);

  const [previous, setPrevious] = useState<Pose | null>(null);
  const lastPose = useRef<Pose>({ stage, mood });

  const breath = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const hop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    mounted.current = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!mounted.current) return;
      reduceMotionRef.current = enabled;
      setReduceMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      reduceMotionRef.current = enabled;
      setReduceMotion(enabled);
    });
    return () => {
      mounted.current = false;
      sub.remove();
    };
  }, []);

  // Crossfade to the new pose. Layout effect so the incoming image never paints at full opacity first.
  useLayoutEffect(() => {
    const last = lastPose.current;
    if (last.stage === stage && last.mood === mood) return;
    lastPose.current = { stage, mood };

    if (reduceMotionRef.current || petImage(last.stage, last.mood) === petImage(stage, mood)) {
      fade.setValue(1);
      pop.setValue(1);
      setPrevious(null);
      return;
    }

    fade.setValue(0);
    pop.setValue(POP_FROM);
    setPrevious(last);
    const anim = Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: motion.standard,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(pop, {
        toValue: 1,
        useNativeDriver: true,
        speed: 18,
        bounciness: 6,
      }),
    ]);
    anim.start(({ finished }) => {
      if (finished && mounted.current) setPrevious(null);
    });
    return () => anim.stop();
  }, [stage, mood, fade, pop]);

  useEffect(() => {
    breath.setValue(0);
    if (reduceMotion) return;
    const half = (mood === 'sleepy' ? 3600 : 2600) / 2;
    const ease = Easing.inOut(Easing.sin);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: half, easing: ease, useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: half, easing: ease, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      breath.setValue(0);
    };
  }, [mood, reduceMotion, breath]);

  useEffect(() => {
    hop.setValue(0);
    if (mood !== 'celebrating' || reduceMotionRef.current) return;
    const up = { toValue: 1, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: true };
    const down = { toValue: 0, duration: 170, easing: Easing.in(Easing.quad), useNativeDriver: true };
    const hops = Animated.sequence([
      Animated.timing(hop, up),
      Animated.timing(hop, down),
      Animated.delay(60),
      Animated.timing(hop, up),
      Animated.timing(hop, down),
    ]);
    hops.start();
    return () => {
      hops.stop();
      hop.setValue(0);
    };
  }, [mood, hop]);

  function handlePress() {
    if (!reduceMotionRef.current) {
      pop.setValue(POP_FROM);
      Animated.spring(pop, {
        toValue: 1,
        useNativeDriver: true,
        speed: 18,
        bounciness: 8,
      }).start();
    }
    onPress?.();
  }

  const drawn = size * petScale(stage, mood);
  const shadowWidth = drawn * 0.55;
  const shadowHeight = drawn * 0.07;

  // Scaling happens about the box centre; these translations keep the bottom edge (the feet) planted.
  const breathTransform = [
    { translateY: hop.interpolate({ inputRange: [0, 1], outputRange: [0, -size * HOP_HEIGHT] }) },
    { translateY: breath.interpolate({ inputRange: [0, 1], outputRange: [0, (-size * BREATH_Y) / 2] }) },
    { scaleX: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1 - BREATH_X] }) },
    { scaleY: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1 + BREATH_Y] }) },
  ];

  const body = (
    <View
      style={{ width: size, height: size }}
      accessible={!onPress}
      accessibilityRole={onPress ? undefined : 'image'}
      accessibilityLabel={onPress ? undefined : accessibilityLabel}
    >
      {shadow ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.shadow,
            {
              width: shadowWidth,
              height: shadowHeight,
              borderRadius: shadowWidth / 2,
              left: (size - shadowWidth) / 2,
              transform: [
                { scale: hop.interpolate({ inputRange: [0, 1], outputRange: [1, 0.82] }) },
              ],
            },
          ]}
        />
      ) : null}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: breathTransform }]}>
        {previous ? (
          <PoseImage
            pose={previous}
            size={size}
            opacity={fade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })}
          />
        ) : null}
        <PoseImage pose={{ stage, mood }} size={size} opacity={fade} pop={pop} />
      </Animated.View>
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="imagebutton"
      accessibilityLabel={accessibilityLabel}
    >
      {body}
    </Pressable>
  );
}

function PoseImage({
  pose,
  size,
  opacity,
  pop,
}: {
  pose: Pose;
  size: number;
  opacity: Animated.AnimatedInterpolation<number> | Animated.Value;
  pop?: Animated.Value;
}) {
  const drawn = size * petScale(pose.stage, pose.mood);
  return (
    <Animated.Image
      source={petImage(pose.stage, pose.mood)}
      resizeMode="contain"
      style={{
        position: 'absolute',
        bottom: 0,
        left: (size - drawn) / 2,
        width: drawn,
        height: drawn,
        opacity,
        transform: pop
          ? [
              {
                translateY: pop.interpolate({
                  inputRange: [POP_FROM, 1],
                  outputRange: [(drawn * (1 - POP_FROM)) / 2, 0],
                }),
              },
              { scale: pop },
            ]
          : [],
      }}
    />
  );
}

const styles = StyleSheet.create({
  shadow: {
    position: 'absolute',
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
});
