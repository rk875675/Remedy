import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  PixelRatio,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import {
  displayedPetMood,
  petImage,
  petScale,
  type PetMood,
  type PetStage,
} from '../../constants/petImages';
import { PET_CLIP_DROP, PET_CLIP_SCALE, PET_UNFURL_CLIPS, type PetClip } from '../../constants/petClips';
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

/**
 * Leaving or entering the ball plays one sprite-sheet clip of the stage that
 * is not the ball. `reverse` plays it backwards (curling up). `cut` means the
 * outgoing pose is exactly the clip's first frame, so no fade is needed.
 */
type ClipStage = 2 | 3 | 4 | 5;
type ClipPlay = { stage: ClipStage; reverse: boolean; cut: boolean; token: number };

function isClipStage(s: PetStage): s is ClipStage {
  return s !== 1;
}

const UNFURL_FRAME_MS = 20;
const CURL_FRAME_MS = 16;
const HANDOVER_MS = 60;
// Waiting for the sheet to load, plus the two hand-over fades.
const CLIP_ALLOWANCE_MS = 150;
const SHEET_TIMEOUT_MS = 250;
// Frame i shows while `frame` is in [i, i + FRAME_HOLD]; never a half-way slide.
const FRAME_HOLD = 0.999;
const FRAME_EDGE = 0.001;
const MOST_FRAMES = Math.max(...Object.values(PET_UNFURL_CLIPS).map((c) => c.frames));
const upTo50 = (ms: number): number => Math.ceil(ms / 50) * 50;

/** How long leaving the ball takes at this stage, including loading and hand-over fades. */
export function petUnfurlMs(stage: PetStage): number {
  if (!isClipStage(stage)) return 0;
  return upTo50(PET_UNFURL_CLIPS[stage].frames * UNFURL_FRAME_MS + CLIP_ALLOWANCE_MS);
}
/** How long curling into the ball takes from this stage. */
export function petCurlMs(stage: PetStage): number {
  if (!isClipStage(stage)) return 0;
  return upTo50(PET_UNFURL_CLIPS[stage].frames * CURL_FRAME_MS + CLIP_ALLOWANCE_MS);
}

/** One picture per drawn pose, so two moods that share a drawing share a view. */
function poseKey(pose: Pose): string {
  return `${pose.stage}-${displayedPetMood(pose.stage, pose.mood)}`;
}

