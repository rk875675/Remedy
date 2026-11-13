import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { colors } from '../../constants/colors';
import { PET_STAGE_SCALE, petScale, type PetMood } from '../../constants/petImages';
import { pickPetLine } from '../../constants/petMoodLines';
import {
  PET_COUNTDOWN_END,
  PET_EXERCISE_DONE,
  PET_EXIT,
  PET_FINAL_NEXT,
  PET_HALFWAY,
  PET_LAST_HOLD,
  PET_REST_BREAK,
  PET_REST_READY,
  PET_SET_DONE,
  PET_TAP,
} from '../../constants/petSessionLines';
import { hapticSelection } from '../../lib/haptics';
import type { PetState } from '../../lib/pet';
import {
  CUE_EVERY_MS,
  exerciseCues,
  holdMoment,
  isHalfway,
  lineAllowed,
  nextIsFinal,
  takeCue,
  type CoachMemory,
} from '../../lib/petCoach';
import {
  exerciseSpots,
  fitSpots,
  nextSpot,
  restSpots,
  type Rect,
  type Spot,
} from '../../lib/petSpots';
import { useReduceMotion } from '../../lib/useReduceMotion';
import { Dust, type DustHandle } from './Dust';
import { Pet, petCurlMs, petUnfurlMs } from './Pet';
import {
  call,
  createPetBody,
  moveBigStretch,
  moveHop,
  moveLand,
  moveNod,
  moveRock,
  petBodyStyles,
  restBody,
} from './petMotion';
import { usePetFace } from './usePetFace';

/** The bits of an exercise the pet reads. */
export type CoachExercise = {
  id: string;
  name: string;
  instructions: string | null;
  description: string | null;
  /** Seconds per timed hold, or null for a rep-based exercise. */
  holdSeconds: number | null;
};

/** Measured layout, in the coordinates of the screen root. Missing until measured. */
export type CoachRects = {
  // Exercise screen
  topBar?: Rect;
  video?: Rect;
  /** Name, set counter and hold countdown. */
  infoText?: Rect | null;
  /** The instruction caption. */
  caption?: Rect | null;
  /** The primary button's strip. */
  button?: Rect;
  // Rest screen
  ring?: Rect;
  skip?: Rect;
  exit?: Rect;
};

export type PetCoachProps = {
  /** Null until the pet state has loaded: nothing is drawn and nothing moves. */
  pet: PetState | null;
  phase: 'exercise' | 'rest';
  /** The exercise on screen (during a rest, the one just finished). */
  exercise: CoachExercise;
  exerciseIndex: number;
  exerciseCount: number;
  setIndex: number;
  restKind: 'set' | 'exercise';
  restSeconds: number;
  restTotal: number;
  /** Seconds left in the current hold (0 when not a timed exercise). */
  countdown: number;
  holdRep: number;
  holdReps: number;
  /** The exit prompt is open: the pet is kind and quiet. */
  exiting: boolean;
  /** The pet's box size; stepped down (not below ~120) until a spot fits without covering anything. */
  maxSize: number;
  rects: CoachRects;
  /** Kept by the session screen so the pet remembers across the exercise and rest screens. */
  memory: CoachMemory;
};

type TravelStyle = 'hop' | 'drop' | 'peek' | 'roll';

const BUBBLE_MIN_MS = 3800;
const BUBBLE_MS_PER_CHAR = 70;
const TAP_GAP_MS = 2000;
const FACE_REACT_GAP_MS = 6000;
const CHEER_HOLD_MS = 2500;
const STRETCH_HOLD_MS = 3000;
/** He moves at most this often (after arriving), and not within this long of a bubble going up. */
const MOVE_GAP_MS = 12000;
const BUBBLE_SETTLE_MS = 3500;
const DWELL_MIN_MS = 20000;
const DWELL_SPREAD_MS = 10000;
const DUST_COLOR = 'rgba(190, 160, 125, 0.6)';

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * The user's own armadillo, as their workout buddy, living on a layer above the
 * whole session screen: standing on the floor in front of the info, or beside the
 * rest ring, never over any text. The layer takes no touches except on the pet
 * himself. It only reads props and never touches the session's timers or flow.
 */
