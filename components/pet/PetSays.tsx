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
import { PetBadge } from './PetBadge';

/** How the pet arrives when the screen opens. */
export type PetEntrance = 'roll' | 'drop' | 'spin' | 'none';

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
  /** Napping: floating Zs instead of a bubble. Tapping wakes it for a moment. */
  asleep?: boolean;
};

const BORDER = 2;
const TAIL = 12;
const TYPE_MS = 22;
const POKE_MS = 2600;

/**
 * The pet with a speech bubble: how it talks on every screen it presents.
 *
 * It is meant to feel alive, not pinned: it rolls (or drops, or spins) in when
 * the screen opens, the bubble pops out of it, each line is typed out while the
 * pet wobbles as if speaking, a new line makes it hop, a change of mood makes
 * it flip or shudder, it fidgets when left alone, and tapping it gets a reply.
 * With Reduce Motion on, all of that is skipped and the line simply appears.
 */
export function PetSays({
  line,
  mood,
  stage = 1,
  size = 64,
  name: nameProp,
  entrance = 'roll',
  asleep = false,
}: PetSaysProps) {
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const remembered = usePetName();
  const name = nameProp === undefined ? remembered : nameProp;

  // A tap replaces the line for a moment (and wakes a napping pet).
  const [poke, setPoke] = useState<string | null>(null);
  const pokeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pokeIndex = useRef(Math.floor(Math.random() * PET_POKE_LINES.length));
  const napping = asleep && poke === null;
  const spoken = fillPetLine(poke ?? line, { name });

  const [entered, setEntered] = useState(entrance === 'none');
  const [typed, setTyped] = useState(entrance === 'none' ? spoken.length : 0);
  const talking = entered && !napping && typed < spoken.length;
  const talkingRef = useRef(talking);
  talkingRef.current = talking;

  const enter = useRef(new Animated.Value(entrance === 'none' ? 1 : 0)).current;
  const bubbleIn = useRef(new Animated.Value(entrance === 'none' ? 1 : 0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const hop = useRef(new Animated.Value(0)).current;
  const tilt = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;

  // A rolling disc turns distance / radius radians.
  const rollDegrees = Math.round((width / (size * 0.43)) * (180 / Math.PI));
  const motionStyle = useMemo(() => {
    const pivot = size * 0.07; // the disc's centre sits a little below the box centre
    return {
      opacity: enter.interpolate({ inputRange: [0, 0.02, 1], outputRange: [0, 1, 1] }),
      transform: [
        {
          translateX:
            entrance === 'roll'
              ? enter.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] })
              : 0,
        },
        { translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-5, 5] }) },
        {
          translateY:
            entrance === 'drop'
              ? enter.interpolate({ inputRange: [0, 1], outputRange: [-180, 0] })
              : 0,
        },
        { translateY: hop.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.14] }) },
        {
          scale:
            entrance === 'spin'
              ? enter.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] })
              : 1,
        },
        { translateY: pivot },
        {
          rotate:
            entrance === 'roll'
              ? enter.interpolate({ inputRange: [0, 1], outputRange: [`-${rollDegrees}deg`, '0deg'] })
              : entrance === 'spin'
                ? enter.interpolate({ inputRange: [0, 1], outputRange: ['-360deg', '0deg'] })
                : '0deg',
        },
        { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
        { rotate: tilt.interpolate({ inputRange: [-1, 1], outputRange: ['-7deg', '7deg'] }) },
        { translateY: -pivot },
      ],
    };
  }, [enter, shake, hop, spin, tilt, entrance, width, size, rollDegrees]);

  const bubbleStyle = useMemo(
    () => ({
      opacity: bubbleIn,
      transform: [
        { translateX: bubbleIn.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }) },
        { scale: bubbleIn.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
        { scale: pop },
      ],
    }),
    [bubbleIn, pop],
  );

  // Arrival: runs once, as soon as the Reduce Motion setting is known. It is not
  // tied to `entered`, which flips while the bubble is still springing out.
  const arrivalStarted = useRef(entrance === 'none');
  const arrival = useRef<{ anim: Animated.CompositeAnimation; speak: ReturnType<typeof setTimeout> } | null>(
    null,
  );
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (arrival.current) {
        clearTimeout(arrival.current.speak);
        arrival.current.anim.stop();
      }
    };
  }, []);

  useEffect(() => {
    if (reduceMotion === null || arrivalStarted.current) return;
    arrivalStarted.current = true;
    if (reduceMotion) {
      enter.setValue(1);
      bubbleIn.setValue(1);
      setEntered(true);
      return;
    }
    const arrive =
      entrance === 'drop'
        ? Animated.timing(enter, {
            toValue: 1,
            duration: 720,
            easing: Easing.bounce,
            useNativeDriver: true,
          })
        : entrance === 'spin'
          ? Animated.timing(enter, {
              toValue: 1,
              duration: 520,
              easing: Easing.out(Easing.back(1.8)),
              useNativeDriver: true,
            })
          : Animated.timing(enter, {
              toValue: 1,
              duration: 680,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            });
    const anim = Animated.sequence([
      Animated.delay(180),
      arrive,
      Animated.spring(bubbleIn, { toValue: 1, speed: 16, bounciness: 12, useNativeDriver: true }),
    ]);
    anim.start();
    // The bubble starts to speak as it pops, not after it has settled.
    const speak = setTimeout(
      () => {
        if (mounted.current) setEntered(true);
      },
      180 + (entrance === 'drop' ? 720 : entrance === 'spin' ? 520 : 680) + 120,
    );
    arrival.current = { anim, speak };
  }, [reduceMotion, entrance, enter, bubbleIn]);

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

  // A new line: the bubble bounces and the pet hops.
  const firstLine = useRef(true);
  useEffect(() => {
    if (firstLine.current) {
      firstLine.current = false;
      return;
    }
    if (!entered || reduceMotion !== false) return;
    pop.setValue(0.88);
    const anim = Animated.parallel([
      Animated.spring(pop, { toValue: 1, speed: 20, bounciness: 16, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(hop, {
          toValue: 1,
          duration: 110,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(hop, {
          toValue: 0,
          duration: 150,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]);
    anim.start();
    return () => {
      anim.stop();
      pop.setValue(1);
      hop.setValue(0);
    };
    // Only a change of line should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spoken]);

  // While it is speaking, it wobbles.
  useEffect(() => {
    if (!talking || reduceMotion !== false) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(tilt, { toValue: 0.6, duration: 110, useNativeDriver: true }),
        Animated.timing(tilt, { toValue: -0.6, duration: 110, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      if (mounted.current) {
        Animated.spring(tilt, { toValue: 0, speed: 18, bounciness: 10, useNativeDriver: true }).start();
      } else {
        tilt.setValue(0);
      }
    };
  }, [talking, reduceMotion, tilt]);

  // A change of mood: a happy flip, or a shudder.
  const firstMood = useRef(true);
  useEffect(() => {
    if (firstMood.current) {
      firstMood.current = false;
      return;
    }
    if (!entered || reduceMotion !== false) return;
    let anim: Animated.CompositeAnimation | null = null;
    if (mood === 'celebrating' || mood === 'proud') {
      spin.setValue(0);
      anim = Animated.timing(spin, {
        toValue: 1,
        duration: 460,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      });
    } else if (mood === 'stiff' || mood === 'concerned') {
      anim = Animated.sequence([
        Animated.timing(shake, { toValue: 1, duration: 50, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -1, duration: 70, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0.6, duration: 60, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true }),
      ]);
    }
    if (!anim) return;
    anim.start(({ finished }) => {
      if (finished) spin.setValue(0);
    });
    return () => {
      anim?.stop();
      spin.setValue(0);
      shake.setValue(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood]);

  // Left alone, it fidgets.
  useEffect(() => {
    if (!entered || napping || reduceMotion !== false) return;
    let timer: ReturnType<typeof setTimeout>;
    let running: Animated.CompositeAnimation | null = null;
    const schedule = () => {
      timer = setTimeout(() => {
        if (!talkingRef.current) {
          const pick = Math.random();
          if (pick < 0.4) {
            running = Animated.sequence([
              Animated.timing(hop, { toValue: 0.7, duration: 120, useNativeDriver: true }),
              Animated.timing(hop, { toValue: 0, duration: 160, useNativeDriver: true }),
            ]);
          } else if (pick < 0.8) {
            running = Animated.sequence([
              Animated.timing(tilt, { toValue: 1, duration: 160, useNativeDriver: true }),
              Animated.timing(tilt, { toValue: -1, duration: 220, useNativeDriver: true }),
              Animated.spring(tilt, { toValue: 0, speed: 14, bounciness: 12, useNativeDriver: true }),
            ]);
          } else {
            spin.setValue(0);
            running = Animated.timing(spin, {
              toValue: 1,
              duration: 520,
              easing: Easing.inOut(Easing.cubic),
              useNativeDriver: true,
            });
          }
          running.start(({ finished }) => {
            if (finished) spin.setValue(0);
          });
        }
        schedule();
      }, 4200 + Math.random() * 4600);
    };
    schedule();
    return () => {
      clearTimeout(timer);
      running?.stop();
    };
  }, [entered, napping, reduceMotion, hop, tilt, spin]);

  useEffect(
    () => () => {
      if (pokeTimer.current) clearTimeout(pokeTimer.current);
    },
    [],
  );

  function handlePoke() {
    hapticSelection();
    if (asleep) {
      setPoke(PET_WAKE_LINE);
    } else {
      pokeIndex.current = (pokeIndex.current + 1) % PET_POKE_LINES.length;
      setPoke(PET_POKE_LINES[pokeIndex.current] ?? PET_POKE_LINES[0]);
    }
    if (reduceMotion === false) {
      spin.setValue(0);
      Animated.timing(spin, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) spin.setValue(0);
      });
    }
    if (pokeTimer.current) clearTimeout(pokeTimer.current);
    pokeTimer.current = setTimeout(() => setPoke(null), POKE_MS);
  }

  const shownMood: PetMood = napping ? 'sleepy' : asleep ? 'ready' : mood;
  const tag = name && name.trim() ? name.trim() : null;

  return (
    <View style={styles.row}>
      <Pressable
        onPress={handlePoke}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={tag ?? 'Your armadillo'}
      >
        <Animated.View style={motionStyle}>
          <PetBadge stage={stage} mood={shownMood} size={size} />
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
          <View style={styles.tail} />
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
