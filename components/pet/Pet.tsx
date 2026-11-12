import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { petImage, petScale, type PetMood, type PetStage } from '../../constants/petImages';
import {
  createPetBody,
  moveHop,
  moveNod,
  petBodyStyles,
  restBody,
  type PetBody,
} from './petMotion';

type PetProps = {
  stage: PetStage;
  mood: PetMood;
  size: number;
  shadow?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
};

type Pose = { stage: PetStage; mood: PetMood };
type MotionKind = 'hop' | 'nod';

const BREATH_Y = 0.025;
const BREATH_X = 0.01;
const HOP_HEIGHT = 0.08;

const rise = Easing.out(Easing.quad);
const fall = Easing.in(Easing.quad);

function timing(
  value: Animated.Value,
  toValue: number,
  duration: number,
  easing: (t: number) => number,
): Animated.CompositeAnimation {
  return Animated.timing(value, { toValue, duration, easing, useNativeDriver: true });
}

function settleSquash(value: Animated.Value): Animated.CompositeAnimation {
  return Animated.spring(value, {
    toValue: 0,
    speed: 16,
    bounciness: 14,
    restDisplacementThreshold: 0.02,
    restSpeedThreshold: 0.02,
    useNativeDriver: true,
  });
}

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
  const swapping = useRef(false);
  const swapAnim = useRef<Animated.CompositeAnimation | null>(null);
  const motionAnim = useRef<Animated.CompositeAnimation | null>(null);
  const motionKind = useRef<MotionKind | null>(null);

  const bodyRef = useRef<PetBody | null>(null);
  if (bodyRef.current === null) bodyRef.current = createPetBody();
  const body = bodyRef.current;

  const breath = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  const drawn = size * petScale(stage, mood);

  // Built once. New interpolations created mid-animation are not driven by the
  // native driver, which froze the breath after the first crossfade and left
  // the outgoing pose stuck at full opacity.
  // Sized to the whole box (not the pose's drawn size) so a change of pose
  // never rebuilds them.
  const bodyStyles = useMemo(
    () => petBodyStyles(body, { height: size, hop: size * HOP_HEIGHT }),
    [body, size],
  );
  const prevOpacity = useMemo(
    () => fade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    [fade],
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

  function stopMotion() {
    swapAnim.current?.stop();
    swapAnim.current = null;
    motionAnim.current?.stop();
    motionAnim.current = null;
    motionKind.current = null;
  }

  // One move at a time. Celebration hops wait until a pose swap has finished.
  function startHops() {
    if (reduceMotionRef.current || lastPose.current.mood !== 'celebrating') return;
    if (swapping.current || motionKind.current !== null) return;
    motionAnim.current?.stop();
    restBody(body);
    motionKind.current = 'hop';
    const anim = Animated.sequence([moveHop(body, 1), moveHop(body, 0.7)]);
    motionAnim.current = anim;
    anim.start(() => {
      if (motionAnim.current !== anim) return;
      motionAnim.current = null;
      motionKind.current = null;
    });
  }

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
      swapAnim.current?.stop();
      swapAnim.current = null;
      motionAnim.current?.stop();
      motionAnim.current = null;
      motionKind.current = null;
      sub.remove();
    };
  }, []);

  // Prepare the swap before paint. The squash starts after the outgoing image
  // has mounted. A second change while a swap is running snaps to the newest
  // pose instead of restarting, which kept the pet invisible or squashed.
  useLayoutEffect(() => {
    const last = lastPose.current;
    if (last.stage === stage && last.mood === mood) return;
    const prevPose = last;
    lastPose.current = { stage, mood };
    poseToken.current += 1;
    stopMotion();
    restBody(body);

    const sameImage =
      reduceMotionRef.current ||
      petImage(prevPose.stage, prevPose.mood) === petImage(stage, mood);

    if (sameImage || swapping.current) {
      swapping.current = false;
      fade.setValue(1);
      setPrevious(null);
      if (prevPose.mood === mood) startHops();
      return;
    }

    swapping.current = true;
    fade.setValue(0);
    setPrevious(prevPose);
  }, [stage, mood, fade, body]);

  useEffect(() => {
    if (!previous || !swapping.current) return;
    const token = poseToken.current;
    let live = true;
    // Squash down, crossfade at the bottom, spring up taller than rest, settle.
    const anim = Animated.sequence([
      timing(body.squash, 0.85, 110, fall),
      Animated.parallel([
        timing(fade, 1, 90, rise),
        Animated.sequence([timing(body.squash, -0.55, 130, rise), settleSquash(body.squash)]),
      ]),
    ]);
    swapAnim.current = anim;
    anim.start(({ finished }) => {
      if (!live || poseToken.current !== token) return;
      if (swapAnim.current === anim) swapAnim.current = null;
      if (!finished || !mounted.current) return;
      swapping.current = false;
      setPrevious(null);
      startHops();
    });
    return () => {
      live = false;
      // Only stop this swap. A newer move may already own the body.
      if (swapAnim.current === anim) {
        anim.stop();
        swapAnim.current = null;
      }
    };
  }, [previous, fade, body]);

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
    if (mood !== 'celebrating' || reduceMotion !== false) {
      if (motionKind.current === 'hop') {
        motionAnim.current?.stop();
        motionAnim.current = null;
        motionKind.current = null;
        restBody(body);
      }
      return;
    }
    startHops();
    return () => {
      if (motionKind.current !== 'hop') return;
      motionAnim.current?.stop();
      motionAnim.current = null;
      motionKind.current = null;
      restBody(body);
    };
  }, [mood, reduceMotion, body]);

  useEffect(() => {
    if (reduceMotion !== true) return;
    poseToken.current += 1;
    stopMotion();
    restBody(body);
    fade.setValue(1);
    swapping.current = false;
    setPrevious(null);
  }, [reduceMotion, body, fade]);

  function handlePress() {
    if (!reduceMotionRef.current) {
      const wasSwapping = swapping.current;
      poseToken.current += 1;
      stopMotion();
      restBody(body);
      if (wasSwapping) {
        swapping.current = false;
        fade.setValue(1);
        if (mounted.current) setPrevious(null);
      }
      motionKind.current = 'nod';
      const anim = moveNod(body);
      motionAnim.current = anim;
      anim.start(() => {
        if (motionAnim.current !== anim) return;
        motionAnim.current = null;
        if (motionKind.current === 'nod') motionKind.current = null;
      });
    }
    onPress?.();
  }

  const shadowWidth = drawn * 0.55;
  const shadowHeight = drawn * 0.07;
  const labeled = !onPress && !!accessibilityLabel;

  const breathTransform = [
    { translateY: breathY },
    { scaleX: breathScaleX },
    { scaleY: breathScaleY },
  ];

  const art = (
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
            },
            bodyStyles.shadow,
          ]}
        />
      ) : null}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: breathTransform }]}>
        <Animated.View style={[bodyStyles.mover, StyleSheet.absoluteFill]}>
          <Animated.View style={[bodyStyles.squash, StyleSheet.absoluteFill]}>
            {previous ? <PoseImage pose={previous} size={size} opacity={prevOpacity} /> : null}
            <PoseImage pose={{ stage, mood }} size={size} opacity={fade} />
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </View>
  );

  if (!onPress) return art;
  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="imagebutton"
      accessibilityLabel={accessibilityLabel}
    >
      {art}
    </Pressable>
  );
}

function PoseImage({
  pose,
  size,
  opacity,
}: {
  pose: Pose;
  size: number;
  opacity: Animated.AnimatedInterpolation<number> | Animated.Value;
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