export function PetCoach(props: PetCoachProps) {
  const { pet, ...rest } = props;
  const [layer, setLayer] = useState<Rect | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { x, y, width, height } = e.nativeEvent.layout;
    setLayer((prev) =>
      prev && prev.x === x && prev.y === y && prev.w === width && prev.h === height
        ? prev
        : { x, y, w: width, h: height },
    );
  };
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" onLayout={onLayout}>
      {pet && layer ? <CoachBody {...rest} pet={pet} layer={layer} /> : null}
    </View>
  );
}

function CoachBody({
  pet,
  layer,
  phase,
  exercise,
  exerciseIndex,
  exerciseCount,
  setIndex,
  restKind,
  restSeconds,
  restTotal,
  countdown,
  holdRep,
  holdReps,
  exiting,
  maxSize,
  rects,
  memory,
}: Omit<PetCoachProps, 'pet'> & { pet: PetState; layer: Rect }) {
  const reduceMotion = useReduceMotion();
  const still = reduceMotion !== false;
  const stillRef = useRef(still);
  stillRef.current = still;
  const mounted = useRef(true);
  const { face, request, current: faceNow } = usePetFace();

  // ---- geometry: spots from the measured layout, in the layer's own coordinates ----
  const standK = petScale(pet.stage, 'coach');
  const fitted = useMemo<{ spots: Spot[]; size: number }>(() => {
    const shift = (r: Rect | undefined | null): Rect | undefined =>
      r ? { x: r.x - layer.x, y: r.y - layer.y, w: r.w, h: r.h } : undefined;
    const screen = { w: layer.w, h: layer.h };
    const common = { screen, size: maxSize, standScale: standK };
    if (phase === 'exercise') {
      const video = shift(rects.video);
      const topBar = shift(rects.topBar);
      const button = shift(rects.button);
      if (!video || !topBar || !button) return { spots: [], size: maxSize };
      const infoText = shift(rects.infoText) ?? null;
      const caption = shift(rects.caption) ?? null;
      return fitSpots({ ...common, video, topBar, button, infoText, caption }, exerciseSpots);
    }
    const ring = shift(rects.ring);
    const skip = shift(rects.skip);
    const exit = shift(rects.exit);
    if (!ring || !skip || !exit) return { spots: [], size: maxSize };
    return fitSpots({ ...common, ring, skip, exit }, restSpots);
  }, [phase, rects, layer, maxSize, standK]);
  const { spots, size } = fitted;
  const spotsRef = useRef(spots);
  spotsRef.current = spots;

  // ---- animated values, all built once ----
  const body = useRef(createPetBody()).current;
  const bodyLook = useMemo(() => petBodyStyles(body, { height: size, hop: size * 0.14 }), [body, size]);
  const px = useRef(new Animated.Value(0)).current;
  const py = useRef(new Animated.Value(0)).current;
  const arc = useRef(new Animated.Value(0)).current;
  const sc = useRef(new Animated.Value(1)).current;
  const rollPhase = useRef(new Animated.Value(0)).current;
  const bubble = useRef(new Animated.Value(0)).current;
  const arcY = useMemo(
    () => arc.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -size * 0.42, 0] }),
    [arc, size],
  );
  // Scaling is about the box's centre: this keeps his feet where they were.
  const shiftY = useMemo(
    () =>
      sc.interpolate({
        inputRange: [0.5, 1.5],
        outputRange: [(1 - 0.5) * (size / 2), (1 - 1.5) * (size / 2)],
      }),
    [sc, size],
  );
  const shadowArc = useMemo(
    () => arc.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.45, 1] }),
    [arc],
  );
  const rollStyle = useMemo(() => {
    const ballRadius = size * 0.3;
    const degrees = (2400 / ballRadius) * (180 / Math.PI);
    const dy = (size - size * PET_STAGE_SCALE[1]) / 2;
    const rotate = rollPhase.interpolate({
      inputRange: [-2400, 2400],
      outputRange: [`-${degrees}deg`, `${degrees}deg`],
    });
    return { transform: [{ translateY: dy }, { rotate }, { translateY: -dy }] };
  }, [rollPhase, size]);
  const bubbleMotion = useMemo(
    () => ({
      opacity: bubble,
      transform: [{ scale: bubble.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
    }),
    [bubble],
  );

  // ---- state ----
  const [spot, setSpot] = useState<Spot | null>(null);
  const spotRef = useRef<Spot | null>(null);
  const [placed, setPlaced] = useState(false);
  const placedRef = useRef(false);
  const [faceRight, setFaceRight] = useState(true);
  const [curled, setCurled] = useState(false);
  const [dustAt, setDustAt] = useState<{ x: number; y: number } | null>(null);
  const [line, setLine] = useState<string | null>(null);
  const dust = useRef<DustHandle>(null);

  const pos = useRef({ x: 0, y: 0 });
  const token = useRef(0);
  const moving = useRef(false);
  const travelAnim = useRef<Animated.CompositeAnimation | null>(null);
  const running = useRef<Animated.CompositeAnimation | null>(null);
  const pendingRun = useRef<(() => void) | null>(null);
  const previousSpot = useRef<Spot['name'] | null>(null);
  const dirTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const lineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const arrivedKey = useRef<string | null>(null);
  const lastTapAt = useRef(0);
  const lastFaceAt = useRef(0);
  const tapCue = useRef(false);
  const inPlaceFlip = useRef(false);
  const readySaid = useRef(false);
  const prevCountdown = useRef<number | null>(null);
  const exitingRef = useRef(exiting);
  exitingRef.current = exiting;

  const cues = useMemo(
    () => exerciseCues(exercise.instructions, exercise.description),
    [exercise.id, exercise.instructions, exercise.description],
  );
  const cuesRef = useRef(cues);
  cuesRef.current = cues;
  const nameRef = useRef(pet.name);
  nameRef.current = pet.name;
  const stageRef = useRef(pet.stage);
  stageRef.current = pet.stage;

  // ---- small helpers ----

  function clearDirTimers() {
    dirTimers.current.forEach(clearTimeout);
    dirTimers.current = [];
  }
  function later(fn: () => void, ms: number) {
    dirTimers.current.push(
      setTimeout(() => {
        if (mounted.current) fn();
      }, ms),
    );
  }

  /** One body move at a time; skipped while he is travelling or another move runs. */
  function play(anim: Animated.CompositeAnimation) {
    if (stillRef.current || moving.current || running.current !== null || !mounted.current) return;
    running.current = anim;
    anim.start(() => {
      if (running.current === anim) running.current = null;
    });
  }

  function stopBodyMove() {
    const current = running.current;
    running.current = null;
    current?.stop();
    restBody(body);
  }

  /** Put him exactly on a spot, no travel. */
  function place(target: Spot) {
    const x = target.cx - size / 2;
    const y = target.groundY - size;
    px.setValue(x);
    py.setValue(y);
    sc.setValue(target.scale);
    arc.setValue(0);
    rollPhase.setValue(0);
    pos.current = { x, y };
    spotRef.current = target;
    setSpot(target);
    setFaceRight(target.faceRight);
    setCurled(false);
    placedRef.current = true;
    setPlaced(true);
  }

  function hideNow() {
    if (lineTimer.current) clearTimeout(lineTimer.current);
    lineTimer.current = null;
    bubble.stopAnimation();
    bubble.setValue(0);
    setLine(null);
  }

  function hideLine() {
    if (!mounted.current) return;
    if (stillRef.current) {
      hideNow();
      return;
    }
    Animated.timing(bubble, { toValue: 0, duration: 160, useNativeDriver: true }).start(({ finished }) => {
      if (finished && mounted.current) setLine(null);
    });
  }

  /**
   * One bubble at a time, anchored to where he stands, and never while he travels.
   * A normal line waits 6 s after the last; a well-timed (critical) one 2 s.
   * The text may be a function so a cue is only used up when it is actually said.
   * `force` is for the exit prompt only.
   */
  function say(source: string | (() => string), critical: boolean, force = false): boolean {
    const here = spotRef.current;
    if (!mounted.current || moving.current || !placedRef.current || !here || !here.bubble) return false;
    const now = Date.now();
    if (!force && !lineAllowed(now, memory.lastLineAt, critical)) return false;
    const text = typeof source === 'string' ? source : source();
    if (text.length === 0) return false;
    memory.lastLineAt = now;
    setLine(text);
    if (lineTimer.current) clearTimeout(lineTimer.current);
    if (stillRef.current) {
      bubble.setValue(1);
    } else {
      bubble.stopAnimation();
      bubble.setValue(0);
      Animated.spring(bubble, { toValue: 1, speed: 16, bounciness: 12, useNativeDriver: true }).start();
    }
    lineTimer.current = setTimeout(hideLine, Math.max(BUBBLE_MIN_MS, text.length * BUBBLE_MS_PER_CHAR));
    return true;
  }
  const sayRef = useRef(say);
  sayRef.current = say;

  // ---- travel: the only way he changes place ----

  /** Where he starts from an entrance: above the screen, or off the side edge. */
  function startFor(target: Spot, style: TravelStyle): { x: number; y: number } {
    const tx = target.cx - size / 2;
    const ty = target.groundY - size;
    if (style === 'drop') return { x: tx, y: -size * 1.4 };
    // Peek comes in over the nearer side edge; a roll crosses from the far one.
    const nearLeft = target.cx < layer.w / 2;
    const fromLeft = style === 'roll' ? !nearLeft : nearLeft;
    return { x: fromLeft ? -size * 1.3 : layer.w + size * 0.3, y: ty };
  }

  /**
   * Move him to `target`. Every move goes through here under one token: a newer
   * move stops the older one, a move cut off by unmount does nothing, and every
   * move ends exactly on its spot.
   */
  function runTravel(target: Spot, style: TravelStyle, fromEdge: boolean, done?: () => void) {
    if (!mounted.current) return;
    token.current += 1;
    const id = token.current;
    const live = () => mounted.current && token.current === id;
    const prevTravel = travelAnim.current;
    travelAnim.current = null;
    prevTravel?.stop();
    stopBodyMove();
    moving.current = true;
    hideNow();
    const tx = target.cx - size / 2;
    const ty = target.groundY - size;
    if (fromEdge) {
      const start = startFor(target, style);
      px.setValue(start.x);
      py.setValue(start.y);
      sc.setValue(target.scale);
      arc.setValue(0);
      pos.current = start;
    }
    const startX = pos.current.x;
    const movingRight = tx > startX;
    const stage = stageRef.current;

    const finish = () => {
      if (!live()) return;
      arc.setValue(0);
      rollPhase.setValue(0);
      px.setValue(tx);
      py.setValue(ty);
      sc.setValue(target.scale);
      pos.current = { x: tx, y: ty };
      previousSpot.current = spotRef.current?.name ?? null;
      spotRef.current = target;
      setSpot(target);
      setFaceRight(target.faceRight);
      setCurled(false);
      moving.current = false;
      travelAnim.current = null;
      memory.lastSpot = target.name;
      memory.lastMoveAt = Date.now();
      // A puff where he lands, and a squash with some weight.
      setDustAt({ x: target.cx, y: target.groundY });
      dust.current?.play([
        { x: -target.drawn * 0.2, delay: 0, size: 12 },
        { x: target.drawn * 0.2, delay: 40, size: 12 },
      ]);
      play(moveLand(body, style === 'drop' ? 1 : 0.8));
      done?.();
    };

    const timing = (value: Animated.Value, toValue: number, duration: number, easing: (t: number) => number) =>
      Animated.timing(value, { toValue, duration, easing, useNativeDriver: true });
    let anim: Animated.CompositeAnimation;
    if (style === 'drop') {
      setFaceRight(target.faceRight);
      anim = Animated.sequence([timing(py, ty, 430, Easing.in(Easing.quad)), call(finish)]);
    } else if (style === 'roll') {
      const dir = movingRight ? 1 : -1;
      const dist = Math.abs(tx - startX);
      const ms = clamp(dist * 1.1, 700, 1500);
      const ease = Easing.inOut(Easing.cubic);
      anim = Animated.sequence([
        timing(body.squash, 0.5, 90, Easing.out(Easing.quad)),
        call(() => {
          if (!live()) return;
          setFaceRight(movingRight);
          setCurled(true);
        }),
        Animated.delay(stage > 1 ? petCurlMs(stage) : 260),
        Animated.parallel([timing(px, tx, ms, ease), timing(rollPhase, dir * dist, ms, ease), timing(sc, target.scale, ms, ease)]),
        call(() => {
          if (live()) rollPhase.setValue(0);
        }),
        moveRock(body, dir === 1 ? 1 : -1),
        call(() => {
          if (live()) setCurled(false);
        }),
        Animated.delay(stage > 1 ? petUnfurlMs(stage) : 260),
        call(finish),
      ]);
    } else {
      const dist = Math.hypot(tx - startX, ty - pos.current.y);
      const ms = clamp(480 + dist * 0.5, 560, 950);
      anim = Animated.sequence([
        timing(body.squash, 0.5, 90, Easing.out(Easing.quad)),
        call(() => {
          if (live()) setFaceRight(movingRight);
        }),
        Animated.parallel([
          timing(px, tx, ms, Easing.linear),
          timing(py, ty, ms, Easing.linear),
          timing(arc, 1, ms, Easing.inOut(Easing.sin)),
          timing(sc, target.scale, ms, Easing.linear),
          Animated.sequence([
            timing(body.squash, -0.45, 140, Easing.out(Easing.quad)),
            timing(body.squash, -0.15, Math.max(60, ms - 140), Easing.inOut(Easing.sin)),
          ]),
        ]),
        call(finish),
      ]);
    }
    travelAnim.current = anim;
    anim.start();
  }

  // ---- unmount ----
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      token.current += 1;
      clearDirTimers();
      if (lineTimer.current) clearTimeout(lineTimer.current);
      const travel = travelAnim.current;
      travelAnim.current = null;
      travel?.stop();
      const current = running.current;
      running.current = null;
      current?.stop();
      bubble.stopAnimation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The first arrival waits for the pet to be mounted at its start position.
  useEffect(() => {
    if (!placed || !pendingRun.current) return;
    const run = pendingRun.current;
    pendingRun.current = null;
    run();
  }, [placed]);

  // Layout changed (rotation, a longer name): if he is standing still, stand on the updated spot.
  useEffect(() => {
    if (!placedRef.current || moving.current || pendingRun.current) return;
    const here = spotRef.current;
    if (!here) return;
    const same = spots.find((s) => s.name === here.name);
    if (same) {
      if (Math.abs(same.cx - here.cx) > 0.5 || Math.abs(same.groundY - here.groundY) > 0.5) place(same);
      else {
        spotRef.current = same;
        setSpot(same);
      }
    } else if (spots[0]) {
      place(spots[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spots]);

  // ---- the director ----

  const key = `${phase}:${exercise.id}:${restKind}`;
  const haveSpots = spots.length > 0;

  function scheduleDwell() {
    if (phase !== 'exercise' || stillRef.current) return;
    later(dwellMove, DWELL_MIN_MS + Math.random() * DWELL_SPREAD_MS);
  }

  /** After 20-30 s in one place he hops to another, deliberately, never too soon after a bubble. */
  function dwellMove() {
    if (moving.current || exitingRef.current) {
      later(dwellMove, 2500);
      return;
    }
    const now = Date.now();
    if (now - memory.lastLineAt < BUBBLE_SETTLE_MS) {
      later(dwellMove, 1500);
      return;
    }
    if (now - memory.lastMoveAt < MOVE_GAP_MS) {
      later(dwellMove, MOVE_GAP_MS - (now - memory.lastMoveAt) + 200);
      return;
    }
    const here = spotRef.current;
    const target = nextSpot(spotsRef.current, here?.name ?? null, previousSpot.current);
    if (!target) {
      // Only one place to stand: he stays and varies what he does there.
      play(inPlaceFlip.current ? moveBigStretch(body) : moveHop(body, 0.7));
      inPlaceFlip.current = !inPlaceFlip.current;
      later(() => sayRef.current(() => takeCue(memory, cuesRef.current), true), 900);
      scheduleDwell();
      return;
    }
    const roll = Math.random() < 0.4;
    runTravel(target, roll ? 'roll' : 'hop', false, () => {
      later(() => sayRef.current(() => takeCue(memory, cuesRef.current), true), 450);
      scheduleDwell();
    });
  }

  /** What happens once he has arrived on this screen. */
  function afterArrive() {
    if (phase === 'exercise') {
      later(() => sayRef.current(() => takeCue(memory, cuesRef.current), true), 450);
      const chain = () => {
        later(() => {
          if (!exitingRef.current) sayRef.current(() => takeCue(memory, cuesRef.current), false);
          chain();
        }, CUE_EVERY_MS + Math.random() * 1500);
      };
      chain();
      scheduleDwell();
      return;
    }
    readySaid.current = false;
    lastFaceAt.current = Date.now();
    request('cheer', { force: true, hold: CHEER_HOLD_MS, auto: true });
    const exerciseDone = restKind === 'exercise';
    const group = exerciseDone
      ? isHalfway(exerciseIndex, exerciseCount)
        ? PET_HALFWAY
        : PET_EXERCISE_DONE
      : PET_SET_DONE;
    later(() => sayRef.current(pickPetLine(group, nameRef.current), true), 350);
    if (restTotal >= 14) {
      later(() => sayRef.current(pickPetLine(PET_REST_BREAK, nameRef.current), false), 6500);
    }
    if (exerciseDone && restTotal >= 16) {
      later(() => {
        request('stretching', { hold: STRETCH_HOLD_MS, auto: true });
        play(moveBigStretch(body));
      }, 9500);
    }
  }

  // Arrive once per exercise / rest screen, as soon as there are spots to stand on.
  useEffect(() => {
    if (!haveSpots || arrivedKey.current === key) return;
    arrivedKey.current = key;
    clearDirTimers();
    const list = spotsRef.current;
    let target: Spot | null;
    if (phase === 'exercise') {
      target = nextSpot(list, null, memory.lastSpot as Spot['name'] | null);
    } else {
      target = nextSpot(list, null, memory.lastSpot as Spot['name'] | null);
    }
    if (!target) return;
    if (stillRef.current) {
      // Reduce Motion: no travel. He is simply there, with his shadow, pose and lines.
      place(target);
      afterArrive();
      return;
    }
    const styles: TravelStyle[] = phase === 'rest' ? ['peek', 'roll', 'drop'] : ['drop', 'peek', 'roll'];
    const pool = styles.filter((s) => s !== memory.lastEntrance);
    const style = pool[Math.floor(Math.random() * pool.length)] ?? 'drop';
    memory.lastEntrance = style;
    const go = target;
    const start = startFor(go, style);
    const begin = () => runTravel(go, style, true, afterArrive);
    if (placedRef.current) {
      begin();
    } else {
      // Mounted at the start position first, so he never flashes at the corner.
      px.setValue(start.x);
      py.setValue(start.y);
      sc.setValue(go.scale);
      pos.current = start;
      setFaceRight(go.faceRight);
      pendingRun.current = begin;
      placedRef.current = true;
      setPlaced(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [haveSpots, key]);

  // Natural points inside a timed hold.
  useEffect(() => {
    const prev = prevCountdown.current;
    prevCountdown.current = countdown;
    const hold = exercise.holdSeconds;
    if (phase !== 'exercise' || !hold || prev === null || prev === countdown || exiting) return;
    const moment = holdMoment(countdown, hold, holdRep, holdReps);
    if (moment === 'last-hold') say(pickPetLine(PET_LAST_HOLD, pet.name), true);
    else if (moment === 'last-seconds') say(pickPetLine(PET_COUNTDOWN_END, pet.name), true);
    else if (moment === 'halfway') say(() => takeCue(memory, cuesRef.current), false);
    if (countdown >= 1 && countdown <= 3) play(moveNod(body));
    else if (countdown === hold && holdRep > 1) play(moveHop(body, 0.4));
    // Reads the latest props through refs; only the tick matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

  // A moment before the rest ends: back to coach, with a line.
  useEffect(() => {
    if (phase !== 'rest' || restTotal <= 8 || restSeconds > 4 || readySaid.current) return;
    readySaid.current = true;
    const group =
      restKind === 'exercise' && nextIsFinal(exerciseIndex, exerciseCount) ? PET_FINAL_NEXT : PET_REST_READY;
    say(pickPetLine(group, pet.name), true);
    play(moveHop(body, 0.4));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restSeconds]);

  // The exit prompt: concerned and kind, nothing pushy.
  useEffect(() => {
    if (!exiting) return;
    request(null, { force: true });
    say(pickPetLine(PET_EXIT, pet.name), true, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exiting]);

  function onTap() {
    hapticSelection();
    const now = Date.now();
    if (exiting || moving.current || now - lastTapAt.current < TAP_GAP_MS) return;
    lastTapAt.current = now;
    // A quick cheer (at most one face change in 6 s), a hop, and the next cue or a friendly line.
    if (now - lastFaceAt.current >= FACE_REACT_GAP_MS && faceNow() === null) {
      lastFaceAt.current = now;
      request('cheer', { hold: CHEER_HOLD_MS, auto: true });
    }
    play(moveHop(body, 0.6));
    const useCue = phase === 'exercise' && tapCue.current;
    tapCue.current = !tapCue.current;
    say(useCue ? () => takeCue(memory, cuesRef.current) : pickPetLine(PET_TAP, pet.name), true);
  }

  // ---- render ----
  if (!placed) return null;

  const readySoon = phase === 'rest' && restTotal > 8 && restSeconds <= 4;
  const baseMood: PetMood = exiting
    ? 'concerned'
    : phase === 'rest' && !readySoon
      ? 'rest'
      : 'coach';
  const shown: PetMood = face ?? baseMood;
  const drawnNow = size * (curled ? PET_STAGE_SCALE[1] : petScale(pet.stage, shown));
  const shadowW = drawnNow * 0.55;
  const shadowH = Math.max(6, drawnNow * 0.07);
  const tail = spot?.bubble?.tail ?? 'left';
  const rect = spot?.bubble?.rect ?? null;

  const frame = {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    width: size,
    height: size,
  };

  return (
    <>
      {/* Contact shadow: belongs to the surface he is on, so it stays put while he arcs through the air. */}
      <Animated.View
        pointerEvents="none"
        style={[frame, { transform: [{ translateX: px }, { translateY: py }, { translateY: shiftY }, { scale: sc }] }]}
      >
        <Animated.View style={{ flex: 1, opacity: shadowArc }}>
          <Animated.View style={[{ flex: 1 }, bodyLook.shadow]}>
            <View
              style={{
                position: 'absolute',
                left: (size - shadowW) / 2,
                bottom: -shadowH * 0.35,
                width: shadowW,
                height: shadowH,
                borderRadius: shadowW / 2,
                backgroundColor: 'rgba(0,0,0,0.26)',
              }}
            />
          </Animated.View>
        </Animated.View>
      </Animated.View>

      {dustAt ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: dustAt.x, top: dustAt.y - 24, width: 1, height: 24 }}
        >
          <Dust ref={dust} color={DUST_COLOR} />
        </View>
      ) : (
        <View pointerEvents="none" style={{ position: 'absolute', width: 1, height: 1 }}>
          <Dust ref={dust} color={DUST_COLOR} />
        </View>
      )}

      {/* The pet himself. Only the art is tappable; the rest of the box lets touches through. */}
      <Animated.View
        pointerEvents="box-none"
        style={[
          frame,
          {
            transform: [
              { translateX: px },
              { translateY: py },
              { translateY: arcY },
              { translateY: shiftY },
              { scale: sc },
            ],
          },
        ]}
      >
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ scaleX: faceRight ? -1 : 1 }] }]}>
          <Animated.View style={bodyLook.mover}>
            <Animated.View style={bodyLook.squash}>
              <Animated.View style={curled ? rollStyle : null}>
                <Pet stage={curled ? 1 : pet.stage} mood={curled ? 'ready' : shown} size={size} shadow={false} />
              </Animated.View>
            </Animated.View>
          </Animated.View>
        </View>
        <Pressable
          onPress={onTap}
          accessibilityRole="imagebutton"
          accessibilityLabel={pet.name ?? 'Your armadillo'}
          style={{
            position: 'absolute',
            left: size * 0.2,
            width: size * 0.6,
            bottom: 0,
            height: size * 0.8,
          }}
        />
      </Animated.View>

      {/* The bubble, anchored to where he stands. It moves only between lines. */}
      {line && rect ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: rect.x,
            top: rect.y,
            width: rect.w,
            height: rect.h,
            justifyContent: tail === 'bottom' ? 'flex-end' : 'flex-start',
            alignItems: tail === 'left' ? 'flex-start' : tail === 'right' ? 'flex-end' : 'center',
          }}
        >
          <Animated.View
            style={[styles.bubble, tail === 'bottom' ? { width: rect.w } : null, bubbleMotion]}
            accessible
            accessibilityRole="text"
            accessibilityLabel={line}
          >
            <View
              style={
                tail === 'left'
                  ? styles.tailLeft
                  : tail === 'right'
                    ? styles.tailRight
                    : [styles.tailBottom, { left: (spot?.bubble?.tailOffset ?? rect.w / 2) - TAIL / 2 }]
              }
            />
            <Text style={styles.bubbleText} numberOfLines={3}>
              {line}
            </Text>
          </Animated.View>
        </View>
      ) : null}
    </>
  );
}

