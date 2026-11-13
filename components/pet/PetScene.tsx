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
  PET_DIZZY,
  PET_DIZZY_UP,
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
  PET_SAD,
  PET_SLEEP_HALF,
  PET_SLEEP_MUMBLE,
  PET_STARTLED,
  PET_STORM_OFF,
  PET_WARN,
  PET_WOKEN_GRUMPY,
  pickPetLine,
} from '../../constants/petMoodLines';
import { hapticSelection } from '../../lib/haptics';
import { petGrowthCopy, stageProgress, type PetState } from '../../lib/pet';
import { createPatience, petSleepReason, type SleepReason } from '../../lib/petTemper';
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
  moveHop,
  moveHuff,
  moveJumpSpin,
  moveLand,
  moveLookAround,
  moveRock,
  moveShiver,
  moveSnore,
  moveStagger,
  moveStartle,
  moveStomp,
  moveWeightShift,
  moveWiggle,
  petBodyStyles,
  restBody,
} from './petMotion';

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
/** After a meltdown, taps do not count toward patience for this long. */
const GRACE_MS = 4000;
const HIDE_MS = 8000;
const GONE_MIN_MS = 5000;
const GONE_SPREAD_MS = 2000;
const SAD_AUTO_MS = 6500;
const SAD_TAP_AFTER_MS = 1500;
const LIE_DOWN_MS = 3500;
/** Coming back to the tab after this long, a woken pet may fall asleep again. */
const REENTER_MS = 10 * 60 * 1000;

type IdleName = 'look' | 'shift' | 'stretch' | 'hop';

/**
 * awake    up, ready to be tapped
 * asleep   lying down with Zs; taps stir it
 * annoyed  the warning (head shake)
 * angry    a scripted outburst or wake-up; taps are ignored
 * gone     rolled off screen
 * sulking  curled up, not listening
 * sad      drooping, waits for one gentle tap
 */
type Emo = 'awake' | 'asleep' | 'annoyed' | 'angry' | 'gone' | 'sulking' | 'sad';
type Verdict = 'warn' | 'snap';
type TapName =
  | 'roll'
  | 'jumpSpin'
  | 'stretch'
  | 'wiggle'
  | 'proud'
  | 'startle'
  | 'lookAround'
  | 'curlPeek'
  | 'dance';
type Meltdown = 'storm' | 'hide' | 'sad' | 'dizzy';
/** One step of a script: a move to play, a wait in ms, or nothing (just do it). */
type Step = () => Animated.CompositeAnimation | number | void;

// Calm taps lean affectionate; the long roll is the rarest.
const TAP_WEIGHTS: Record<TapName, number> = {
  roll: 1,
  jumpSpin: 2,
  stretch: 1,
  wiggle: 3,
  proud: 2,
  startle: 1,
  lookAround: 1,
  curlPeek: 1.5,
  dance: 2,
};
const MELTDOWN_WEIGHTS: Record<Meltdown, number> = { storm: 3, hide: 2, sad: 2.5, dizzy: 1.5 };