/** The longest unfurl, including loading and hand-over fades, for callers that wait on it. */
export const PET_UNFURL_MS = upTo50(MOST_FRAMES * UNFURL_FRAME_MS + CLIP_ALLOWANCE_MS);
/** The longest curl up, including loading and hand-over fades. */
export const PET_CURL_MS = upTo50(MOST_FRAMES * CURL_FRAME_MS + CLIP_ALLOWANCE_MS);

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

  // Two fixed picture slots. Each slot keeps its own opacity value for life:
  // swapping which value drives a mounted picture made it vanish on device.
  const [slots, setSlots] = useState<[Pose | null, Pose | null]>([{ stage, mood }, null]);
  const active = useRef<0 | 1>(0);
  const [fadeToken, setFadeToken] = useState<number | null>(null);
  const lastPose = useRef<Pose>({ stage, mood });
  const poseToken = useRef(0);
  const swapping = useRef(false);
  const swapAnim = useRef<Animated.CompositeAnimation | null>(null);
  // Set while a sprite-sheet clip is mounted (ball <-> stage N).
  const [clip, setClipState] = useState<ClipPlay | null>(null);
  const clipRef = useRef<ClipPlay | null>(null);
  const setClip = (next: ClipPlay | null) => {
    clipRef.current = next;
    setClipState(next);
  };
  // Token of the clip whose sheet has loaded, and the start waiting for it.
  const loadedToken = useRef(-1);
  const startClip = useRef<(() => void) | null>(null);
  const side = PixelRatio.roundToNearestPixel(size * PET_CLIP_SCALE);
  const motionAnim = useRef<Animated.CompositeAnimation | null>(null);
  const motionKind = useRef<MotionKind | null>(null);

  const bodyRef = useRef<PetBody | null>(null);
  if (bodyRef.current === null) bodyRef.current = createPetBody();
  const body = bodyRef.current;

  const breath = useRef(new Animated.Value(0)).current;
  const slotOpacity = useRef<[Animated.Value, Animated.Value]>([
    new Animated.Value(1),
    new Animated.Value(0),
  ]).current;
  const clipOpacity = useRef(new Animated.Value(0)).current;
  // Which cell of the sheet shows.
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
  // Cell offsets of the sheet, built once per clip (never mid-animation). Frame
  // i holds from i to i + FRAME_HOLD, so there is no half-way slide.
  const clipStage = clip?.stage ?? null;
  const cellOffsets = useMemo(() => {
    if (clipStage === null) return null;
    const { frames, cols } = PET_UNFURL_CLIPS[clipStage];
    const inputRange: number[] = [];
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < frames; i += 1) {
      const x = -(i % cols) * side;
      const y = -Math.floor(i / cols) * side;
      inputRange.push(i, i + FRAME_HOLD);
      xs.push(x, x);
      ys.push(y, y);
    }
    return {
      x: frame.interpolate({ inputRange, outputRange: xs, extrapolate: 'clamp' }),
      y: frame.interpolate({ inputRange, outputRange: ys, extrapolate: 'clamp' }),
    };
  }, [clipStage, side, frame]);
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

  /** Show `pose` at rest, with nothing else on screen. */
  function snapTo(pose: Pose) {
    const a = active.current;
    swapping.current = false;
    slotOpacity[a].setValue(1);
    slotOpacity[a === 0 ? 1 : 0].setValue(0);
    clipOpacity.setValue(0);
    if (!mounted.current) return;
    setSlots(a === 0 ? [pose, null] : [null, pose]);
    setFadeToken(null);
    setClip(null);
  }

  /** Put `pose` in the free slot, hidden, ready to be brought in. */
  function bringIn(prevPose: Pose, pose: Pose): void {
    const out = active.current;
    const inc: 0 | 1 = out === 0 ? 1 : 0;
    active.current = inc;
    slotOpacity[out].setValue(1);
    slotOpacity[inc].setValue(0);
    clipOpacity.setValue(0);
    setSlots(inc === 1 ? [prevPose, pose] : [pose, prevPose]);
    swapping.current = true;
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
      snapTo({ stage, mood });
      if (prevPose.mood === mood) startHops();
      return;
    }

    bringIn(prevPose, { stage, mood });

    // Leaving or entering the ball plays the clip of the stage that is not the ball.
    const unfurl = prevPose.stage === 1 && stage > 1;
    const open = unfurl ? stage : prevPose.stage;
    if ((unfurl || stage === 1) && isClipStage(open)) {
      const reverse = !unfurl;
      const cutFrom = reverse ? petImage(open, 'idle') : petImage(1, 'ready');
      frame.setValue(reverse ? PET_UNFURL_CLIPS[open].frames - FRAME_EDGE : 0);
      setFadeToken(null);
      setClip({
        stage: open,
        reverse,
        cut: petImage(prevPose.stage, prevPose.mood) === cutFrom,
        token: poseToken.current,
      });
      return;
    }

    setClip(null);
    setFadeToken(poseToken.current);
  }, [stage, mood, frame, body]);

  useEffect(() => {
    if (fadeToken === null || !swapping.current || clipRef.current) return;
    const token = fadeToken;
    const inc = active.current;
    const out: 0 | 1 = inc === 0 ? 1 : 0;
    let live = true;
    // Squash down, crossfade at the bottom, spring up taller than rest, settle.
    const anim = Animated.sequence([
      timing(body.squash, 0.85, 110, fall),
      Animated.parallel([
        timing(slotOpacity[inc], 1, 100, rise),
        timing(slotOpacity[out], 0, 100, rise),
        Animated.sequence([timing(body.squash, -0.55, 130, rise), settleSquash(body.squash)]),
      ]),
    ]);
    swapAnim.current = anim;
    anim.start(({ finished }) => {
      if (!live || poseToken.current !== token) return;
      if (swapAnim.current === anim) swapAnim.current = null;
      if (!finished || !mounted.current) return;
      snapTo(lastPose.current);
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
  }, [fadeToken, body]);

  // Sprite-sheet unfurl / curl. The clip mounts invisible over the outgoing
  // pose; once its sheet has loaded (or been given up on) the clip plays.
  useEffect(() => {
    if (!clip || !swapping.current) return;
    const token = clip.token;
    const { frames } = PET_UNFURL_CLIPS[clip.stage];
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let anim: Animated.CompositeAnimation | null = null;

    const play = () => {
      if (!live) return;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      const stepMs = clip.reverse ? CURL_FRAME_MS : UNFURL_FRAME_MS;
      const frameRun = Animated.timing(frame, {
        toValue: clip.reverse ? 0 : frames - FRAME_EDGE,
        duration: frames * stepMs,
        easing: Easing.linear,
        useNativeDriver: true,
      });
      // The clip sits above both pictures. It covers the outgoing pose (at once
      // when it starts on that very drawing), the pose underneath is swapped
      // while it plays, and it fades away over the real target pose. Nothing is
      // ever faded out before what replaces it is fully solid.
      const inc = active.current;
      const out: 0 | 1 = inc === 0 ? 1 : 0;
      const run = Animated.sequence([
        timing(clipOpacity, 1, clip.cut ? 1 : HANDOVER_MS, Easing.linear),
        timing(slotOpacity[out], 0, 1, Easing.linear),
        frameRun,
        timing(slotOpacity[inc], 1, 1, Easing.linear),
        timing(clipOpacity, 0, HANDOVER_MS, Easing.linear),
      ]);
      anim = run;
      swapAnim.current = run;
      run.start(({ finished }) => {
        if (!live || poseToken.current !== token) return;
        if (swapAnim.current === run) swapAnim.current = null;
        if (!finished || !mounted.current) return;
        snapTo(lastPose.current);
        startHops();
      });
    };

    // The sheet is a bundled image; if its load event is late or never comes, play anyway.
    const giveUp = () => {
      timer = null;
      if (!live || !mounted.current) return;
      startClip.current = null;
      play();
    };

    if (loadedToken.current === token) {
      play();
    } else {
      startClip.current = play;
      timer = setTimeout(giveUp, SHEET_TIMEOUT_MS);
    }
    return () => {
      live = false;
      if (timer !== null) clearTimeout(timer);
      if (startClip.current === play) startClip.current = null;
      if (anim && swapAnim.current === anim) {
        anim.stop();
        swapAnim.current = null;
      }
    };
  }, [clip, frame, body]);

  function handleSheetLoad(token: number) {
    loadedToken.current = token;
    const start = startClip.current;
    startClip.current = null;
    start?.();
  }

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
    snapTo(lastPose.current);
  }, [reduceMotion, body]);

  function handlePress() {
    if (!reduceMotionRef.current) {
      const wasSwapping = swapping.current;
      poseToken.current += 1;
      stopMotion();
      restBody(body);
      if (wasSwapping) snapTo(lastPose.current);
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
            {slots[0] ? (
              <PoseImage key={`a-${poseKey(slots[0])}`} pose={slots[0]} size={size} opacity={slotOpacity[0]} />
            ) : null}
            {slots[1] ? (
              <PoseImage key={`b-${poseKey(slots[1])}`} pose={slots[1]} size={size} opacity={slotOpacity[1]} />
            ) : null}
            {clip && cellOffsets ? (
              <ClipView
                key={`clip-${clip.token}`}
                clip={PET_UNFURL_CLIPS[clip.stage]}
                size={size}
                side={side}
                offsets={cellOffsets}
                opacity={clipOpacity}
                onLoad={() => handleSheetLoad(clip.token)}
              />
            ) : null}
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

type Opacity = Animated.Value;

function PoseImage({ pose, size, opacity }: { pose: Pose; size: number; opacity: Opacity }) {
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

/** The sprite sheet behind a window one frame big; `offsets` jump from cell to cell. */
function ClipView({
  clip,
  size,
  side,
  offsets,
  opacity,
  onLoad,
}: {
  clip: PetClip;
  size: number;
  side: number;
  offsets: { x: Animated.AnimatedInterpolation<number>; y: Animated.AnimatedInterpolation<number> };
  opacity: Opacity;
  onLoad: () => void;
}) {
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: (size - side) / 2,
        bottom: -size * PET_CLIP_DROP,
        width: side,
        height: side,
        overflow: 'hidden',
        opacity,
      }}
    >
      <Animated.Image
        source={clip.source}
        resizeMode="stretch"
        fadeDuration={0}
        onLoad={onLoad}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: clip.cols * side,
          height: clip.rows * side,
          transform: [{ translateX: offsets.x }, { translateY: offsets.y }],
        }}
      />
    </Animated.View>
  );
}
const styles = StyleSheet.create({
  shadow: {
    position: 'absolute',
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
});