const BORDER = 2;
const TAIL = 10;

const styles = StyleSheet.create({
  bubble: {
    maxWidth: '100%',
    backgroundColor: colors.surface,
    borderWidth: BORDER,
    borderColor: colors.textPrimary,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleText: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  tailLeft: {
    position: 'absolute',
    left: -TAIL / 2 + BORDER / 2,
    top: 20,
    width: TAIL,
    height: TAIL,
    backgroundColor: colors.surface,
    borderLeftWidth: BORDER,
    borderBottomWidth: BORDER,
    borderColor: colors.textPrimary,
    transform: [{ rotate: '45deg' }],
  },
  tailRight: {
    position: 'absolute',
    right: -TAIL / 2 + BORDER / 2,
    top: 20,
    width: TAIL,
    height: TAIL,
    backgroundColor: colors.surface,
    borderRightWidth: BORDER,
    borderTopWidth: BORDER,
    borderColor: colors.textPrimary,
    transform: [{ rotate: '45deg' }],
  },
  tailBottom: {
    position: 'absolute',
    bottom: -TAIL / 2 + BORDER / 2,
    alignSelf: 'center',
    width: TAIL,
    height: TAIL,
    backgroundColor: colors.surface,
    borderRightWidth: BORDER,
    borderBottomWidth: BORDER,
    borderColor: colors.textPrimary,
    transform: [{ rotate: '45deg' }],
  },
});