/** A random key by weight, never `avoid` (so the same thing never happens twice in a row). */
function weightedPick<T extends string>(weights: Record<T, number>, avoid: T | null): T {
  const all = Object.keys(weights) as T[];
  const keys = all.filter((key) => weights[key] > 0 && key !== avoid);
  const total = keys.reduce((sum, key) => sum + weights[key], 0);
  let r = Math.random() * total;
  for (const key of keys) {
    r -= weights[key];
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

  // --- The pet is alive: it rolls in, fidgets, sleeps, and has feelings when tapped. ---
  const reduceMotion = useReduceMotion();
  const hasPet = pet !== null;
  const [ready, setReady] = useState(false);
  const [curled, setCurled] = useState(false);
  const [says, setSays] = useState<string | null>(null);
  // What the emotion shows on the pet's face, over the server's mood. null = the baseline.
  const [face, setFace] = useState<PetMood | null>(null);
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
  const seq = useRef(0);
  const seqTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const sayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef<Animated.CompositeAnimation | null>(null);
  const lastIdle = useRef<IdleName | null>(null);
  const shiftDir = useRef<1 | -1>(1);
  const dust = useRef<DustHandle>(null);
  const emotes = useRef<PetEmotesHandle>(null);

  const emo = useRef<Emo>('awake');
  const pending = useRef<Verdict | null>(null);
  const patience = useRef(createPatience()).current;
  const graceUntil = useRef(0);
  const lastTrick = useRef<TapName | null>(null);
  const lastMelt = useRef<Meltdown | null>(null);
  const wokenRef = useRef(false);
  const sleepReason = useRef<SleepReason | null>(null);
  const stir = useRef(0);
  const napNeed = useRef(5);
  const sadSince = useRef(0);
  const awayAt = useRef<number | null>(null);

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

  /** A timer that only fires if the script that set it is still the current one. */
  function later(id: number, fn: () => void, ms: number) {
    seqTimers.current.push(
      setTimeout(() => {
        if (mounted.current && id === seq.current) fn();
      }, ms),
    );
  }

  function say(line: string, ms: number = SAY_MS) {
    if (!mounted.current) return;
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
    }, ms);
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

  /**
   * Start a new script: everything the last one had pending (moves, timers,
   * emotes) is cancelled, and its late callbacks can no longer change anything.
   * `safe` says the script may be cut off at any moment (no rolling or curling).
   */
  function begin(safe: boolean): number {
    seq.current += 1;
    seqTimers.current.forEach(clearTimeout);
    seqTimers.current = [];
    const prev = running.current;
    running.current = null;
    prev?.stop();
    restBody(body);
    emotes.current?.stop();
    busy.current = true;
    interruptible.current = safe;
    pending.current = null;
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

  /** Back to ordinary: awake, free, nothing on the pet's face. */
  function endAwake(id: number) {
    if (id !== seq.current || !mounted.current) return;
    emo.current = 'awake';
    busy.current = false;
    interruptible.current = true;
    setFace(null);
    setFlip(false);
    const waiting = pending.current;
    pending.current = null;
    if (waiting === 'snap') doMeltdown();
    else if (waiting === 'warn') doWarn();
  }

  function finishMeltdown(id: number) {
    if (id !== seq.current) return;
    patience.reset();
    graceUntil.current = Date.now() + GRACE_MS;
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

  function fallAsleep(reason: SleepReason) {
    const id = begin(true);
    sleepReason.current = reason;
    stir.current = 0;
    napNeed.current = 5 + (Math.random() < 0.5 ? 1 : 0);
    emo.current = 'asleep';
    if (live.current.reduce !== false) {
      setFace('sleepy');
      setSleeping(true);
      busy.current = false;
      return;
    }
    runSteps(id, [
      () => 250,
      () => {
        setFace('sleepy');
        setSleeping(true);
        return 700;
      },
      () => {
        busy.current = false;
        return Animated.loop(moveSnore(body));
      },
    ]);
  }

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
    endAwake(id);
  }

  function snoring(): Animated.CompositeAnimation {
    busy.current = false;
    return Animated.loop(moveSnore(body));
  }

  function tapAsleep() {
    // Mid curl-up gag: let it finish, it ends back in the ball's unfurled pose.
    if (busy.current && !interruptible.current) return;
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
    if (live.current.reduce !== false) {
      busy.current = false;
      say(line);
      return;
    }
    if (!ballTap) {
      say(line);
      runSteps(id, [
        () => (n % 2 === 0 ? moveRock(body, n % 4 === 0 ? 1 : -1) : moveShiver(body)),
        () => snoring(),
      ]);
      return;
    }
    runSteps(id, [
      () => {
        say(line);
        return moveShiver(body);
      },
      () => {
        setCurled(true);
        return curlWait();
      },
      () => {
        say(pickPetLine(PET_NAP_BALL));
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
    emo.current = 'angry';
    setSleeping(false);
    say(pickPetLine(nap ? PET_NAP_UP : PET_NIGHT_UP));
    const settle = () => {
      wokenRef.current = true;
      setWoken(true);
      setFace(null);
    };
    if (live.current.reduce !== false) {
      setFace('angry');
      later(id, () => say(pickPetLine(PET_WOKEN_GRUMPY)), 1300);
      later(id, settle, 3300);
      later(id, () => finishMeltdown(id), 3700);
      return;
    }
    runSteps(
      id,
      [
        () => {
          setFace('angry');
          emotes.current?.play('vein');
          return 450;
        },
        () => moveStomp(body),
        () => {
          emotes.current?.play('steam');
          return nap ? 500 : 300;
        },
        () => (nap ? moveHuff(body) : undefined),
        () => {
          say(pickPetLine(PET_WOKEN_GRUMPY));
          return nap ? 1800 : 1100;
        },
        () => {
          settle();
          return 450;
        },
      ],
      () => finishMeltdown(id),
    );
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
    if (busy.current || emo.current !== 'awake' || live.current.rollTravel <= 0) return;
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
    const lineFrom = (group: readonly string[]) => () => say(pickPetLine(group, live.current.name));
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
        run(
          true,
          [
            () => {
              emotes.current?.play('hearts');
              return moveWiggle(body);
            },
          ],
          happyLine,
        );
        return;
      case 'proud':
        run(
          true,
          [
            () => {
              setFace('proud');
              emotes.current?.play('sparkle');
              return 400;
            },
            () => moveHop(body, 0.6),
            () => 500,
            () => {
              setFace(null);
              return 400;
            },
          ],
          happyLine,
        );
        return;
      case 'startle':
        run(
          true,
          [
            () => {
              emotes.current?.play('bang');
              return moveStartle(body);
            },
          ],
          lineFrom(PET_STARTLED),
        );
        return;
      case 'lookAround':
        run(
          true,
          [
            () => {
              emotes.current?.play('question');
              return moveLookAround(body);
            },
          ],
          lineFrom(PET_CURIOUS),
        );
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
            () => {
              emotes.current?.play('hearts');
              return moveWiggle(body);
            },
          ],
          happyLine,
        );
        return;
      case 'dance':
        run(
          true,
          [
            () => moveDance(body),
            () => {
              emotes.current?.play('hearts');
              return Animated.parallel([
                moveHop(body, 0.7),
                Animated.sequence([
                  Animated.delay(HOP_LAND_MS),
                  call(() => dustAt([{ x: 0, delay: 0, size: 14 }])),
                ]),
              ]);
            },
          ],
          happyLine,
        );
        return;
    }
  }

  function happyTap() {
    if (live.current.reduce !== false) {
      if (live.current.reduce === true) say(pickPetLine(PET_HAPPY, live.current.name));
      return;
    }
    const weights = { ...TAP_WEIGHTS };
    if (live.current.rollTravel <= 0) weights.roll = 0;
    const pick = weightedPick(weights, lastTrick.current);
    lastTrick.current = pick;
    trick(pick);
  }

  // ---- warning and meltdowns ----

  function doWarn() {
    const id = begin(true);
    emo.current = 'annoyed';
    say(pickPetLine(PET_WARN));
    if (live.current.reduce !== false) {
      setFace('angry');
      later(id, () => setFace(null), 2400);
      later(id, () => endAwake(id), 2800);
      return;
    }
    runSteps(
      id,
      [
        () => {
          setFace('stiff');
          emotes.current?.play(Math.random() < 0.5 ? 'question' : 'vein');
          return 350;
        },
        () => moveHeadShake(body),
        () => 1000,
        () => {
          setFace(null);
          return 400;
        },
      ],
      () => endAwake(id),
    );
  }

  function doMeltdown() {
    patience.reset();
    graceUntil.current = Date.now() + 60000;
    const stage = live.current.stage;
    const weights = { ...MELTDOWN_WEIGHTS };
    if (stage <= 1) weights.dizzy = 0;
    if (live.current.rollTravel <= 0) weights.storm = 0;
    const pick = weightedPick(weights, lastMelt.current);
    lastMelt.current = pick;
    if (live.current.reduce !== false) {
      reducedMeltdown(pick === 'sad' || pick === 'dizzy');
      return;
    }
    if (pick === 'storm') stormOff();
    else if (pick === 'hide') hideInBall();
    else if (pick === 'sad') getSad();
    else dizzyFlop();
  }

  /** Reduce Motion: a pose and a line for a few seconds, then back. */
  function reducedMeltdown(sad: boolean) {
    const id = begin(true);
    emo.current = 'angry';
    setFace(sad ? 'concerned' : 'angry');
    say(pickPetLine(sad ? PET_SAD : PET_ANGRY));
    later(id, () => {
      setFace(null);
      say(pickPetLine(sad ? PET_FORGIVEN : PET_COMING_BACK));
    }, 3200);
    later(id, () => finishMeltdown(id), 3700);
  }

  /** Angry, stomps, curls up and rolls off the side. Gone 5-7 s, then sneaks back. */
  function stormOff() {
    const id = begin(false);
    emo.current = 'angry';
    const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    const travel = live.current.rollTravel;
    const w = live.current.width;
    const size = live.current.petSize;
    const off = (w / 2 + size * 0.75) / travel;
    const peek = (w / 2 + size * 0.1) / travel;
    const goneMs = GONE_MIN_MS + Math.random() * GONE_SPREAD_MS;
    const exitEase = Easing.in(Easing.cubic);
    const exitMs = 700;
    const returnEase = Easing.out(Easing.cubic);
    const returnMs = 1300;
    runSteps(
      id,
      [
        () => {
          setFace('angry');
          emotes.current?.play('vein');
          say(pickPetLine(PET_ANGRY));
          return 450;
        },
        () => {
          emotes.current?.play('steam');
          return moveStomp(body);
        },
        () => {
          say(pickPetLine(PET_STORM_OFF));
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
          emo.current = 'gone';
          return 1800;
        },
        () => {
          say(pickPetLine(PET_GONE_BUBBLE), 2600);
          return goneMs - 1800;
        },
        // A peek round the edge, then it thinks better of it.
        () => rollTo(dir * peek, 900, Easing.out(Easing.quad)),
        () => 650,
        () => rollTo(dir * off, 420, Easing.in(Easing.quad)),
        () => 450,
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
        // Unfurls with its back turned, scowling, and takes a while about it.
        () => {
          emo.current = 'angry';
          setFlip(true);
          setCurled(false);
          return unfurlWait();
        },
        () => 1200,
        () => {
          setFace(null);
          setFlip(false);
          say(pickPetLine(PET_COMING_BACK));
          return 450;
        },
        () => moveHop(body, 0.5),
      ],
      () => finishMeltdown(id),
    );
  }

  /** Curls up on the spot and stops listening. Taps are ignored (see tapSulk). */
  function hideInBall() {
    const id = begin(false);
    emo.current = 'angry';
    runSteps(
      id,
      [
        () => {
          setFace('angry');
          emotes.current?.play('vein');
          say(pickPetLine(PET_ANGRY));
          return 450;
        },
        () => moveStomp(body),
        () => Animated.sequence([squashTo(0.6, 90), squashTo(0, 60)]),
        () => {
          setCurled(true);
          return curlWait();
        },
        () => {
          emo.current = 'sulking';
          emotes.current?.play('dots');
          say(pickPetLine(PET_IGNORING));
          return HIDE_MS;
        },
        // Comes out sad, not angry.
        () => {
          emo.current = 'angry';
          setFace('concerned');
          setCurled(false);
          return unfurlWait();
        },
        () => {
          emotes.current?.play('drop');
          return moveDroop(body);
        },
        () => 900,
        () => {
          setFace(null);
          say(pickPetLine(PET_COMING_BACK));
          return 450;
        },
      ],
      () => finishMeltdown(id),
    );
  }

  function tapSulk() {
    const r = Math.random();
    if (r < 0.3 && running.current === null) playMove(moveShiver(body));
    else if (r < 0.65) emotes.current?.play('dots');
    // Ignoring is the joke: most taps get no line at all.
    if (r > 0.8) say(pickPetLine(PET_IGNORING), 1800);
  }

  /** No anger: it droops and waits for one gentle tap. */
  function getSad() {
    const id = begin(true);
    emo.current = 'sad';
    sadSince.current = Date.now();
    runSteps(
      id,
      [
        () => {
          setFace('concerned');
          say(pickPetLine(PET_SAD));
          emotes.current?.play('drop');
          return 400;
        },
        () => moveDroop(body),
        () => 1500,
        () => {
          emotes.current?.play('drop');
          return moveDroop(body);
        },
        () => SAD_AUTO_MS - 5000,
      ],
      () => cheerUp(),
    );
  }

  function tapSad() {
    if (Date.now() - sadSince.current < SAD_TAP_AFTER_MS) {
      if (running.current === null) playMove(moveShiver(body));
      return;
    }
    cheerUp();
  }

  function cheerUp() {
    const id = begin(true);
    emo.current = 'angry';
    runSteps(
      id,
      [
        () => {
          setFace(null);
          emotes.current?.play('hearts');
          say(pickPetLine(PET_FORGIVEN));
          return 450;
        },
        () => moveHop(body, 0.9),
      ],
      () => finishMeltdown(id),
    );
  }

  /** Staggers, flops down for a minute, gets up. Stage 2 and up only (it needs the lying pose). */
  function dizzyFlop() {
    const id = begin(true);
    emo.current = 'angry';
    runSteps(
      id,
      [
        () => {
          say(pickPetLine(PET_DIZZY));
          emotes.current?.play('question');
          return moveStagger(body);
        },
        () => {
          setFace('sleepy');
          return LIE_DOWN_MS;
        },
        () => {
          setFace(null);
          return 450;
        },
        () => {
          say(pickPetLine(PET_DIZZY_UP));
          return moveHop(body, 0.5);
        },
      ],
      () => finishMeltdown(id),
    );
  }

  // ---- the tap ----

  function handleTap() {
    hapticSelection();
    if (live.current.reduce === null) return;
    const state = emo.current;
    if (state === 'asleep') return tapAsleep();
    if (state === 'sulking') return tapSulk();
    if (state === 'sad') return tapSad();
    if (state === 'gone' || state === 'angry') return;

    const now = Date.now();
    const verdict = now < graceUntil.current ? 'fine' : patience.tap(now);
    if (verdict !== 'fine') {
      if (state === 'awake' && busy.current && !interruptible.current) {
        // Mid roll: wait until it is back on its feet.
        if (verdict === 'snap' || pending.current === null) pending.current = verdict;
        return;
      }
      if (verdict === 'snap') doMeltdown();
      else doWarn();
      return;
    }
    if (state !== 'awake' || busy.current) return;
    happyTap();
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
  });
  actions.current = {
    roll: startRoll,
    idle: nextIdle,
    play: playMove,
    returned: (awayMs: number) => {
      if (!entered.current || live.current.reduce === null) return;
      if (emo.current === 'asleep') {
        if (!currentReason() || !sleepAllowed()) quietWake();
        return;
      }
      if (wokenRef.current && awayMs < REENTER_MS) return;
      maybeSleep(true);
    },
    quietWake,
    sleep: maybeSleep,
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      seq.current += 1;
      seqTimers.current.forEach(clearTimeout);
      seqTimers.current = [];
      if (sayTimer.current) clearTimeout(sayTimer.current);
      const current = running.current;
      running.current = null;
      current?.stop();
      bubble.stopAnimation();
    };
  }, [bubble]);

  // Leaving the tab and coming back (or the app) later: it may be time for bed.
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

  // A session finished (or something else changed the mood) under a sleeper.
  useEffect(() => {
    if (emo.current !== 'asleep') return;
    const m = live.current.mood;
    if (m === 'idle' || m === 'ready' || m === 'sleepy') return;
    actions.current.quietWake();
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
      actions.current.sleep();
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
    const past = ARRIVE_PAST / rollTravel;
    const ease = Easing.out(Easing.cubic);
    const rollMs = 880;
    dust.current?.play(
      legPuffs(ease, rollMs, ROLL_START, past, [-1.15, -0.72, -0.32, 0.02], rollTravel),
    );
    // Asleep at arrival: roll in, unfurl, yawn, then lie down.
    const sleepNow = !wokenRef.current && sleepAllowed() && currentReason() !== null;
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
        else endAwake(id);
      },
    );
    // Everything it calls reads refs or the latest values through `live`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPet, ready, reduceMotion, roll, rollTravel]);

  // Left alone, it shifts about, and now and then goes for a roll on its own.
  useEffect(() => {
    if (!ready || reduceMotion !== false) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    const schedule = () => {
      timer = setTimeout(() => {
        if (!alive || !mounted.current) return;
        if (emo.current === 'awake' && !busy.current && running.current === null) {
          if (Math.random() < 0.1) actions.current.roll(false);
          else actions.current.play(actions.current.idle());
        }
        if (alive) schedule();
      }, 6000 + Math.random() * 5000);
    };
    schedule();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      // A trick owns the body until it finishes. An idle fidget does not.
      if (!busy.current && emo.current === 'awake') {
        const current = running.current;
        running.current = null;
        current?.stop();
        restBody(body);
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
              {/* Zs, steam, hearts: over the pet, never taking a touch. */}
              <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: petSize, height: petSize }}>
                <PetEmotes ref={emotes} size={petSize} zzz={sleeping} tone="light" />
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
