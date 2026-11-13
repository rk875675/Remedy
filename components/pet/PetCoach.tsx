import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../constants/colors';
import type { PetMood } from '../../constants/petImages';
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
import { useReduceMotion } from '../../lib/useReduceMotion';
import { Pet } from './Pet';
import {
  createPetBody,
  moveBigStretch,
  moveHop,
  moveLand,
  moveNod,
  petBodyStyles,
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

export type PetCoachProps = {
  /** Null until the pet state has loaded: nothing is drawn and nothing moves. */
  pet: PetState | null;
  phase: 'exercise' | 'rest';
  /** The exercise on screen (during a rest, the one just finished). */
  exercise: CoachExercise;
  exerciseIndex: number;
  exerciseCount: number;
  setIndex: number;
  totalSets: number;
  restKind: 'set' | 'exercise';
  restSeconds: number;
  restTotal: number;
  /** Seconds left in the current hold (0 when not a timed exercise). */
  countdown: number;
  holdRep: number;
  holdReps: number;
  /** The exit prompt is open: the pet is kind and quiet. */
  exiting: boolean;
  /** Size of the pet's box. */
  size: number;
  /** `corner`: absolute, bottom right of its parent, bubble to the left. `row`: inline, bubble to the right. */
  layout: 'corner' | 'row';
  /** Kept by the session screen so the pet remembers across the exercise and rest screens. */
  memory: CoachMemory;
};

const BUBBLE_MIN_MS = 3800;
const BUBBLE_MS_PER_CHAR = 70;
const TAP_GAP_MS = 2000;
const FACE_REACT_GAP_MS = 6000;
const CHEER_HOLD_MS = 2500;
const STRETCH_HOLD_MS = 3000;

/**
 * The user's own armadillo, as their workout buddy. Owns the pet's whole presence
 * on the exercise and rest screens: its pose, its moves, and a bubble that is
 * never up more than one line at a time. It only reads props and never touches
 * the session's timers or flow.
 */
export function PetCoach(props: PetCoachProps) {
  const { pet, ...rest } = props;
  return pet ? <CoachBody {...rest} pet={pet} /> : null;
}

function CoachBody({
  pet,
  phase,
  exercise,
  exerciseIndex,
  exerciseCount,
  setIndex,
  totalSets,
  restKind,
  restSeconds,
  restTotal,
  countdown,
  holdRep,
  holdReps,
  exiting,
  size,
  layout,
  memory,
}: Omit<PetCoachProps, 'pet'> & { pet: PetState }) {
  const reduceMotion = useReduceMotion();
  const still = reduceMotion !== false;
  const stillRef = useRef(still);
  stillRef.current = still;
  const mounted = useRef(true);
  const { face, request, current: faceNow } = usePetFace();

  const body = useRef(createPetBody()).current;
  const bodyLook = useMemo(() => petBodyStyles(body, { height: size, hop: size * 0.14 }), [body, size]);
  // Arrives from the right on the first look at an exercise.
  const slideIn = phase === 'exercise' && !still && memory.introduced !== exercise.id;
  const enter = useRef(new Animated.Value(slideIn ? 0 : 1)).current;
  const enterX = useMemo(
    () => enter.interpolate({ inputRange: [0, 1], outputRange: [size * 2.4, 0] }),
    [enter, size],
  );
  const bubble = useRef(new Animated.Value(0)).current;
  const bubbleMotion = useMemo(
    () => ({
      opacity: bubble,
      transform: [{ scale: bubble.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
    }),
    [bubble],
  );
  const [line, setLine] = useState<string | null>(null);

  const running = useRef<Animated.CompositeAnimation | null>(null);
  const lineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapAt = useRef(0);
  const lastFaceAt = useRef(0);
  const tapCue = useRef(false);
  const readySaid = useRef(false);
  const wasExiting = useRef(false);
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

  /** One move at a time: a move asked for while another runs is simply skipped. */
  function play(anim: Animated.CompositeAnimation) {
    if (stillRef.current || running.current !== null || !mounted.current) return;
    running.current = anim;
    anim.start(() => {
      if (running.current === anim) running.current = null;
    });
  }

  function hideLine() {
    if (!mounted.current) return;
    if (stillRef.current) {
      bubble.setValue(0);
      setLine(null);
      return;
    }
    Animated.timing(bubble, { toValue: 0, duration: 160, useNativeDriver: true }).start(({ finished }) => {
      if (finished && mounted.current) setLine(null);
    });
  }

  /**
   * One bubble at a time. A normal line waits 6 s after the last; a well-timed
   * (critical) one waits 2 s. `force` is for the exit prompt only.
   */
  function say(text: string, critical: boolean, force = false): boolean {
    if (!mounted.current || text.length === 0) return false;
    const now = Date.now();
    if (!force && !lineAllowed(now, memory.lastLineAt, critical)) return false;
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

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (lineTimer.current) clearTimeout(lineTimer.current);
      const current = running.current;
      running.current = null;
      current?.stop();
      bubble.stopAnimation();
      enter.stopAnimation();
    };
  }, [bubble, enter]);

  // The exercise screen: the first cue when an exercise starts (and at each new
  // set), then a fresh cue every ~13 s.
  useEffect(() => {
    if (phase !== 'exercise') return;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const first = memory.introduced !== exercise.id;
    memory.introduced = exercise.id;
    if (first) memory.cueIndex = 0;
    if (first && !stillRef.current) {
      enter.setValue(0);
      Animated.timing(enter, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) play(moveLand(body, 0.8));
      });
    } else {
      enter.setValue(1);
      play(moveHop(body, 0.5));
    }
    timers.push(
      setTimeout(() => sayRef.current(takeCue(memory, cuesRef.current), true), first ? 700 : 500),
    );
    const chain = () => {
      timers.push(
        setTimeout(() => {
          if (!exitingRef.current) sayRef.current(takeCue(memory, cuesRef.current), false);
          chain();
        }, CUE_EVERY_MS + Math.random() * 1500),
      );
    };
    chain();
    return () => timers.forEach(clearTimeout);
    // The memory is a stable object; `play` and `say` read refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, exercise.id]);

  // Natural points inside a timed hold.
  useEffect(() => {
    const prev = prevCountdown.current;
    prevCountdown.current = countdown;
    const hold = exercise.holdSeconds;
    if (phase !== 'exercise' || !hold || prev === null || prev === countdown || exiting) return;
    const moment = holdMoment(countdown, hold, holdRep, holdReps);
    if (moment === 'last-hold') say(pickPetLine(PET_LAST_HOLD, pet.name), true);
    else if (moment === 'last-seconds') say(pickPetLine(PET_COUNTDOWN_END, pet.name), true);
    else if (moment === 'halfway') say(takeCue(memory, cuesRef.current), false);
    if (countdown >= 1 && countdown <= 3) play(moveNod(body));
    else if (countdown === hold && holdRep > 1) play(moveHop(body, 0.4));
    // Reads the latest props through refs; only the tick matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

  // The rest screen: cheer for the set, then take a break of its own.
  useEffect(() => {
    if (phase !== 'rest') return;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    readySaid.current = false;
    lastFaceAt.current = Date.now();
    request('cheer', { force: true, hold: CHEER_HOLD_MS, auto: true });
    play(moveHop(body, 0.7));
    const exerciseDone = restKind === 'exercise';
    const group = exerciseDone
      ? isHalfway(exerciseIndex, exerciseCount)
        ? PET_HALFWAY
        : PET_EXERCISE_DONE
      : PET_SET_DONE;
    say(pickPetLine(group, pet.name), true);
    if (restTotal >= 14) {
      timers.push(setTimeout(() => sayRef.current(pickPetLine(PET_REST_BREAK, nameRef.current), false), 6500));
    }
    // Between exercises, a stretch.
    if (exerciseDone && restTotal >= 16) {
      timers.push(
        setTimeout(() => {
          request('stretching', { hold: STRETCH_HOLD_MS, auto: true });
          play(moveBigStretch(body));
        }, 9500),
      );
    }
    return () => timers.forEach(clearTimeout);
    // Runs once per rest screen; everything it needs is stable or in a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, restKind, setIndex]);

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
    if (exiting) {
      wasExiting.current = true;
      request(null, { force: true });
      say(pickPetLine(PET_EXIT, pet.name), true, true);
    } else if (wasExiting.current) {
      wasExiting.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exiting]);

  function onTap() {
    hapticSelection();
    const now = Date.now();
    if (exiting || now - lastTapAt.current < TAP_GAP_MS) return;
    lastTapAt.current = now;
    // A quick cheer (at most one face change in 6 s), a hop, and the next cue or a friendly line.
    if (now - lastFaceAt.current >= FACE_REACT_GAP_MS && faceNow() === null) {
      lastFaceAt.current = now;
      request('cheer', { hold: CHEER_HOLD_MS, auto: true });
    }
    play(moveHop(body, 0.6));
    const useCue = phase === 'exercise' && tapCue.current;
    tapCue.current = !tapCue.current;
    say(useCue ? takeCue(memory, cuesRef.current) : pickPetLine(PET_TAP, pet.name), true);
  }

  const readySoon = phase === 'rest' && restTotal > 8 && restSeconds <= 4;
  const baseMood: PetMood = exiting ? 'concerned' : phase === 'rest' && !readySoon ? 'rest' : 'coach';
  const shown: PetMood = face ?? baseMood;
  const corner = layout === 'corner';

  const petView = (
    <Animated.View style={{ width: size, height: size, transform: [{ translateX: enterX }] }}>
      <Animated.View style={bodyLook.mover}>
        <Animated.View style={bodyLook.squash}>
          <Pet
            stage={pet.stage}
            mood={shown}
            size={size}
            shadow={false}
            onPress={onTap}
            accessibilityLabel={pet.name ?? 'Your armadillo'}
          />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
  const bubbleView = (
    <View
      pointerEvents="none"
      style={[
        styles.bubbleSlot,
        corner ? styles.bubbleSlotCorner : styles.bubbleSlotRow,
        corner ? { paddingBottom: size * 0.3 } : null,
      ]}
    >
      {line ? (
        <Animated.View
          style={[styles.bubble, bubbleMotion]}
          accessible
          accessibilityRole="text"
          accessibilityLabel={line}
        >
          <View style={corner ? styles.tailRight : styles.tailLeft} />
          <Text style={styles.bubbleText} numberOfLines={3}>
            {line}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );

  return (
    <View
      pointerEvents="box-none"
      style={[styles.root, corner ? styles.corner : null, { height: size }]}
    >
      {corner ? bubbleView : null}
      {petView}
      {corner ? null : bubbleView}
    </View>
  );
}

const BORDER = 2;
const TAIL = 10;

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  // Bottom right of the parent, clear of its padding.
  corner: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 8,
    justifyContent: 'flex-end',
  },
  bubbleSlot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  bubbleSlotCorner: {
    alignItems: 'flex-end',
    paddingRight: 10,
  },
  bubbleSlotRow: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: 12,
    alignSelf: 'center',
  },
  bubble: {
    maxWidth: '100%',
    backgroundColor: colors.surface,
    borderWidth: BORDER,
    borderColor: colors.textPrimary,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  tailRight: {
    position: 'absolute',
    right: -TAIL / 2 + BORDER / 2,
    bottom: 14,
    width: TAIL,
    height: TAIL,
    backgroundColor: colors.surface,
    borderRightWidth: BORDER,
    borderTopWidth: BORDER,
    borderColor: colors.textPrimary,
    transform: [{ rotate: '45deg' }],
  },
  tailLeft: {
    position: 'absolute',
    left: -TAIL / 2 + BORDER / 2,
    top: '50%',
    marginTop: -TAIL / 2,
    width: TAIL,
    height: TAIL,
    backgroundColor: colors.surface,
    borderLeftWidth: BORDER,
    borderBottomWidth: BORDER,
    borderColor: colors.textPrimary,
    transform: [{ rotate: '45deg' }],
  },
});
