import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  // null until the OS answers, so a loop never starts and then has to be cancelled.
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const reduceMotionRef = useRef(false);
  const mounted = useRef(true);

  const [previous, setPrevious] = useState<Pose | null>(null);
  const lastPose = useRef<Pose>({ stage, mood });
  const poseToken = useRef(0);
  const fading = useRef(false);
  const fadeAnim = useRef<Animated.CompositeAnimation | null>(null);
  const popAnim = useRef<Animated.CompositeAnimation | null>(null);

  const breath = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const hop = useRef(new Animated.Value(0)).current;

  // Built once. New interpolations created mid-animation are not driven by the
  // native driver, which froze the breath after the first crossfade and left
  // the outgoing pose stuck at full opacity.
  const prevOpacity = useMemo(
    () => fade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    [fade],
  );
  const hopY = useMemo(
    () => hop.interpolate({ inputRange: [0, 1], outputRange: [0, -size * HOP_HEIGHT] }),
    [hop, size],
  );
  const breathY = useMemo(
    () => breath.interpolate({ inputRange: [0, 1], outputRange: [0, (-size * BREATH_Y) / 2] }),
    [breath, size],
  );
  const breathScaleX = useMemo(
    () => breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1 - BREATH_X] }),
    [breath],
  );
  const breathScaleY = useMemo(
    () => breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1 + BREATH_Y] }),
    [breath],
  );
  const hopShadow = useMemo(
    () => hop.interpolate({ inputRange: [0, 1], outputRange: [1, 0.82] }),
    [hop],
  );

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
      fadeAnim.current?.stop();
      fadeAnim.current = null;
      popAnim.current?.stop();
      popAnim.current = null;
      sub.remove();
    };
  }, []);

  function stopMotion() {
    fadeAnim.current?.stop();
    fadeAnim.current = null;
    popAnim.current?.stop();
    popAnim.current = null;
  }

  // Prepare the crossfade before paint. The animation itself starts after the
  // outgoing image has mounted (see the effect below). A second change while
  // a fade is running snaps to the new pose instead of restarting from 0,
  // which kept the pet invisible across rapid pain-slider buckets.
  useLayoutEffect(() => {
    const last = lastPose.current;
    if (last.stage === stage && last.mood === mood) return;
    const prevPose = last;
    lastPose.current = { stage, mood };
    poseToken.current += 1;
    stopMotion();

    const sameImage =
      reduceMotionRef.current ||
      petImage(prevPose.stage, prevPose.mood) === petImage(stage, mood);

    if (sameImage || fading.current) {
      fading.current = false;
      fade.setValue(1);
      pop.setValue(1);
      setPrevious(null);
      return;
    }

    fading.current = true;
    fade.setValue(0);
    pop.setValue(POP_FROM);
    setPrevious(prevPose);
  }, [stage, mood, fade, pop]);

  useEffect(() => {
    if (!previous || !fading.current) return;
    const token = poseToken.current;
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
    fadeAnim.current = anim;
    anim.start(({ finished }) => {
      if (poseToken.current !== token) return;
      if (fadeAnim.current === anim) fadeAnim.current = null;
      if (!finished) return;
      fading.current = false;
      if (mounted.current) setPrevious(null);
    });
    return () => {
      anim.stop();
      if (fadeAnim.current === anim) fadeAnim.current = null;
    };
  }, [previous, fade, pop]);

  useEffect(() => {
    breath.setValue(0);
    if (reduceMotion !== false) return;
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
  }, [mood, reduceMotion, breath, size]);

  useEffect(() => {
    hop.setValue(0);
    if (mood !== 'celebrating' || reduceMotion !== false) return;
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
  }, [mood, reduceMotion, hop, size]);

  function handlePress() {
    if (!reduceMotionRef.current) {
      popAnim.current?.stop();
      pop.setValue(POP_FROM);
      const anim = Animated.spring(pop, {
        toValue: 1,
        useNativeDriver: true,
        speed: 18,
        bounciness: 8,
      });
      popAnim.current = anim;
      anim.start(() => {
        if (popAnim.current === anim) popAnim.current = null;
      });
    }
    onPress?.();
  }

  const drawn = size * petScale(stage, mood);
  const shadowWidth = drawn * 0.55;
  const shadowHeight = drawn * 0.07;
  const labeled = !onPress && !!accessibilityLabel;

  const breathTransform = [
    { translateY: hopY },
    { translateY: breathY },
    { scaleX: breathScaleX },
    { scaleY: breathScaleY },
  ];

  const body = (
    <View
      style={{ width: size, height: size }}
      accessible={labeled}
      accessibilityRole={labeled ? 'image' : undefined}
      accessibilityLabel={labeled ? accessibilityLabel : undefined}
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
              transform: [{ scale: hopShadow }],
            },
          ]}
        />
      ) : null}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: breathTransform }]}>
        {previous ? (
          <PoseImage pose={previous} size={size} opacity={prevOpacity} />
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
  const lift = useMemo(
    () =>
      pop
        ? pop.interpolate({
            inputRange: [POP_FROM, 1],
            outputRange: [(drawn * (1 - POP_FROM)) / 2, 0],
          })
        : null,
    [pop, drawn],
  );
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
        transform: pop && lift ? [{ translateY: lift }, { scale: pop }] : [],
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
