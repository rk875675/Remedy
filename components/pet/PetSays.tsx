import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { colors } from '../../constants/colors';
import type { PetMood, PetStage } from '../../constants/petImages';
import { PET_POKE_LINES, PET_WAKE_LINE, fillPetLine } from '../../constants/petOnboardingLines';
import { hapticSelection } from '../../lib/haptics';
import { usePetName } from '../../lib/petNameCache';
import { useReduceMotion } from '../../lib/useReduceMotion';
import { Dust, easedTimeAt, type DustHandle } from './Dust';
import { PetBadge } from './PetBadge';
import { PET_UNFURL_MS } from './Pet';
import {
  call,
  createPetBody,
  moveBigStretch,
  moveHop,
  moveJumpSpin,
  moveLand,
  moveLookAround,
  moveNod,
  moveRock,
  moveShiver,
  moveWeightShift,
  moveWiggle,
  petBodyStyles,
  restBody,
} from './petMotion';

/**
 * How the pet arrives when the screen opens.
 *   pop  — the quiet default: it rises out of the ground.
 *   roll — rolls in from the screen edge, leaving a little dust. Use sparingly.
 *   drop — falls in from above and lands with a puff.
 *   peek — leans in from the right edge, pauses, then comes all the way in.
 *   none — already there (used when it is napping).
 */
export type PetEntrance = 'pop' | 'roll' | 'drop' | 'peek' | 'none';

type PetSaysProps = {
  /** What the pet is saying. `{name}` is replaced with the pet's name. */
  line: string;
  mood: PetMood;
  stage?: PetStage;
  /** Size of the pet badge beside the bubble. */
  size?: number;
  /**
   * The pet's name, shown as a small tag on the bubble. Leave undefined to use
   * the name the device remembers; pass null to hide the tag.
   */
  name?: string | null;
  entrance?: PetEntrance;
  /** Which side of the bubble the pet stands on. `peek` always uses the right. */
  side?: 'left' | 'right';
  /** Napping: floating Zs instead of a bubble. Tapping wakes it for a moment. */
  asleep?: boolean;
};

const BORDER = 2;
const TAIL = 12;
const TYPE_MS = 22;
const POKE_MS = 2600;
const ARRIVE_DELAY = 180;
const POP_MS = 240;
const ROLL_MS = 600;
const ROLL_BACK_MS = 150;
const ROLL_PAST = 1.04;
const DROP_MS = 300;
const DROP_FROM = -220;
// The unfurl from the ball (see Pet.tsx) takes about this long.
const POSE_WAIT_MS = PET_UNFURL_MS;
const TALK_MS = 260;
const outCubic = Easing.out(Easing.cubic);

/**
 * The pet with a speech bubble: how it talks on every screen it presents.
 *
 * It arrives (a quiet rise by default; a roll, a drop or a peek where a screen
 * asks), the bubble pops, and the line is typed while it bobs a little. After
 * that only one move plays at a time. With Reduce Motion on, none of that
 * plays and the line is shown whole.
 */
