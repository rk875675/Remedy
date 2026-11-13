import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  Easing,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../../constants/colors';
import { type } from '../../constants/typography';
import { petScale, type PetMood, type PetStage } from '../../constants/petImages';
import { PET_HOME_TRICK_LINES } from '../../constants/petOnboardingLines';
import {
  PET_ANGRY,
  PET_COMING_BACK,
  PET_CURIOUS,
  PET_EARLY_MORNING,
  PET_FORGIVEN,
  PET_GONE_BUBBLE,
  PET_HAPPY,
  PET_IGNORING,
  PET_NAP_BALL,
  PET_NAP_FIVE_MORE,
  PET_NAP_REFUSE,
  PET_NAP_UP,
  PET_NIGHT_UP,
  PET_READING,
  PET_READING_AWAY,
  PET_READING_LOOKUP,
  PET_SAD,
  PET_SLEEP_HALF,
  PET_SLEEP_MUMBLE,
  PET_STARTLED,
  PET_STORM_OFF,
  PET_STRETCHING,
  PET_STRETCH_STOP,
  PET_WARN,
  PET_WOKEN_GRUMPY,
  pickPetLine,
} from '../../constants/petMoodLines';
import { hapticSelection } from '../../lib/haptics';
import { petGrowthCopy, stageProgress, type PetState } from '../../lib/pet';
import {
  ANGRY_HOLD_MS,
  createLadder,
  createPatience,
  ladderTap,
  ladderTick,
  petSleepReason,
  type LadderAction,
  type SleepReason,
} from '../../lib/petTemper';
import { useReduceMotion } from '../../lib/useReduceMotion';
import { Dust, DUST_PALE, easedTimeAt, type DustHandle, type DustPoint } from './Dust';
import { PetEmotes, type PetEmotesHandle } from './PetEmotes';
import { Pet, petCurlMs, petUnfurlMs } from './Pet';
import {
  call,
  createPetBody,
  moveBigStretch,
  moveDance,
  moveDroop,
  moveHeadShake,
  moveHoldStretch,
  moveHop,
  moveHuff,
  moveJumpSpin,
  moveLand,
  moveLookAround,
  moveNod,
  movePoseSwap,
  moveRock,
  moveShiver,
  moveSnore,
  moveStartle,
  moveStomp,
  moveSway,
  moveWeightShift,
  moveWiggle,
  petBodyStyles,
  restBody,
} from './petMotion';
import { usePetFace } from './usePetFace';

type PetSceneProps = {
  topInset: number;
  greeting: string;
  firstName: string | null;
  onPressFirstName?: () => void;
  pet: PetState | null;
  mood: PetMood;
  children?: React.ReactNode;
};

const TRACK_WIDTH = 180;
const ROLL_START = -1.75;
const ARRIVE_PAST = 12;
const ROLL_PAST = 8;
const POSE_GAP = 260;
/** moveHop is on the ground after the crouch, the rise and the fall. */
const HOP_LAND_MS = 410;
const SAY_MS = 2800;
/** A tap-driven line never replaces the bubble more often than this. */
const SAY_GAP_MS = 2000;
/** Share of ordinary calm-tap reactions that get a bubble. */
const CALM_BUBBLE_CHANCE = 0.7;
const ANGRY_LINE_GAP_MS = 2500;
/** At most one calm-tap reaction that changes the face in this long. */
const FACE_REACT_GAP_MS = 6000;
const HAPPY_HOLD_MS = 4000;
const PROUD_HOLD_MS = 3000;
/** After an emotional state ends, taps do not count toward patience for this long. */
const GRACE_MS = 4000;
/** Woken up grumpy: the face stays this long. */
const GRUMPY_MIN_MS = 15000;
const GRUMPY_SPREAD_MS = 5000;
/** Storm off: gone, back turned, then sulking. */
const GONE_MIN_MS = 6000;
const GONE_SPREAD_MS = 3000;
const PEEK_PHASE_MS = 3400;
const BACK_TURNED_MS = 6000;
const SULK_MIN_MS = 15000;
const SULK_SPREAD_MS = 5000;
/** After the angry hold, roughly half the time it turns sad instead of just calming down. */
const SAD_CHANCE = 0.5;
const SAD_MIN_MS = 15000;
const SAD_SPREAD_MS = 5000;
const SAD_TAP_AFTER_MS = 2500;
/** Taps on a sleeper closer together than this count as one. */
const STIR_GAP_MS = 1200;
/** Things it gets up to on its own. */
const ACTIVITY_CHANCE = 0.55;
const ACTIVITY_MIN_MS = 60000;
const ACTIVITY_SPREAD_MS = 90000;
const REST_MIN_MS = 30000;
const REST_SPREAD_MS = 60000;
const ACTIVITY_LINE_MIN_MS = 20000;
const ACTIVITY_LINE_SPREAD_MS = 20000;
const LOOKED_UP_WINDOW_MS = 8000;
/** Coming back to the tab after this long, a woken pet may fall asleep again. */
const REENTER_MS = 10 * 60 * 1000;
/** Back from the tab after this long, it may be up to something new. */
const NEW_ACTIVITY_AWAY_MS = 60 * 1000;

type IdleName = 'look' | 'shift' | 'stretch' | 'hop';
type Activity = 'reading' | 'stretching';
const ACTIVITIES: readonly Activity[] = ['reading', 'stretching'];
// Not the same one twice running, even across visits to the tab.
let lastActivityShown: Activity | null = null;

/**
 * awake    up and ready; may be doing an activity
 * asleep   in bed (night) or lying down (nap); taps stir it
 * grumpy   just woken: angry face for 15-20 s
 * angry    the spam ladder's second rung; held until it has been left alone
 * gone     rolled off screen (or on its way)
 * sulking  back from the storm, ignoring taps
 * sad      hurt feelings; one gentle tap after a pause cheers it up
 */
type Emo = 'awake' | 'asleep' | 'grumpy' | 'angry' | 'gone' | 'sulking' | 'sad';
type Pending = Exclude<LadderAction, 'none' | 'soften'>;
const PENDING_RANK: Record<Pending, number> = { warn: 1, angry: 2, storm: 3 };
type TapName =
  | 'roll'
  | 'jumpSpin'
  | 'stretch'
  | 'wiggle'
  | 'dance'
  | 'lookAround'
  | 'startle'
  | 'curlPeek'
  | 'happy'
  | 'proud';
/** One step of a script: a move to play, a wait in ms, or nothing (just do it). */
type Step = () => Animated.CompositeAnimation | number | void;

// Movement-only reactions keep whatever face is showing. Calm taps lean affectionate.
const MOVE_WEIGHTS: Record<'roll' | 'jumpSpin' | 'stretch' | 'wiggle' | 'dance' | 'lookAround' | 'startle' | 'curlPeek', number> = {
  roll: 1,
  jumpSpin: 2,
  stretch: 1,
  wiggle: 2.5,
  dance: 2,
  lookAround: 1,
  startle: 0.8,
  curlPeek: 1.2,
};
const FACE_WEIGHTS: Record<'happy' | 'proud', number> = { happy: 3, proud: 1.2 };

/** A random key by weight, never `avoid` (so the same thing never happens twice in a row). */
function weightedPick<T extends string>(weights: Partial<Record<T, number>>, avoid: T | null): T {
  const all = Object.keys(weights) as T[];
  const keys = all.filter((key) => (weights[key] ?? 0) > 0 && key !== avoid);
  const total = keys.reduce((sum, key) => sum + (weights[key] ?? 0), 0);
  let r = Math.random() * total;
  for (const key of keys) {
    r -= weights[key] ?? 0;
    if (r <= 0) return key;
  }
  return keys[keys.length - 1] ?? (all[0] as T);
}

