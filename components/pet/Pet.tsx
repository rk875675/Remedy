import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import {
  petImage,
  petScale,
  petUnfurlFrames,
  type PetFrame,
  type PetMood,
  type PetStage,
} from '../../constants/petImages';
import {
  createPetBody,
  moveHop,
  moveLand,
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

/**
 * Leaving or entering the ball plays hand-drawn frames: `pictures` runs from
 * the outgoing pose to the incoming one, every in-between drawing included.
 * `open` is the stage that is not the ball.
 */
type Sequence = { unfurl: boolean; open: PetStage; pictures: PetFrame[] };

const smooth = Easing.inOut(Easing.sin);
// A gentle ease in and out that stays close to linear in the middle.
const frameEase = Easing.bezier(0.3, 0.15, 0.7, 0.85);

const UNFURL_STEP_MS = 105;
const CURL_STEP_MS = 80;
const WOBBLE_MS = 350;
const CROUCH_MS = 120;
// Squash into the landing (60) plus the spring that settles it.
const LAND_MS = 60 + 450;
// Each frame hands over to the next over this much of a frame, either side.
const HANDOVER = 0.15;
const MOST_STEPS = petUnfurlFrames(5).length + 1;
const upTo50 = (ms: number): number => Math.ceil(ms / 50) * 50;

/** The longest unfurl (anticipation, frames, landing), for callers that wait on it. */
export const PET_UNFURL_MS = upTo50(WOBBLE_MS + MOST_STEPS * UNFURL_STEP_MS + LAND_MS);
/** The longest curl up (crouch, frames, settle). */
export const PET_CURL_MS = upTo50(CROUCH_MS + MOST_STEPS * CURL_STEP_MS + LAND_MS);
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
  const [shown, setShown] = useState<Pose>({ stage, mood });
  // Set while the ball unfurls or curls up frame by frame.
  const [sequence, setSequence] = useState<Sequence | null>(null);
  const motionAnim = useRef<Animated.CompositeAnimation | null>(null);
  const motionKind = useRef<MotionKind | null>(null);

  const bodyRef = useRef<PetBody | null>(null);
  if (bodyRef.current === null) bodyRef.current = createPetBody();
  const body = bodyRef.current;

  const breath = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  // 0 = outgoing pose ... n = incoming pose, one step per drawing.
  const frame = useRef(new Animated.Value(0)).current;

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
  // One per picture of a sequence, built once per sequence (never mid-animation).
  const frameOpacities = useMemo(() => {
    if (!sequence) return null;
    const n = sequence.pictures.length - 1;
    return sequence.pictures.map((_, i) => {
      const lo = i - 0.5 - HANDOVER;
      const hi = i - 0.5 + HANDOVER;
      const lo2 = i + 0.5 - HANDOVER;
      const hi2 = i + 0.5 + HANDOVER;
      const inputRange = i === 0 ? [lo2, hi2] : i === n ? [lo, hi] : [lo, hi, lo2, hi2];
      const outputRange = i === 0 ? [1, 0] : i === n ? [0, 1] : [0, 1, 1, 0];
      return frame.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });
    });
  }, [sequence, frame]);
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
      setShown({ stage, mood });
      fade.setValue(1);
      setPrevious(null);
      setSequence(null);
      if (prevPose.mood === mood) startHops();
      return;
    }

    // Leaving or entering the ball plays the drawings in between.
    const unfurl = prevPose.stage === 1 && stage > 1;
    if (unfurl || (stage === 1 && prevPose.stage > 1)) {
      const open = unfurl ? stage : prevPose.stage;
      const between = petUnfurlFrames(open);
      const from: PetFrame = { source: petImage(prevPose.stage, prevPose.mood), scale: petScale(prevPose.stage, prevPose.mood) };
      const to: PetFrame = { source: petImage(stage, mood), scale: petScale(stage, mood) };
      frame.setValue(0);
      fade.setValue(1);
      setShown({ stage, mood });
      swapping.current = true;
      setSequence({
        unfurl,
        open,
        pictures: [from, ...(unfurl ? between : [...between].reverse()), to],
      });
      return;
    }

    setShown({ stage, mood });
    swapping.current = true;
    fade.setValue(0);
    setPrevious(prevPose);
  }, [stage, mood, fade, frame, body]);

  useEffect(() => {
    if (!previous || !swapping.current) return;
    const token = poseToken.current;
    let live = true;
    // Squash down, crossfade at the bottom, spring up taller than rest, settle.
    const anim = Animated.sequence([
      timing(body.squash, 0.85, 110, fall),
      Animated.parallel([
        timing(fade, 1, 100, rise),
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

  // Frame-by-frame unfurl / curl. Starts once the stack of pictures has mounted.
  useEffect(() => {
    if (!sequence || !swapping.current) return;
    const token = poseToken.current;
    let live = true;
    const steps = sequence.pictures.length - 1;
    const framesMs = steps * (sequence.unfurl ? UNFURL_STEP_MS : CURL_STEP_MS);
    const frames = Animated.timing(frame, {
      toValue: steps,
      duration: framesMs,
      easing: frameEase,
      useNativeDriver: true,
    });
    let anim: Animated.CompositeAnimation;
    if (sequence.unfurl) {
      // The ball trembles with effort, then the drawings play with a stretch
      // (and, for the tall stages, a lift as it gets to its feet), then it lands.
      const wobble = Animated.parallel([
        Animated.sequence([
          timing(body.tilt, 0.3, 70, rise),
          timing(body.tilt, -0.5, 80, rise),
          timing(body.tilt, 0.7, 80, rise),
          timing(body.tilt, -1, 80, rise),
          timing(body.tilt, 0, WOBBLE_MS - 310, rise),
        ]),
        timing(body.squash, 0.35, WOBBLE_MS, fall),
      ]);
      const play: Animated.CompositeAnimation[] = [frames, timing(body.squash, -0.25, framesMs, smooth)];
      if (sequence.open >= 4) {
        play.push(
          Animated.sequence([
            Animated.delay(framesMs / 2),
            timing(body.lift, 0.5, framesMs / 4, rise),
            timing(body.lift, 0, framesMs / 4, fall),
          ]),
        );
      }
      anim = Animated.sequence([wobble, Animated.parallel(play), moveLand(body, 0.9)]);
    } else {
      anim = Animated.sequence([
        timing(body.squash, 0.6, CROUCH_MS, fall),
        Animated.parallel([frames, timing(body.squash, 0.15, framesMs, smooth)]),
        moveLand(body, 0.7),
      ]);
    }
    swapAnim.current = anim;
    anim.start(({ finished }) => {
      if (!live || poseToken.current !== token) return;
      if (swapAnim.current === anim) swapAnim.current = null;
      if (!finished || !mounted.current) return;
      swapping.current = false;
      setSequence(null);
      startHops();
    });
    return () => {
      live = false;
      if (swapAnim.current === anim) {
        anim.stop();
        swapAnim.current = null;
      }
    };
  }, [sequence, frame, body]);

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
    setShown(lastPose.current);
    setPrevious(null);
    setSequence(null);
  }, [reduceMotion, body, fade]);

  function handlePress() {
    if (!reduceMotionRef.current) {
      const wasSwapping = swapping.current;
      poseToken.current += 1;
      stopMotion();
      restBody(body);
      if (wasSwapping) {
        swapping.current = false;
        setShown(lastPose.current);
        fade.setValue(1);
        if (mounted.current) {
          setPrevious(null);
          setSequence(null);
        }
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
            {sequence && frameOpacities ? (
              sequence.pictures.map((picture, i) => (
                <PictureImage
                  key={i}
                  source={picture.source}
                  drawn={size * picture.scale}
                  size={size}
                  opacity={frameOpacities[i] ?? fade}
                />
              ))
            ) : (
              <>
                {previous ? <PoseImage pose={previous} size={size} opacity={prevOpacity} /> : null}
                <PoseImage pose={shown} size={size} opacity={fade} />
              </>
            )}
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
  return (
    <PictureImage
      source={petImage(pose.stage, pose.mood)}
      drawn={size * petScale(pose.stage, pose.mood)}
      size={size}
      opacity={opacity}
    />
  );
}

function PictureImage({
  source,
  drawn,
  size,
  opacity,
}: {
  source: PetFrame['source'];
  drawn: number;
  size: number;
  opacity: Animated.AnimatedInterpolation<number> | Animated.Value;
}) {
  return (
    <Animated.Image
      source={source}
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