export function PetSays({
  line,
  mood,
  stage = 1,
  size = 64,
  name: nameProp,
  entrance = 'pop',
  side = 'left',
  asleep = false,
}: PetSaysProps) {
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const remembered = usePetName();
  const name = nameProp === undefined ? remembered : nameProp;
  const onRight = side === 'right' || entrance === 'peek';
  const dust = useRef<DustHandle>(null);

  // A tap replaces the line for a moment (and wakes a napping pet).
  const [poke, setPoke] = useState<string | null>(null);
  const pokeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pokeIndex = useRef(Math.floor(Math.random() * PET_POKE_LINES.length));
  const napping = asleep && poke === null;
  const spoken = fillPetLine(poke ?? line, { name });

  // Known Reduce Motion, or an entrance of none: show the pet and the line, still.
  const quiet = entrance === 'none' || reduceMotion === true;
  const [curled, setCurled] = useState(entrance === 'roll' && !quiet);
  const [entered, setEntered] = useState(quiet);
  const [typed, setTyped] = useState(quiet ? spoken.length : 0);
  const talking = entered && !napping && typed < spoken.length;

  const enteredRef = useRef(quiet);
  if (entered) enteredRef.current = true;
  const reduceRef = useRef(reduceMotion);
  reduceRef.current = reduceMotion;
  const talkingRef = useRef(talking);
  talkingRef.current = talking;
  const mounted = useRef(true);

  const body = useRef(createPetBody()).current;
  const enter = useRef(new Animated.Value(quiet ? 1 : 0)).current;
  const bubbleIn = useRef(new Animated.Value(quiet ? 1 : 0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  // Talk stays off the body so a line never fights a hop, nod, or spin.
  const talk = useRef(new Animated.Value(0)).current;

  const moveRef = useRef<Animated.CompositeAnimation | null>(null);
  const bubbleAnim = useRef<Animated.CompositeAnimation | null>(null);
  const popAnim = useRef<Animated.CompositeAnimation | null>(null);
  const talkAnim = useRef<Animated.CompositeAnimation | null>(null);
  const pokeCycle = useRef(0);
  const pokeOwnsLine = useRef(false);
  const lineNods = useRef(true);
  const prevMood = useRef(mood);
  const lastIdle = useRef(-1);

  const revealRef = useRef<() => void>(() => {});
  const beginMoveRef = useRef<(next: Animated.CompositeAnimation, keepEntrance?: boolean) => void>(
    () => {},
  );
  const dustAt = useRef<(points: { x: number; delay: number; size?: number }[]) => void>(() => {});

  dustAt.current = (points) => {
    if (!mounted.current) return;
    dust.current?.play(points);
  };

  revealRef.current = () => {
    if (!mounted.current) return;
    enteredRef.current = true;
    setEntered(true);
    const spring = Animated.spring(bubbleIn, {
      toValue: 1,
      speed: 16,
      bounciness: 12,
      useNativeDriver: true,
    });
    bubbleAnim.current?.stop();
    bubbleAnim.current = spring;
    spring.start(() => {
      if (bubbleAnim.current === spring) bubbleAnim.current = null;
    });
  };

  // One body move at a time: stop the last one and rest before the next.
  beginMoveRef.current = (next, keepEntrance = false) => {
    const running = moveRef.current;
    if (running) {
      moveRef.current = null;
      running.stop();
    }
    if (!keepEntrance && !enteredRef.current) {
      enter.setValue(1);
      if (mounted.current) setCurled(false);
      revealRef.current();
    }
    restBody(body);
    moveRef.current = next;
    next.start(() => {
      if (moveRef.current === next) moveRef.current = null;
    });
  };

  const bodyStyles = useMemo(
    () => petBodyStyles(body, { height: size, hop: size * 0.16 }),
    [body, size],
  );

  const talkMotion = useMemo(
    () => ({
      translateY: talk.interpolate({
        inputRange: [-1, 0, 1],
        outputRange: [-2, 0, -2],
      }),
      rotate: talk.interpolate({
        inputRange: [-1, 0, 1],
        outputRange: ['-3deg', '0deg', '3deg'],
      }),
    }),
    [talk],
  );

  // A roll comes from the edge the pet stands nearest. Position and rotation
  // both come from `enter`, so the turn always matches the distance.
  const rollFrom = onRight ? width : -width;
  const rollDegrees = (rollFrom / (size * 0.43)) * (180 / Math.PI);
  const entranceStyle = useMemo(() => {
    const pivot = size * 0.07; // the disc's centre sits a little below the box centre
    const opacity = enter.interpolate({
      inputRange: [0, 0.05, 1],
      outputRange: [0, 1, 1],
      extrapolate: 'clamp',
    });
    const shiftX =
      entrance === 'roll'
        ? enter.interpolate({
            inputRange: [0, ROLL_PAST],
            outputRange: [rollFrom, -rollFrom * (ROLL_PAST - 1)],
            extrapolate: 'clamp',
          })
        : entrance === 'peek'
          ? enter.interpolate({
              inputRange: [0, 1],
              outputRange: [size * 2.1, 0],
            })
          : 0;
    const shiftY =
      entrance === 'drop'
        ? enter.interpolate({
            inputRange: [0, 1],
            outputRange: [DROP_FROM, 0],
            extrapolate: 'clamp',
          })
        : entrance === 'pop'
          ? enter.interpolate({
              inputRange: [0, 1],
              outputRange: [size * 0.25, 0],
              extrapolate: 'clamp',
            })
          : 0;
    const popScale =
      entrance === 'pop'
        ? enter.interpolate({
            inputRange: [0, 1],
            outputRange: [0.3, 1],
            extrapolate: 'clamp',
          })
        : 1;
    const spin =
      entrance === 'roll'
        ? enter.interpolate({
            inputRange: [0, ROLL_PAST],
            outputRange: [`${rollDegrees}deg`, `${-rollDegrees * (ROLL_PAST - 1)}deg`],
            extrapolate: 'clamp',
          })
        : entrance === 'peek'
          ? enter.interpolate({
              inputRange: [0, 1],
              outputRange: ['24deg', '0deg'],
            })
          : '0deg';
    return {
      opacity,
      transform: [
        { translateX: shiftX },
        { translateY: shiftY },
        { scale: popScale },
        { translateY: pivot },
        { rotate: spin },
        { rotate: talkMotion.rotate },
        { translateY: -pivot },
        { translateY: talkMotion.translateY },
      ],
    };
  }, [enter, entrance, size, rollFrom, rollDegrees, talkMotion]);

  // Hidden until the pet has arrived. A drop grows the shadow in as it falls.
  const shadowIn = useMemo(() => {
    if (entrance === 'drop') {
      return {
        opacity: enter.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 1],
          extrapolate: 'clamp',
        }),
        transform: [
          {
            scale: enter.interpolate({
              inputRange: [0, 1],
              outputRange: [0.45, 1],
              extrapolate: 'clamp',
            }),
          },
        ],
      };
    }
    return {
      opacity: enter.interpolate({
        inputRange: [0, 0.88, 1],
        outputRange: [0, 0, 1],
        extrapolate: 'clamp',
      }),
    };
  }, [enter, entrance]);

  const bubbleStyle = useMemo(
    () => ({
      opacity: bubbleIn,
      transform: [
        {
          translateX: bubbleIn.interpolate({
            inputRange: [0, 1],
            outputRange: [onRight ? 18 : -18, 0],
          }),
        },
        { scale: bubbleIn.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
        { scale: pop },
      ],
    }),
    [bubbleIn, pop, onRight],
  );

  const arrivalStarted = useRef(quiet);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const running = moveRef.current;
      moveRef.current = null;
      running?.stop();
      bubbleAnim.current?.stop();
      popAnim.current?.stop();
      talkAnim.current?.stop();
      talk.setValue(0);
      if (pokeTimer.current) clearTimeout(pokeTimer.current);
    };
  }, [talk]);

  // Reduce Motion: no movement. The pet and the full line are just shown.
  useEffect(() => {
    if (reduceMotion !== true) return;
    const running = moveRef.current;
    if (running) {
      moveRef.current = null;
      running.stop();
    }
    bubbleAnim.current?.stop();
    bubbleAnim.current = null;
    popAnim.current?.stop();
    popAnim.current = null;
    talkAnim.current?.stop();
    talkAnim.current = null;
    restBody(body);
    talk.setValue(0);
    enter.setValue(1);
    bubbleIn.setValue(1);
    pop.setValue(1);
    enteredRef.current = true;
    if (!mounted.current) return;
    setCurled(false);
    setEntered(true);
    setTyped(spoken.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  // Arrival runs once, as soon as Reduce Motion is known.
  useEffect(() => {
    if (reduceMotion === null || arrivalStarted.current) return;
    arrivalStarted.current = true;
    if (reduceMotion || entrance === 'none') return;

    const toEnter = (toValue: number, duration: number, easing: (t: number) => number) =>
      Animated.timing(enter, { toValue, duration, easing, useNativeDriver: true });

    let sequence: Animated.CompositeAnimation;
    if (entrance === 'roll') {
      const travel: 1 | -1 = onRight ? -1 : 1;
      if (rollFrom !== 0) {
        const fromSide = onRight ? 1 : -1;
        const trail = [150, 112, 78, 48, 22].map((remaining, i) => {
          const at = 1 - remaining / Math.abs(rollFrom);
          return {
            x: size / 2 + fromSide * remaining,
            delay: ARRIVE_DELAY + ROLL_MS * easedTimeAt(outCubic, at / ROLL_PAST) + 40,
            size: 8 + (i % 2) * 3,
          };
        });
        trail.push({
          x: size / 2 - rollFrom * (ROLL_PAST - 1),
          delay: ARRIVE_DELAY + ROLL_MS,
          size: 9,
        });
        dustAt.current(trail);
      }
      const poseIsBall = stage === 1 && mood === 'ready' && !asleep;
      const steps: Animated.CompositeAnimation[] = [
        Animated.delay(ARRIVE_DELAY),
        toEnter(ROLL_PAST, ROLL_MS, outCubic),
        toEnter(1, ROLL_BACK_MS, Easing.out(Easing.quad)),
        moveRock(body, travel),
        call(() => {
          if (mounted.current) setCurled(false);
        }),
      ];
      if (!poseIsBall) steps.push(Animated.delay(POSE_WAIT_MS));
      steps.push(call(() => revealRef.current()));
      sequence = Animated.sequence(steps);
    } else if (entrance === 'drop') {
      sequence = Animated.sequence([
        Animated.delay(ARRIVE_DELAY),
        call(() => {
          body.squash.setValue(-0.6);
        }),
        toEnter(1, DROP_MS, Easing.in(Easing.quad)),
        call(() => {
          dustAt.current([
            { x: size * 0.12, delay: 0, size: 11 },
            { x: size * 0.88, delay: 0, size: 11 },
            { x: size * 0.5, delay: 60, size: 8 },
          ]);
        }),
        moveLand(body, 1),
        moveHop(body, 0.5),
        call(() => revealRef.current()),
      ]);
    } else if (entrance === 'peek') {
      sequence = Animated.sequence([
        Animated.delay(ARRIVE_DELAY),
        toEnter(0.42, 260, Easing.out(Easing.quad)),
        Animated.delay(320),
        toEnter(0.3, 110, Easing.out(Easing.quad)),
        Animated.delay(180),
        toEnter(1, 340, Easing.out(Easing.back(1.4))),
        moveNod(body),
        call(() => revealRef.current()),
      ]);
    } else {
      sequence = Animated.sequence([
        Animated.delay(ARRIVE_DELAY),
        call(() => {
          body.squash.setValue(-0.5);
        }),
        toEnter(1, POP_MS, Easing.out(Easing.cubic)),
        moveLand(body, 0.7),
        call(() => revealRef.current()),
      ]);
    }
    beginMoveRef.current(sequence, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  // Type the line out.
  useEffect(() => {
    if (!entered) return;
    if (reduceMotion !== false) {
      setTyped(spoken.length);
      return;
    }
    const step = spoken.length > 70 ? 2 : 1;
    let n = 0;
    setTyped(0);
    const id = setInterval(() => {
      n = Math.min(spoken.length, n + step);
      setTyped(n);
      if (n >= spoken.length) clearInterval(id);
    }, TYPE_MS);
    return () => clearInterval(id);
  }, [spoken, entered, reduceMotion]);

  // A new line: the bubble bounces, and the pet nods, then hops, then nods.
  const firstLine = useRef(true);
  useEffect(() => {
    if (firstLine.current) {
      firstLine.current = false;
      return;
    }
    if (!enteredRef.current || reduceRef.current !== false) {
      pokeOwnsLine.current = false;
      return;
    }
    const fromPoke = pokeOwnsLine.current;
    pokeOwnsLine.current = false;
    pop.setValue(0.88);
    const bounce = Animated.spring(pop, {
      toValue: 1,
      speed: 20,
      bounciness: 16,
      useNativeDriver: true,
    });
    popAnim.current?.stop();
    popAnim.current = bounce;
    bounce.start(() => {
      if (popAnim.current === bounce) popAnim.current = null;
    });
    if (!fromPoke) {
      const nod = lineNods.current;
      lineNods.current = !lineNods.current;
      beginMoveRef.current(nod ? moveNod(body) : moveHop(body, 0.7));
    }
    return () => {
      bounce.stop();
      if (popAnim.current === bounce) popAnim.current = null;
      pop.setValue(1);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spoken]);

  // While a line is typing: a small bob and tilt, then a spring back to rest.
  useEffect(() => {
    if (!talking || reduceMotion !== false) return;
    talkAnim.current?.stop();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(talk, {
          toValue: 1,
          duration: TALK_MS,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(talk, {
          toValue: -1,
          duration: TALK_MS,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
      { resetBeforeIteration: false },
    );
    talkAnim.current = loop;
    loop.start();
    return () => {
      loop.stop();
      if (talkAnim.current === loop) talkAnim.current = null;
      if (!mounted.current || reduceRef.current !== false) {
        talk.setValue(0);
        return;
      }
      const back = Animated.spring(talk, {
        toValue: 0,
        speed: 18,
        bounciness: 8,
        useNativeDriver: true,
      });
      talkAnim.current = back;
      back.start(() => {
        if (talkAnim.current === back) talkAnim.current = null;
      });
    };
  }, [talking, reduceMotion, talk]);

  // A change of mood.
  const firstMood = useRef(true);
  useEffect(() => {
    const from = prevMood.current;
    prevMood.current = mood;
    if (firstMood.current) {
      firstMood.current = false;
      return;
    }
    if (!enteredRef.current || reduceRef.current !== false) return;
    if (mood === 'celebrating' || mood === 'proud') {
      beginMoveRef.current(
        moveJumpSpin(body, () => {
          dustAt.current([
            { x: size * 0.32, delay: 0, size: 8 },
            { x: size * 0.68, delay: 40, size: 8 },
          ]);
        }),
      );
    } else if (mood === 'stiff' || mood === 'concerned') {
      beginMoveRef.current(moveShiver(body));
    } else if ((mood === 'ready' || mood === 'idle') && (from === 'stiff' || from === 'concerned')) {
      beginMoveRef.current(moveNod(body));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood]);

  // Left alone: one quiet move, never the same one twice in a row.
  useEffect(() => {
    if (!entered || napping || reduceMotion !== false) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let idleMove: Animated.CompositeAnimation | null = null;
    let stopped = false;
    const schedule = () => {
      timer = setTimeout(
        () => {
          if (stopped || !mounted.current) return;
          if (!talkingRef.current && moveRef.current === null) {
            let pick = Math.floor(Math.random() * 5);
            if (pick === lastIdle.current) pick = (pick + 1) % 5;
            lastIdle.current = pick;
            const direction: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
            const move =
              pick === 0
                ? moveLookAround(body)
                : pick === 1
                  ? moveBigStretch(body)
                  : pick === 2
                    ? moveWeightShift(body, direction)
                    : pick === 3
                      ? moveHop(body, 0.6)
                      : moveNod(body);
            idleMove = move;
            beginMoveRef.current(move);
          }
          if (!stopped) schedule();
        },
        7000 + Math.random() * 6000,
      );
    };
    schedule();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (idleMove && moveRef.current === idleMove) {
        moveRef.current = null;
        idleMove.stop();
        restBody(body);
      }
    };
  }, [entered, napping, reduceMotion, body]);

  function handlePoke() {
    hapticSelection();
    pokeOwnsLine.current = true;
    if (asleep) {
      setPoke(PET_WAKE_LINE);
    } else {
      pokeIndex.current = (pokeIndex.current + 1) % PET_POKE_LINES.length;
      setPoke(PET_POKE_LINES[pokeIndex.current] ?? PET_POKE_LINES[0]);
    }
    if (reduceMotion === false) {
      const step = pokeCycle.current % 3;
      pokeCycle.current += 1;
      const move =
        step === 0
          ? moveJumpSpin(body, () => {
              dustAt.current([
                { x: size * 0.32, delay: 0, size: 8 },
                { x: size * 0.68, delay: 40, size: 8 },
              ]);
            })
          : step === 1
            ? moveWiggle(body)
            : moveHop(body, 1);
      beginMoveRef.current(move);
    }
    if (pokeTimer.current) clearTimeout(pokeTimer.current);
    pokeTimer.current = setTimeout(() => {
      if (mounted.current) setPoke(null);
    }, POKE_MS);
  }

  const shownMood: PetMood = napping ? 'sleepy' : asleep ? 'ready' : mood;
  const badgeStage: PetStage = curled ? 1 : stage;
  const badgeMood: PetMood = curled ? 'ready' : shownMood;
  const tag = name && name.trim() ? name.trim() : null;
  const shadowW = size * 0.6;
  const shadowH = size * 0.08;

  return (
    <View style={[styles.row, onRight ? styles.rowReversed : null]}>
      <Pressable
        onPress={handlePoke}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={tag ?? 'Your armadillo'}
      >
        {/* Ground shadow under the disc. Absolute, so the row does not grow. */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: (size - shadowW) / 2,
              bottom: -shadowH * 0.65,
              width: shadowW,
              height: shadowH,
            },
            shadowIn,
          ]}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              {
                width: shadowW,
                height: shadowH,
                borderRadius: shadowH / 2,
                backgroundColor: 'rgba(0,0,0,0.10)',
              },
              bodyStyles.shadow,
            ]}
          />
        </Animated.View>
        <Dust ref={dust} />
        <Animated.View style={[{ width: size, height: size }, entranceStyle]}>
          <Animated.View style={bodyStyles.mover}>
            <Animated.View style={bodyStyles.squash}>
              <PetBadge stage={badgeStage} mood={badgeMood} size={size} />
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </Pressable>

      {napping ? (
        <SleepZs animate={reduceMotion === false} />
      ) : (
        <Animated.View
          style={[styles.bubbleWrap, bubbleStyle]}
          accessible
          accessibilityRole="text"
          accessibilityLabel={spoken}
        >
          <View style={onRight ? styles.tailRight : styles.tail} />
          <View style={styles.bubble}>
            {/* The untyped part is laid out but invisible, so the bubble never resizes mid-line. */}
            <Text style={styles.line}>
              {spoken.slice(0, typed)}
              <Text style={styles.untyped}>{spoken.slice(typed)}</Text>
            </Text>
          </View>
          {tag ? (
            <View style={styles.nameTag}>
              <Text style={styles.nameTagText} numberOfLines={1}>
                {tag}
              </Text>
            </View>
          ) : null}
        </Animated.View>
      )}
    </View>
  );
}

/** Three Zs drifting up from a napping pet. */
function SleepZs({ animate }: { animate: boolean }) {
  const values = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (!animate) return;
    const loops = values.map((value, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 520),
          Animated.timing(value, {
            toValue: 1,
            duration: 1700,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(value, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.delay((2 - i) * 520),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [animate, values]);

  return (
    <View style={styles.zs} pointerEvents="none" accessible accessibilityLabel="Asleep">
      {values.map((value, i) => (
        <Animated.Text
          key={i}
          style={[
            styles.z,
            { fontSize: 15 + i * 5 },
            animate
              ? {
                  opacity: value.interpolate({
                    inputRange: [0, 0.15, 0.75, 1],
                    outputRange: [0, 1, 1, 0],
                  }),
                  transform: [
                    { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [8, -18] }) },
                    { translateX: value.interpolate({ inputRange: [0, 1], outputRange: [0, 8] }) },
                  ],
                }
              : null,
          ]}
        >
          z
        </Animated.Text>
      ))}
    </View>
  );
}

/**
 * Renders its children only on phones tall enough to spare the room.
 * For forms with a keyboard: on a short phone the pet must never push a field
 * or the submit button under the keyboard.
 */
export function OnTallScreens({
  children,
  minHeight = 720,
}: {
  children: React.ReactNode;
  minHeight?: number;
}) {
  const { height } = useWindowDimensions();
  return height >= minHeight ? <>{children}</> : null;
}

/**
 * The bubble on its own, for places where the pet is already drawn large.
 * A new line bounces in and is typed out, like the bubble beside the small pet.
 */
export function PetBubble({ line }: { line: string }) {
  const reduceMotion = useReduceMotion();
  const pop = useRef(new Animated.Value(1)).current;
  const [typed, setTyped] = useState(line.length);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduceMotion !== false) {
      setTyped(line.length);
      return;
    }
    pop.setValue(0.88);
    const anim = Animated.spring(pop, {
      toValue: 1,
      speed: 20,
      bounciness: 16,
      useNativeDriver: true,
    });
    anim.start();
    let n = 0;
    setTyped(0);
    const id = setInterval(() => {
      n = Math.min(line.length, n + 1);
      setTyped(n);
      if (n >= line.length) clearInterval(id);
    }, TYPE_MS);
    return () => {
      anim.stop();
      pop.setValue(1);
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line]);

  return (
    <Animated.View
      style={[styles.bubble, { transform: [{ scale: pop }] }]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={line}
    >
      <Text style={styles.line}>
        {line.slice(0, typed)}
        <Text style={styles.untyped}>{line.slice(typed)}</Text>
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  rowReversed: {
    flexDirection: 'row-reverse',
  },
  bubbleWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  bubble: {
    minHeight: 66,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: BORDER,
    borderColor: colors.textPrimary,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  // A square turned 45 degrees, half hidden under the bubble's left edge.
  tail: {
    position: 'absolute',
    left: -TAIL / 2 + BORDER / 2,
    width: TAIL,
    height: TAIL,
    backgroundColor: colors.surface,
    borderLeftWidth: BORDER,
    borderBottomWidth: BORDER,
    borderColor: colors.textPrimary,
    transform: [{ rotate: '45deg' }],
    zIndex: 1,
  },
  // The same tail, pointing at a pet on the right.
  tailRight: {
    position: 'absolute',
    right: -TAIL / 2 + BORDER / 2,
    width: TAIL,
    height: TAIL,
    backgroundColor: colors.surface,
    borderRightWidth: BORDER,
    borderTopWidth: BORDER,
    borderColor: colors.textPrimary,
    transform: [{ rotate: '45deg' }],
    zIndex: 1,
  },
  line: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  untyped: {
    color: 'transparent',
  },
  // Sits on the bubble's top edge, like a name on a chat message.
  nameTag: {
    position: 'absolute',
    top: -9,
    left: 14,
    maxWidth: '70%',
    backgroundColor: colors.textPrimary,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    zIndex: 2,
  },
  nameTagText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#FFFFFF',
  },
  zs: {
    flex: 1,
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  z: {
    fontWeight: '800',
    color: colors.primary,
  },
});