function legPuffs(
  ease: (t: number) => number,
  duration: number,
  from: number,
  to: number,
  spots: number[],
  travel: number,
  size = 13,
): DustPoint[] {
  const span = to - from;
  if (span === 0) return [];
  return spots.map((spot) => ({
    x: spot * travel,
    delay: Math.round(duration * easedTimeAt(ease, (spot - from) / span)),
    size,
  }));
}

/** Home hero: forest-green panel with the pet on a soft hill and the day's action on the hill. */
export function PetScene({
  topInset,
  greeting,
  firstName,
  onPressFirstName,
  pet,
  mood,
  children,
}: PetSceneProps) {
  const { width, height } = useWindowDimensions();
  const petSize = Math.min(240, Math.max(170, Math.round(height * 0.27)));
  const petAreaHeight = topInset + 30 + petSize;
  // The hill is the top of a large circle. A wide box with a big corner radius
  // would not work: the radius is clamped to half the shorter side, leaving a flat band.
  const hillSize = width * 1.8;
  const petName = pet?.name ?? 'Your armadillo';

  // --- The pet is alive: it rolls in, fidgets, sleeps, reads, and has feelings when tapped. ---
  const reduceMotion = useReduceMotion();
  const hasPet = pet !== null;
  const [ready, setReady] = useState(false);
  const [curled, setCurled] = useState(false);
  const [says, setSays] = useState<string | null>(null);
  // Every face change goes through this controller (hold times, deferral, cleanup).
  const { face, request: requestFace, current: faceNow } = usePetFace();
  const [flip, setFlip] = useState(false);
  const [sleeping, setSleeping] = useState(false);
  const [woken, setWoken] = useState(false);
  const roll = useRef(new Animated.Value(0)).current;
  const bubble = useRef(new Animated.Value(0)).current;
  const body = useRef(createPetBody()).current;
  const busy = useRef(false);
  const interruptible = useRef(true);
  const mounted = useRef(true);
  const entered = useRef(false);
  const decided = useRef(false);
  const seq = useRef(0);
  const seqTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const sayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deferTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const angryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const grumpyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef<Animated.CompositeAnimation | null>(null);
  const lastIdle = useRef<IdleName | null>(null);
  const shiftDir = useRef<1 | -1>(1);
  const dust = useRef<DustHandle>(null);
  const emotes = useRef<PetEmotesHandle>(null);

  const emo = useRef<Emo>('awake');
  const pending = useRef<Pending | null>(null);
  const patience = useRef(createPatience()).current;
  const ladder = useRef(createLadder());
  const graceUntil = useRef(0);
  const lockUntil = useRef(0);
  const lastTrick = useRef<TapName | null>(null);
  const lastFaceReact = useRef(0);
  const lastSayAt = useRef(0);
  const silentTap = useRef(false);
  const lastAngryLine = useRef(0);
  const lastStirAt = useRef(0);
  const wokenRef = useRef(false);
  const sleepReason = useRef<SleepReason | null>(null);
  const stir = useRef(0);
  const napNeed = useRef(5);
  const sadSince = useRef(0);
  const awayAt = useRef<number | null>(null);
  const activity = useRef<Activity | null>(null);
  const lookedUpAt = useRef(0);
  const nextActivityAt = useRef(Date.now() + 15000 + Math.random() * 30000);
  type Storm = { goneUntil: number; backUntil: number; sulkUntil: number };
  const storm = useRef<Storm | null>(null);
  const stormPhase = useRef<'gone' | 'back' | 'sulk' | null>(null);

  // Curled up, the pet is drawn at 0.72 of its box, sitting on the bottom edge.
  const rollTravel = width * 0.36;
  const baseMood: PetMood = woken && mood === 'sleepy' ? 'idle' : mood;
  const shownMood: PetMood = face ?? baseMood;
  const poseStage: PetStage = !pet || curled ? 1 : pet.stage;
  const poseMood: PetMood = !pet || curled ? 'ready' : shownMood;
  const drawn = petSize * petScale(poseStage, poseMood);

  // Timers and scripts read the latest values from here, never from a stale render.
  const live = useRef({
    stage: (pet?.stage ?? 1) as PetStage,
    name: pet?.name ?? null,
    mood,
    reduce: reduceMotion,
    rollTravel,
    width,
    petSize,
  });
  live.current = {
    stage: (pet?.stage ?? 1) as PetStage,
    name: pet?.name ?? null,
    mood,
    reduce: reduceMotion,
    rollTravel,
    width,
    petSize,
  };

  // Built on the full box, not the pose's drawn size, so curling and uncurling
  // mid-trick never rebuilds these while a move is running.
  const bodyLook = useMemo(
    () => petBodyStyles(body, { height: petSize, hop: petSize * 0.14 }),
    [body, petSize],
  );
  const rollMotion = useMemo(() => {
    const ballRadius = petSize * 0.32;
    const span = 2;
    const distance = span * rollTravel;
    const degrees = (distance / ballRadius) * (180 / Math.PI);
    const translateX = roll.interpolate({
      inputRange: [-span, span],
      outputRange: [-distance, distance],
    });
    const rotate = roll.interpolate({
      inputRange: [-span, span],
      outputRange: [`-${degrees}deg`, `${degrees}deg`],
    });
    return { translateX, rotate };
  }, [roll, petSize, rollTravel]);
  const shadowMotion = useMemo(
    () => ({
      opacity: bodyLook.shadow.opacity,
      transform: [{ translateX: rollMotion.translateX }, ...bodyLook.shadow.transform],
    }),
    [bodyLook, rollMotion.translateX],
  );
  const bubbleMotion = useMemo(
    () => ({
      opacity: bubble,
      transform: [{ scale: bubble.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
    }),
    [bubble],
  );
  const flipStyle = useMemo(() => ({ transform: [{ scaleX: flip ? -1 : 1 }] }), [flip]);
  const shadowW = drawn * 0.55;
  const shadowH = Math.max(6, drawn * 0.07);

  // ---- plumbing ----

  const curlWait = (): number => {
    const stage = live.current.stage;
    return stage > 1 ? petCurlMs(stage) : POSE_GAP;
  };
  const unfurlWait = (): number => {
    const stage = live.current.stage;
    return stage > 1 ? petUnfurlMs(stage) : POSE_GAP;
  };
  const still = (): boolean => live.current.reduce !== false;

  /** A timer that only fires if the script that set it is still the current one. */
  function later(id: number, fn: () => void, ms: number) {
    seqTimers.current.push(
      setTimeout(() => {
        if (mounted.current && id === seq.current) fn();
      }, ms),
    );
  }

  /** The speech bubble. A tap-driven line is dropped, not queued, if the last one is under 2 s old. */
  function say(line: string, opts: { force?: boolean; defer?: boolean; ms?: number } = {}) {
    if (!mounted.current) return;
    const now = Date.now();
    const wait = SAY_GAP_MS - (now - lastSayAt.current);
    if (!opts.force && wait > 0) {
      // `defer`: say it once the bubble is free (the latest deferred line wins).
      if (opts.defer) {
        if (deferTimer.current) clearTimeout(deferTimer.current);
        deferTimer.current = setTimeout(() => {
          deferTimer.current = null;
          say(line, { ...opts, force: true });
        }, wait);
      }
      return;
    }
    if (deferTimer.current) clearTimeout(deferTimer.current);
    deferTimer.current = null;
    lastSayAt.current = now;
    setSays(line);
    if (sayTimer.current) clearTimeout(sayTimer.current);
    bubble.stopAnimation();
    bubble.setValue(0);
    Animated.spring(bubble, { toValue: 1, speed: 16, bounciness: 14, useNativeDriver: true }).start();
    sayTimer.current = setTimeout(() => {
      if (!mounted.current) return;
      Animated.timing(bubble, { toValue: 0, duration: 160, useNativeDriver: true }).start(({ finished }) => {
        if (finished && mounted.current) setSays(null);
      });
    }, opts.ms ?? SAY_MS);
  }

  function playMove(anim: Animated.CompositeAnimation, onDone?: (finished: boolean) => void) {
    const prev = running.current;
    running.current = anim;
    prev?.stop();
    restBody(body);
    anim.start(({ finished }) => {
      if (running.current !== anim) return;
      running.current = null;
      if (!mounted.current) return;
      onDone?.(finished);
    });
  }

  function stopLoop() {
    const prev = running.current;
    running.current = null;
    prev?.stop();
    restBody(body);
  }

  function rollTo(toValue: number, duration: number, easing: (t: number) => number) {
    return Animated.timing(roll, { toValue, duration, easing, useNativeDriver: true });
  }

  function squashTo(toValue: number, duration: number) {
    return Animated.timing(body.squash, {
      toValue,
      duration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
  }

  function clearAngryTimer() {
    if (angryTimer.current) clearTimeout(angryTimer.current);
    angryTimer.current = null;
  }

  /**
   * Start a new script: everything the last one had pending (moves, timers,
   * emotes) is cancelled, and its late callbacks can no longer change anything.
   * `safe` says the script may be cut off at any moment (no rolling or curling).
   * An activity in progress is put away (its face goes back to the baseline).
   */
  function begin(safe: boolean, keepFace = false): number {
    seq.current += 1;
    seqTimers.current.forEach(clearTimeout);
    seqTimers.current = [];
    clearAngryTimer();
    stopLoop();
    emotes.current?.stop();
    busy.current = true;
    interruptible.current = safe;
    pending.current = null;
    if (activity.current) {
      activity.current = null;
      lookedUpAt.current = 0;
      nextActivityAt.current = Date.now() + REST_MIN_MS + Math.random() * REST_SPREAD_MS;
      if (!keepFace) requestFace(null, { force: true });
    }
    return seq.current;
  }

  /** Run steps one after another; each is a move, a wait, or an instant action. */
  function runSteps(id: number, steps: Step[], done?: () => void, index = 0) {
    if (id !== seq.current || !mounted.current) return;
    const step = steps[index];
    if (!step) {
      done?.();
      return;
    }
    const next = () => runSteps(id, steps, done, index + 1);
    const out = step();
    if (typeof out === 'number') later(id, next, out);
    else if (out) {
      playMove(out, (finished) => {
        if (finished && id === seq.current) next();
      });
    } else next();
  }

  /** Back to ordinary: awake and free. (Faces are never reset here; the controller owns them.) */
  function endAwake(id: number) {
    if (id !== seq.current || !mounted.current) return;
    emo.current = 'awake';
    busy.current = false;
    interruptible.current = true;
    setFlip(false);
    const waiting = pending.current;
    pending.current = null;
    if (waiting) fireAction(waiting);
  }

  /** An emotional state is over: patience and the ladder start from nothing. */
  function finishCalm(id: number) {
    if (id !== seq.current) return;
    patience.reset();
    ladder.current = createLadder();
    graceUntil.current = Date.now() + GRACE_MS;
    storm.current = null;
    stormPhase.current = null;
    endAwake(id);
  }

  function dustAt(points: DustPoint[]) {
    if (mounted.current) dust.current?.play(points);
  }

  // ---- sleep ----

  function sleepAllowed(): boolean {
    const m = live.current.mood;
    return m === 'idle' || m === 'ready' || m === 'sleepy';
  }

  function currentReason(): SleepReason | null {
    return petSleepReason(new Date(), live.current.name ?? 'remedy-pet');
  }

  /** Night: tucked into the bed drawing. The afternoon nap lies on the ground. */
  function sleepFace(reason: SleepReason): PetMood {
    return reason === 'nap' ? 'sleepy' : 'bed';
  }

  function fallAsleep(reason: SleepReason) {
    const id = begin(true, true);
    sleepReason.current = reason;
    stir.current = 0;
    lastStirAt.current = 0;
    napNeed.current = 5 + (Math.random() < 0.5 ? 1 : 0);
    emo.current = 'asleep';
    if (still()) {
      requestFace(sleepFace(reason), { force: true });
      setSleeping(true);
      busy.current = false;
      return;
    }
    runSteps(id, [
      () => 250,
      () => {
        requestFace(sleepFace(reason), { force: true });
        setSleeping(true);
        return 700;
      },
      () => snoring(),
    ]);
  }

  /** Awake and free to be put to bed: no tricks, no emotion running, not already woken. */
  function maybeSleep(force = false) {
    if (!entered.current || !mounted.current) return;
    if (emo.current !== 'awake' || busy.current) return;
    if (live.current.reduce === null) return;
    if (!force && wokenRef.current) return;
    if (!sleepAllowed()) return;
    const reason = currentReason();
    if (!reason) return;
    wokenRef.current = false;
    setWoken(false);
    fallAsleep(reason);
  }

  /** Mood changed under a sleeper (a session finished, say): up without any fuss. */
  function quietWake() {
    const id = begin(true);
    setSleeping(false);
    wokenRef.current = true;
    setWoken(true);
    requestFace(null, { force: true });
    endAwake(id);
  }

  function snoring(): Animated.CompositeAnimation {
    busy.current = false;
    return Animated.loop(moveSnore(body));
  }

  function tapAsleep() {
    // Mid curl-up gag: let it finish.
    if (busy.current && !interruptible.current) return;
    const now = Date.now();
    // A burst of taps is one stir, so spamming cannot rush it out of bed.
    if (now - lastStirAt.current < STIR_GAP_MS) return;
    lastStirAt.current = now;
    const reason = sleepReason.current ?? 'night';
    stir.current += 1;
    const n = stir.current;
    const need = reason === 'nap' ? napNeed.current : 3;
    if (n >= need) {
      wakeUp(reason);
      return;
    }
    const nap = reason === 'nap';
    let line: string;
    if (nap) line = n === 1 ? pickPetLine(PET_NAP_FIVE_MORE) : pickPetLine(PET_NAP_REFUSE);
    else if (reason === 'early') line = pickPetLine(PET_EARLY_MORNING);
    else line = pickPetLine(n === 1 ? PET_SLEEP_MUMBLE : PET_SLEEP_HALF);
    // The nap pet's third refusal is to roll up and shut the world out.
    const ballTap = nap && n === 3;
    const id = begin(!ballTap);
    if (still()) {
      busy.current = false;
      say(line, { force: true });
      return;
    }
    if (!ballTap) {
      say(line, { force: true });
      runSteps(id, [
        () => (n % 2 === 0 ? moveRock(body, n % 4 === 0 ? 1 : -1) : moveShiver(body)),
        () => snoring(),
      ]);
      return;
    }
    runSteps(id, [
      () => {
        say(line, { force: true });
        return moveShiver(body);
      },
      () => {
        setCurled(true);
        return curlWait();
      },
      () => {
        say(pickPetLine(PET_NAP_BALL), { force: true });
        return 1100;
      },
      () => moveRock(body, 1),
      () => {
        setCurled(false);
        return unfurlWait();
      },
      () => snoring(),
    ]);
  }

  function wakeUp(reason: SleepReason) {
    const id = begin(true);
    const nap = reason === 'nap';
    emo.current = 'grumpy';
    setSleeping(false);
    wokenRef.current = true;
    setWoken(true);
    // Out of bed (or off the ground) and scowling.
    requestFace('angry', { force: true });
    say(pickPetLine(nap ? PET_NAP_UP : PET_NIGHT_UP), { force: true });
    const grumpy = () => {
      busy.current = false;
      interruptible.current = true;
      if (grumpyTimer.current) clearTimeout(grumpyTimer.current);
      grumpyTimer.current = setTimeout(() => {
        grumpyTimer.current = null;
        if (!mounted.current) return;
        requestFace(null);
        emo.current = 'awake';
        patience.reset();
        ladder.current = createLadder();
        graceUntil.current = Date.now() + GRACE_MS;
      }, GRUMPY_MIN_MS + Math.random() * GRUMPY_SPREAD_MS);
    };
    if (still()) {
      later(id, () => say(pickPetLine(PET_WOKEN_GRUMPY), { force: true }), 1300);
      later(id, grumpy, 1500);
      return;
    }
    runSteps(
      id,
      [
        () => 450,
        () => moveStomp(body),
        () => (nap ? moveHuff(body) : undefined),
        () => {
          say(pickPetLine(PET_WOKEN_GRUMPY), { force: true });
          return nap ? 1500 : 900;
        },
      ],
      grumpy,
    );
  }

  /** Grumpy: no face change, a shiver if the body is free, a line now and then. */
  function tapGrumpy(now: number) {
    if (!still() && running.current === null && !busy.current) playMove(moveShiver(body));
    if (now - lastAngryLine.current >= ANGRY_LINE_GAP_MS) {
      lastAngryLine.current = now;
      say(pickPetLine(PET_WOKEN_GRUMPY));
    }
  }

  // ---- activities ----

  /** It only gets up to things when it is standing around in a plain mood. */
  function activityAllowed(): boolean {
    const m = live.current.mood;
    return (
      live.current.stage > 1 &&
      (m === 'idle' || m === 'ready') &&
      emo.current === 'awake' &&
      !busy.current &&
      !activity.current &&
      faceNow() === null &&
      !curled
    );
  }

  function pickActivity(): Activity {
    const options = ACTIVITIES.filter((a) => a !== lastActivityShown);
    return options[Math.floor(Math.random() * options.length)] ?? 'reading';
  }

  function activityLoop(kind: Activity): Animated.CompositeAnimation {
    return Animated.loop(kind === 'reading' ? moveSway(body) : moveHoldStretch(body));
  }

  function scheduleActivityLine(id: number, kind: Activity) {
    later(
      id,
      () => {
        if (activity.current !== kind) return;
        say(pickPetLine(kind === 'reading' ? PET_READING : PET_STRETCHING), { force: true });
        scheduleActivityLine(id, kind);
      },
      ACTIVITY_LINE_MIN_MS + Math.random() * ACTIVITY_LINE_SPREAD_MS,
    );
  }

  function startActivity(kind: Activity) {
    const id = begin(true);
    activity.current = kind;
    lastActivityShown = kind;
    lookedUpAt.current = 0;
    requestFace(kind, { force: true });
    if (still()) {
      busy.current = false;
    } else {
      runSteps(id, [
        () => 600,
        () => {
          busy.current = false;
          return activityLoop(kind);
        },
      ]);
    }
    scheduleActivityLine(id, kind);
    later(id, () => endActivity(id), ACTIVITY_MIN_MS + Math.random() * ACTIVITY_SPREAD_MS);
  }

  /** Its time is up: puts the book down or lets the stretch go, back to standing. */
  function endActivity(id: number) {
    if (id !== seq.current) return;
    activity.current = null;
    lookedUpAt.current = 0;
    nextActivityAt.current = Date.now() + REST_MIN_MS + Math.random() * REST_SPREAD_MS;
    stopLoop();
    requestFace(null);
    endAwake(id);
  }

  /** A calm tap during an activity. Reading: look up, then (soon) put the book away. */
  function activityTap(now: number) {
    const kind = activity.current;
    if (!kind) return;
    if (kind === 'reading' && now - lookedUpAt.current > LOOKED_UP_WINDOW_MS) {
      lookedUpAt.current = now;
      lockUntil.current = now + 900;
      say(pickPetLine(PET_READING_LOOKUP), { force: true });
      if (!still()) {
        playMove(moveNod(body), (finished) => {
          if (finished && activity.current === 'reading') playMove(activityLoop('reading'));
        });
      }
      return;
    }
    const lines = kind === 'reading' ? PET_READING_AWAY : PET_STRETCH_STOP;
    const id = begin(true);
    say(pickPetLine(lines), { force: true });
    if (still()) {
      endAwake(id);
      return;
    }
    runSteps(id, [() => 400, () => moveWiggle(body)], () => endAwake(id));
  }

  // ---- tap reactions when awake ----

  /** Crouch, curl, roll to both walls, rock, uncurl, wiggle. */
  function rollSequence(): Animated.CompositeAnimation {
    const rightEase = Easing.inOut(Easing.cubic);
    const backEase = Easing.out(Easing.cubic);
    const rightMs = 500;
    const leftMs = 860;
    const backMs = 620;
    const travel = live.current.rollTravel;
    const past = ROLL_PAST / travel;
    return Animated.sequence([
      squashTo(0.6, 90),
      Animated.delay(120),
      squashTo(0, 60),
      call(() => {
        if (mounted.current) setCurled(true);
      }),
      Animated.delay(curlWait()),
      Animated.parallel([
        rollTo(1, rightMs, rightEase),
        call(() => {
          dustAt([
            ...legPuffs(rightEase, rightMs, 0, 1, [0.32, 0.68], travel),
            { x: travel, delay: rightMs, size: 15 },
          ]);
        }),
      ]),
      moveLand(body, 0.75),
      Animated.parallel([
        rollTo(-1, leftMs, rightEase),
        call(() => {
          dustAt([
            ...legPuffs(rightEase, leftMs, 1, -1, [0.4, -0.15, -0.6], travel),
            { x: -travel, delay: leftMs, size: 15 },
          ]);
        }),
      ]),
      moveLand(body, 0.75),
      Animated.parallel([
        rollTo(past, backMs, backEase),
        call(() => {
          dustAt(legPuffs(backEase, backMs, -1, past, [-0.62, -0.2], travel));
        }),
      ]),
      rollTo(0, 170, Easing.inOut(Easing.quad)),
      moveRock(body, 1),
      call(() => {
        if (mounted.current) setCurled(false);
      }),
      Animated.delay(unfurlWait()),
      moveWiggle(body),
    ]);
  }

  function startRoll(speak: boolean) {
    if (busy.current || emo.current !== 'awake' || activity.current || live.current.rollTravel <= 0) return;
    const id = begin(false);
    runSteps(
      id,
      [() => rollSequence()],
      () => {
        if (speak) say(pickPetLine(PET_HOME_TRICK_LINES, live.current.name));
        endAwake(id);
      },
    );
  }

  function trick(name: TapName) {
    // Ordinary calm-tap lines show about 70% of the time, never two silent taps in a row.
    const lineFrom = (group: readonly string[]) => () => {
      const silent = !silentTap.current && Math.random() >= CALM_BUBBLE_CHANCE;
      silentTap.current = silent;
      if (!silent) say(pickPetLine(group, live.current.name));
    };
    const trickLine = lineFrom(PET_HOME_TRICK_LINES);
    const happyLine = lineFrom(PET_HAPPY);
    const run = (safe: boolean, steps: Step[], line: () => void) => {
      const id = begin(safe);
      runSteps(id, steps, () => {
        line();
        endAwake(id);
      });
    };
    const landDust = () =>
      dustAt([
        { x: -14, delay: 0, size: 15 },
        { x: 12, delay: 40, size: 12 },
      ]);

    switch (name) {
      case 'roll':
        startRoll(true);
        return;
      case 'jumpSpin':
        run(true, [() => moveJumpSpin(body, landDust)], trickLine);
        return;
      case 'stretch':
        run(true, [() => Animated.sequence([moveBigStretch(body), moveWiggle(body)])], trickLine);
        return;
      case 'wiggle':
        run(true, [() => moveWiggle(body)], happyLine);
        return;
      case 'startle':
        run(true, [() => moveStartle(body)], lineFrom(PET_STARTLED));
        return;
      case 'lookAround':
        run(true, [() => moveLookAround(body)], lineFrom(PET_CURIOUS));
        return;
      case 'curlPeek':
        run(
          false,
          [
            () => Animated.sequence([squashTo(0.6, 90), squashTo(0, 60)]),
            () => {
              setCurled(true);
              return curlWait();
            },
            () => moveRock(body, 1),
            () => 450,
            () => moveRock(body, -1),
            () => {
              setCurled(false);
              return unfurlWait();
            },
            () => moveWiggle(body),
          ],
          happyLine,
        );
        return;
      case 'dance':
        run(
          true,
          [
            () => moveDance(body),
            () =>
              Animated.parallel([
                moveHop(body, 0.7),
                Animated.sequence([
                  Animated.delay(HOP_LAND_MS),
                  call(() => dustAt([{ x: 0, delay: 0, size: 14 }])),
                ]),
              ]),
          ],
          happyLine,
        );
        return;
      case 'happy':
        // The hugging-itself drawing, held 4 s, then back on its own.
        run(
          true,
          [
            () => {
              requestFace('happy', { hold: HAPPY_HOLD_MS, auto: true });
              return 450;
            },
            () => moveWiggle(body),
          ],
          happyLine,
        );
        return;
      case 'proud':
        run(
          true,
          [
            () => {
              requestFace('proud', { hold: PROUD_HOLD_MS, auto: true });
              return 450;
            },
            () => moveHop(body, 0.6),
          ],
          happyLine,
        );
        return;
    }
  }

  /** One calm tap. Face-changing reactions are rare; the rest keep the current face. */
  function happyTap(now: number) {
    if (still()) {
      if (live.current.reduce === true) say(pickPetLine(PET_HAPPY, live.current.name));
      return;
    }
    const faceOk = now - lastFaceReact.current >= FACE_REACT_GAP_MS && faceNow() === null;
    const weights: Partial<Record<TapName, number>> = { ...MOVE_WEIGHTS };
    if (live.current.rollTravel <= 0) weights.roll = 0;
    if (faceOk) Object.assign(weights, FACE_WEIGHTS);
    const pick = weightedPick<TapName>(weights, lastTrick.current);
    lastTrick.current = pick;
    if (pick === 'happy' || pick === 'proud') lastFaceReact.current = now;
    trick(pick);
  }

  // ---- the spam ladder: warn, angry, storm off ----

  /** Rung 1: a warning. The face does not change. */
  function doWarn() {
    const kind = activity.current;
    if (kind && !busy.current) {
      // Keep the activity going; just shake the head and carry on.
      lockUntil.current = Date.now() + 1300;
      say(pickPetLine(PET_WARN), { defer: true });
      if (still()) return;
      const id = seq.current;
      playMove(moveHeadShake(body), (finished) => {
        if (finished && id === seq.current && activity.current === kind) playMove(activityLoop(kind));
      });
      return;
    }
    const id = begin(true);
    say(pickPetLine(PET_WARN), { defer: true });
    if (still()) {
      later(id, () => endAwake(id), 900);
      return;
    }
    runSteps(id, [() => moveHeadShake(body), () => 700], () => endAwake(id));
  }

  /** Rung 2: angry face, a stomp and a huff, a line. Held until it has been left alone. */
  function enterAngry() {
    const id = begin(true, true);
    emo.current = 'angry';
    requestFace('angry', { force: true });
    lastAngryLine.current = Date.now();
    say(pickPetLine(PET_ANGRY), { defer: true });
    const hold = () => {
      if (id !== seq.current) return;
      busy.current = false;
      interruptible.current = true;
      scheduleAngryCheck();
    };
    if (still()) {
      hold();
      return;
    }
    runSteps(id, [() => 450, () => moveStomp(body), () => moveHuff(body)], hold);
  }

  /** Wakes up when angry has gone ANGRY_HOLD_MS without a tap. */
  function scheduleAngryCheck() {
    clearAngryTimer();
    const wait = Math.max(250, ladder.current.lastTapAt + ANGRY_HOLD_MS - Date.now());
    angryTimer.current = setTimeout(() => {
      angryTimer.current = null;
      if (!mounted.current || emo.current !== 'angry') return;
      const step = ladderTick(ladder.current, Date.now());
      ladder.current = step.state;
      if (step.action === 'soften') soften();
      else scheduleAngryCheck();
    }, wait);
  }

  /** While angry: no face change, a shiver if the body is free, a line at most every 2.5 s. */
  function angryTap(now: number) {
    if (!still() && running.current === null && !busy.current) playMove(moveShiver(body));
    if (now - lastAngryLine.current >= ANGRY_LINE_GAP_MS) {
      lastAngryLine.current = now;
      say(pickPetLine(PET_ANGRY));
    }
    scheduleAngryCheck();
  }

  /** Left alone long enough: sad about half the time, otherwise straight back to normal. */
  function soften() {
    const id = begin(true);
    patience.reset();
    ladder.current = createLadder();
    if (Math.random() < SAD_CHANCE) {
      getSad(id);
      return;
    }
    emo.current = 'awake';
    requestFace(null);
    say(pickPetLine(PET_COMING_BACK), { defer: true });
    if (still()) {
      later(id, () => finishCalm(id), 600);
      return;
    }
    runSteps(id, [() => 500, () => moveNod(body)], () => finishCalm(id));
  }

  /** Hurt feelings: the sad drawing for 15-20 s; one gentle tap after a pause cheers it up. */
  function getSad(id: number) {
    emo.current = 'sad';
    sadSince.current = Date.now();
    requestFace('sad', { force: true });
    say(pickPetLine(PET_SAD), { defer: true });
    if (!still()) {
      runSteps(id, [() => 600, () => moveDroop(body), () => 4500, () => moveDroop(body)], () => {
        if (id === seq.current) busy.current = false;
      });
    } else {
      busy.current = false;
    }
    later(
      id,
      () => {
        emo.current = 'awake';
        requestFace(null);
        say(pickPetLine(PET_COMING_BACK), { defer: true });
        later(id, () => finishCalm(id), 500);
      },
      SAD_MIN_MS + Math.random() * SAD_SPREAD_MS,
    );
  }

  function tapSad(now: number) {
    if (now - sadSince.current < SAD_TAP_AFTER_MS) return;
    cheerUp(now);
  }

  /** The gentle tap worked: the happy drawing held 4 s, a hop, a forgiving line. */
  function cheerUp(now: number) {
    const id = begin(true);
    emo.current = 'awake';
    lastFaceReact.current = now;
    requestFace('happy', { force: true, hold: HAPPY_HOLD_MS, auto: true });
    say(pickPetLine(PET_FORGIVEN), { defer: true });
    if (still()) {
      later(id, () => finishCalm(id), 600);
      return;
    }
    runSteps(id, [() => 450, () => moveHop(body, 0.9)], () => finishCalm(id));
  }

  /** Rung 3: always curls up and rolls off. Gone 6-9 s, back turned 6 s, sulks 15-20 s. */
  function stormOff() {
    const id = begin(false, true);
    patience.reset();
    ladder.current = createLadder();
    // The pet is not there to tap from the moment it turns to go.
    emo.current = 'gone';
    const goneMs = GONE_MIN_MS + Math.random() * GONE_SPREAD_MS;
    const sulkMs = SULK_MIN_MS + Math.random() * SULK_SPREAD_MS;
    if (still() || live.current.rollTravel <= 0) {
      // No rolling with Reduce Motion: it just stays angry and ignores you.
      say(pickPetLine(PET_STORM_OFF), { defer: true });
      later(id, () => {
        emo.current = 'sulking';
        emotes.current?.play('dots');
      }, 600);
      later(id, () => {
        requestFace(null);
        say(pickPetLine(PET_COMING_BACK), { defer: true });
        later(id, () => finishCalm(id), 500);
      }, 600 + sulkMs);
      return;
    }
    const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    const travel = live.current.rollTravel;
    const w = live.current.width;
    const size = live.current.petSize;
    const off = (w / 2 + size * 0.75) / travel;
    const peek = (w / 2 + size * 0.1) / travel;
    const exitEase = Easing.in(Easing.cubic);
    const exitMs = 700;
    const returnEase = Easing.out(Easing.cubic);
    const returnMs = 1300;
    runSteps(
      id,
      [
        () => {
          say(pickPetLine(PET_STORM_OFF), { defer: true });
          return 600;
        },
        () => Animated.sequence([squashTo(0.6, 90), squashTo(0, 60)]),
        () => {
          setCurled(true);
          return curlWait();
        },
        () =>
          Animated.parallel([
            rollTo(dir * off, exitMs, exitEase),
            call(() =>
              dustAt(legPuffs(exitEase, exitMs, 0, dir * off, [dir * 0.25, dir * 0.7, dir * 1.2], travel)),
            ),
          ]),
        () => {
          stormPhase.current = 'gone';
          const now = Date.now();
          const goneUntil = now + goneMs;
          const backUntil = goneUntil + PEEK_PHASE_MS + returnMs + BACK_TURNED_MS;
          storm.current = { goneUntil, backUntil, sulkUntil: backUntil + sulkMs };
          return Math.round(goneMs * 0.45);
        },
        () => {
          say(pickPetLine(PET_GONE_BUBBLE), { force: true, ms: 2600 });
          return Math.round(goneMs * 0.55);
        },
        // A peek round the edge, then it thinks better of it, then it comes back.
        () => rollTo(dir * peek, 900, Easing.out(Easing.quad)),
        () => 700,
        () => rollTo(dir * off, 450, Easing.in(Easing.quad)),
        () => 650,
        () =>
          Animated.parallel([
            rollTo(0, returnMs, returnEase),
            call(() =>
              dustAt(legPuffs(returnEase, returnMs, dir * off, 0, [dir * 1.1, dir * 0.6, dir * 0.2], travel)),
            ),
          ]),
        () => moveLand(body, 0.8),
        () => moveRock(body, dir === 1 ? -1 : 1),
        () => 500,
        // Unfurls still angry, with its back turned.
        () => {
          emo.current = 'sulking';
          setFlip(true);
          setCurled(false);
          return unfurlWait();
        },
        ...stormTail(),
      ],
      () => finishCalm(id),
    );
  }

  /** From "back turned" to the end; each wait is worked out from the clock when it starts. */
  function stormTail(): Step[] {
    return [
      () => {
        stormPhase.current = 'back';
        return Math.max(0, (storm.current?.backUntil ?? 0) - Date.now());
      },
      // Turns round with a squash, still angry.
      () => movePoseSwap(body, () => mounted.current && setFlip(false)),
      () => {
        stormPhase.current = 'sulk';
        return Math.max(0, (storm.current?.sulkUntil ?? 0) - Date.now());
      },
      () => {
        stormPhase.current = null;
        requestFace(null);
        say(pickPetLine(PET_COMING_BACK), { defer: true });
        return 500;
      },
      () => moveHop(body, 0.5),
    ];
  }

  /**
   * Back on Home (or in the app) after a while: a storm that has run its course
   * is not replayed. The pet is simply where it would be by now.
   * Returns true when it took over.
   */
  function reconcileStorm(): boolean {
    const tl = storm.current;
    if (!tl || !stormPhase.current || !entered.current) return false;
    const now = Date.now();
    const phase = stormPhase.current;
    if (phase === 'gone' && now < tl.goneUntil) return false;
    if (phase === 'back' && now < tl.backUntil) return false;
    if (phase === 'sulk' && now < tl.sulkUntil) return false;
    const id = begin(false);
    roll.setValue(0);
    setCurled(false);
    emo.current = 'sulking';
    if (now >= tl.sulkUntil) {
      stormPhase.current = null;
      setFlip(false);
      requestFace(null, { force: true });
      finishCalm(id);
      return true;
    }
    setFlip(now < tl.backUntil);
    const tail = stormTail();
    // From the phase it should be in now, not from the top.
    const from = now < tl.backUntil ? 0 : 2;
    runSteps(id, [() => 200, ...tail.slice(from)], () => finishCalm(id));
    return true;
  }

  /** Sulking: it does not listen. A shiver, some dots, hardly ever a word. */
  function tapSulk() {
    const r = Math.random();
    if (r < 0.25 && running.current === null && !still()) playMove(moveShiver(body));
    else if (r < 0.7) emotes.current?.play('dots');
    if (r > 0.85) say(pickPetLine(PET_IGNORING));
  }

  // ---- the tap ----

  function fireAction(action: Pending) {
    if (emo.current === 'awake' && busy.current && !interruptible.current) {
      // Mid roll: wait until it is back on its feet.
      const waiting = pending.current;
      if (waiting === null || PENDING_RANK[action] > PENDING_RANK[waiting]) pending.current = action;
      return;
    }
    if (action === 'warn') doWarn();
    else if (action === 'angry') enterAngry();
    else stormOff();
  }

  function handleTap() {
    hapticSelection();
    if (live.current.reduce === null) return;
    const now = Date.now();
    const state = emo.current;
    if (state === 'asleep') return tapAsleep();
    if (state === 'gone') return;
    if (state === 'sulking') return tapSulk();
    if (state === 'sad') return tapSad(now);
    if (state === 'grumpy') return tapGrumpy(now);

    // Awake or angry: every tap feeds the ladder, whatever else is going on.
    const verdict =
      ladder.current.phase === 'calm' && now >= graceUntil.current ? patience.tap(now) : 'fine';
    const step = ladderTap(ladder.current, now, verdict);
    ladder.current = step.state;
    if (step.action === 'warn' || step.action === 'angry' || step.action === 'storm') {
      fireAction(step.action);
      return;
    }
    if (state === 'angry') return angryTap(now);
    // A reaction is already running or locked: extra taps do nothing more.
    if (busy.current || now < lockUntil.current) return;
    if (activity.current) return activityTap(now);
    happyTap(now);
  }

  function nextIdle(): Animated.CompositeAnimation {
    const options: IdleName[] = ['look', 'shift', 'stretch', 'hop'];
    let pick = options[Math.floor(Math.random() * options.length)] ?? 'look';
    if (pick === lastIdle.current) {
      pick = options[(options.indexOf(pick) + 1) % options.length] ?? 'hop';
    }
    lastIdle.current = pick;
    if (pick === 'look') return moveLookAround(body);
    if (pick === 'shift') {
      const dir = shiftDir.current;
      shiftDir.current = dir === 1 ? -1 : 1;
      return moveWeightShift(body, dir);
    }
    if (pick === 'stretch') return moveBigStretch(body);
    return moveHop(body, 0.6);
  }

  const actions = useRef({
    roll: (_speak: boolean) => {},
    idle: (): Animated.CompositeAnimation => moveLookAround(body),
    play: (_anim: Animated.CompositeAnimation) => {},
    returned: (_awayMs: number) => {},
    quietWake: () => {},
    sleep: () => {},
    wander: () => {},
    mood: () => {},
  });
  actions.current = {
    roll: startRoll,
    idle: nextIdle,
    play: playMove,
    returned: (awayMs: number) => {
      if (!entered.current || live.current.reduce === null) return;
      if (reconcileStorm()) return;
      if (emo.current === 'asleep') {
        if (!currentReason() || !sleepAllowed()) quietWake();
        return;
      }
      if (emo.current !== 'awake' || busy.current) return;
      if (!wokenRef.current || awayMs >= REENTER_MS) {
        maybeSleep(true);
        if (emo.current !== 'awake') return;
      }
      // Something new to be doing, now that it has been a while.
      if (awayMs >= NEW_ACTIVITY_AWAY_MS && activityAllowed() && Math.random() < ACTIVITY_CHANCE) {
        startActivity(pickActivity());
      }
    },
    quietWake,
    sleep: maybeSleep,
    // The slow clock: bedtime, a new activity, or a small fidget.
    wander: () => {
      // Home left open past 07:00 (or the end of the nap): it wakes up by itself.
      if (emo.current === 'asleep' && !busy.current && !currentReason()) {
        quietWake();
        return;
      }
      if (emo.current !== 'awake' || busy.current) return;
      maybeSleep();
      if (emo.current !== 'awake' || busy.current || activity.current) return;
      if (Date.now() >= nextActivityAt.current && activityAllowed()) {
        if (Math.random() < 0.6) {
          startActivity(pickActivity());
        } else {
          nextActivityAt.current = Date.now() + 30000 + Math.random() * 30000;
        }
        return;
      }
      if (still() || running.current !== null) return;
      if (Math.random() < 0.1) actions.current.roll(false);
      else actions.current.play(actions.current.idle());
    },
    // The server's mood changed: an activity does not outlast a mood it was only for in a plain one.
    mood: () => {
      const m = live.current.mood;
      const plain = m === 'idle' || m === 'ready' || m === 'sleepy';
      if (emo.current === 'asleep' && !plain) {
        quietWake();
      } else if (activity.current && !(m === 'idle' || m === 'ready')) {
        const id = begin(true);
        endAwake(id);
      }
    },
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      seq.current += 1;
      seqTimers.current.forEach(clearTimeout);
      seqTimers.current = [];
      clearAngryTimer();
      if (grumpyTimer.current) clearTimeout(grumpyTimer.current);
      if (sayTimer.current) clearTimeout(sayTimer.current);
      if (deferTimer.current) clearTimeout(deferTimer.current);
      const current = running.current;
      running.current = null;
      current?.stop();
      bubble.stopAnimation();
    };
  }, [bubble]);

  // Leaving the tab and coming back (or the app) later: it may be time for bed, or something new.
  useFocusEffect(
    useCallback(() => {
      if (awayAt.current !== null) {
        const away = Date.now() - awayAt.current;
        awayAt.current = null;
        actions.current.returned(away);
      }
      return () => {
        awayAt.current = Date.now();
      };
    }, []),
  );
  useEffect(() => {
    let leftAt: number | null = null;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') leftAt = Date.now();
      else if (state === 'active' && leftAt !== null) {
        const away = Date.now() - leftAt;
        leftAt = null;
        actions.current.returned(away);
      }
    });
    return () => sub.remove();
  }, []);

  // A session finished (or something else changed the mood) under a sleeper or an activity.
  useEffect(() => {
    actions.current.mood();
  }, [mood]);

  // First appearance: mount the curled ball, then roll it in on the next commit
  // so the interpolations are already on a native view.
  useEffect(() => {
    if (!hasPet || reduceMotion === null) return;
    if (reduceMotion) {
      if (!entered.current && running.current === null) {
        // Reduce Motion arrived after the curled start pose was set: show the pet at rest.
        roll.setValue(0);
        setCurled(false);
        busy.current = false;
      }
      entered.current = true;
      if (!ready) setReady(true);
      if (!decided.current) {
        decided.current = true;
        actions.current.sleep();
        if (emo.current === 'awake' && activityAllowed() && Math.random() < ACTIVITY_CHANCE) {
          startActivity(pickActivity());
        }
      }
      return;
    }
    if (!ready) {
      if (rollTravel <= 0) return;
      busy.current = true;
      roll.setValue(ROLL_START);
      setCurled(true);
      setReady(true);
      return;
    }
    if (entered.current) return;
    if (rollTravel <= 0) {
      busy.current = false;
      return;
    }
    entered.current = true;
    decided.current = true;
    const past = ARRIVE_PAST / rollTravel;
    const ease = Easing.out(Easing.cubic);
    const rollMs = 880;
    dust.current?.play(
      legPuffs(ease, rollMs, ROLL_START, past, [-1.15, -0.72, -0.32, 0.02], rollTravel),
    );
    // What is it up to? Asleep in sleeping hours, otherwise often mid-activity.
    const sleepNow = !wokenRef.current && sleepAllowed() && currentReason() !== null;
    const m = live.current.mood;
    const doing: Activity | null =
      !sleepNow && live.current.stage > 1 && (m === 'idle' || m === 'ready') && Math.random() < ACTIVITY_CHANCE
        ? pickActivity()
        : null;
    const id = begin(false);
    runSteps(
      id,
      [
        () =>
          Animated.sequence([
            rollTo(past, rollMs, ease),
            rollTo(0, 190, Easing.inOut(Easing.quad)),
            moveRock(body, 1),
            call(() => {
              if (mounted.current) setCurled(false);
            }),
            Animated.delay(unfurlWait()),
            sleepNow
              ? moveBigStretch(body)
              : doing
                ? moveNod(body)
                : Animated.parallel([
                    moveHop(body, 0.6),
                    Animated.sequence([
                      Animated.delay(HOP_LAND_MS),
                      call(() => {
                        dust.current?.play([{ x: 0, delay: 0, size: 14 }]);
                      }),
                    ]),
                  ]),
          ]),
      ],
      () => {
        if (id !== seq.current) return;
        const reason = sleepNow ? currentReason() : null;
        if (reason) fallAsleep(reason);
        else if (doing) startActivity(doing);
        else endAwake(id);
      },
    );
    // Everything it calls reads refs or the latest values through `live`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPet, ready, reduceMotion, roll, rollTravel]);

  // The slow clock: now and then bedtime, a new activity, a fidget or a roll.
  useEffect(() => {
    if (!ready || reduceMotion === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    const schedule = () => {
      timer = setTimeout(() => {
        if (!alive || !mounted.current) return;
        actions.current.wander();
        if (alive) schedule();
      }, 6000 + Math.random() * 5000);
    };
    schedule();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      // A trick owns the body until it finishes. An idle fidget does not.
      if (!busy.current && emo.current === 'awake' && !activity.current) {
        stopLoop();
      }
    };
  }, [ready, reduceMotion, body]);

  return (
    <View style={styles.panel}>
      <View
        pointerEvents="none"
        style={[
          styles.hill,
          {
            width: hillSize,
            height: hillSize,
            borderRadius: hillSize / 2,
            left: (width - hillSize) / 2,
            top: petAreaHeight - petSize * 0.24,
          },
        ]}
      />

      <View style={{ height: petAreaHeight }} pointerEvents="box-none">
        {/* Dust kicked up on the hill; x is measured from the centre of the scene. */}
        <View pointerEvents="none" style={[styles.dustOrigin, { left: width / 2 }]}>
          <Dust ref={dust} color={DUST_PALE} />
        </View>
        {pet && ready ? (
          // Centred on the hill's crest. Only the ears reach the header's height, and
          // they sit near the centre, clear of the left-hand name column.
          <View pointerEvents="box-none" style={styles.petSlot}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.groundShadow,
                shadowMotion,
                {
                  width: shadowW,
                  height: shadowH,
                  borderRadius: shadowW / 2,
                  marginLeft: -shadowW / 2,
                },
              ]}
            />
            <Animated.View style={{ transform: [{ translateX: rollMotion.translateX }] }}>
              <Animated.View style={bodyLook.mover}>
                <Animated.View style={[bodyLook.squash, styles.poseBox, { width: petSize, height: petSize }]}>
                  {/* Spin sits inside the squash so a wall hit flattens on the ground. */}
                  <Animated.View
                    style={[styles.poseBox, { width: petSize, height: drawn, transform: [{ rotate: rollMotion.rotate }] }]}
                  >
                    <View style={flipStyle}>
                      <Pet
                        stage={curled ? 1 : pet.stage}
                        mood={curled ? 'ready' : shownMood}
                        size={petSize}
                        shadow={false}
                        accessibilityLabel={petName}
                        onPress={handleTap}
                      />
                    </View>
                  </Animated.View>
                </Animated.View>
              </Animated.View>
              {/* Zs while it sleeps and dots when it ignores you: over the pet, never taking a touch. */}
              <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: petSize, height: petSize }}>
                <PetEmotes
                  ref={emotes}
                  size={petSize}
                  zzz={sleeping}
                  zzzAt={face === 'bed' && pet.stage > 1 ? 'bed' : 'head'}
                  tone="light"
                />
              </View>
            </Animated.View>
          </View>
        ) : null}
      </View>

      {pet ? (
        <View pointerEvents="none" style={styles.pillSlot}>
          <View style={styles.pill}>
            <Text style={styles.pillText}>{petGrowthCopy(pet)}</Text>
            {pet.stage < 5 ? (
              <View style={styles.track}>
                <View style={[styles.trackFill, { width: TRACK_WIDTH * stageProgress(pet) }]} />
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {children ? (
        <View style={styles.actions}>{children}</View>
      ) : (
        <View style={styles.noActions} />
      )}

      {/* After the pet so the text stays readable and tappable where they meet. */}
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <View style={styles.greetingRow}>
          <Text style={styles.greeting}>
            {greeting}
            {firstName ? ', ' : ''}
          </Text>
          {firstName ? (
            <TouchableOpacity
              onPress={onPressFirstName}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Edit name"
              style={styles.greetingHit}
            >
              <Text style={styles.greeting}>{firstName}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <Text
          // Long names shrink a little, then wrap once, rather than running under the pet.
          style={styles.petName}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {petName}
        </Text>
      </View>

      {says ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.says, { top: topInset + 16 }, bubbleMotion]}
          accessible
          accessibilityRole="text"
          accessibilityLabel={says}
        >
          <Text style={styles.saysText}>{says}</Text>
          <View style={styles.saysTail} />
        </Animated.View>
      ) : null}
    </View>
  );
}

export function SceneLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sceneLabel}>{children}</Text>;
}

export function SceneTitle({
  children,
  hasBody,
}: {
  children: React.ReactNode;
  hasBody?: boolean;
}) {
  return (
    <Text style={[styles.sceneTitle, hasBody ? styles.sceneTitleWithBody : null]} numberOfLines={2}>
      {children}
    </Text>
  );
}

export function SceneBody({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sceneBody}>{children}</Text>;
}

export function SceneButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.sceneButton}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
    >
      <Text style={styles.sceneButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function SceneLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button">
      <Text style={styles.sceneLink}>{label}</Text>
    </TouchableOpacity>
  );
}
const styles = StyleSheet.create({
  panel: {
    width: '100%',
    backgroundColor: colors.primary,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  hill: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  // Kept to the left so the name sits beside the pet, not across it.
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    paddingHorizontal: 20,
    maxWidth: '48%',
    overflow: 'hidden',
  },
  greetingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
  },
  greeting: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  greetingHit: {
    maxWidth: '100%',
  },
  petName: {
    ...type.title,
    color: '#FFFFFF',
    marginTop: 2,
  },
  petSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  poseBox: {
    justifyContent: 'flex-end',
  },
  groundShadow: {
    position: 'absolute',
    bottom: 0,
    left: '50%',
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
  pillSlot: {
    marginTop: 10,
    alignItems: 'center',
  },
  dustOrigin: {
    position: 'absolute',
    bottom: 2,
    width: 1,
    height: 24,
  },
  // What the pet says after its roll: top right, pointing down at it.
  says: {
    position: 'absolute',
    right: 14,
    maxWidth: '44%',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  saysText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  saysTail: {
    position: 'absolute',
    left: 18,
    bottom: -7,
    width: 12,
    height: 12,
    backgroundColor: colors.surface,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.textPrimary,
    transform: [{ rotate: '45deg' }],
  },
  pill: {
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  track: {
    width: TRACK_WIDTH,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    marginTop: 6,
    overflow: 'hidden',
  },
  trackFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  actions: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 22,
  },
  noActions: {
    paddingBottom: 16,
  },
  sceneLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: '#FFFFFF',
    opacity: 0.7,
    marginBottom: 6,
  },
  sceneTitle: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 30,
    color: '#FFFFFF',
    marginBottom: 14,
  },
  sceneTitleWithBody: {
    marginBottom: 6,
  },
  sceneBody: {
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255, 255, 255, 0.85)',
    marginBottom: 14,
  },
  sceneButton: {
    height: 54,
    borderRadius: 999,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sceneButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.primaryDeep,
  },
  sceneLink: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
    paddingVertical: 10,
  },
});
