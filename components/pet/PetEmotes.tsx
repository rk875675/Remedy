import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useReduceMotion } from '../../lib/useReduceMotion';

/**
 * The only two marks the pet wears: Zs drifting up while it sleeps, and three
 * dots when it is ignoring you. Feelings themselves are shown by the drawings.
 * Fill the pet's box with it (it is absolutely positioned and never takes
 * touches). With Reduce Motion on, the marks do not move.
 */
export type EmoteKind = 'dots';

export type PetEmotesHandle = {
  play: (kind: EmoteKind) => void;
  stop: () => void;
};

type PetEmotesProps = {
  /** Size of the pet's box. */
  size: number;
  /** Floating Zs for as long as this is true. */
  zzz?: boolean;
  /** Where the Zs rise from: over the head, or over the pillow end of the bed drawing. */
  zzzAt?: 'head' | 'bed';
  /** `light` on the green hill, `dark` on the tan page. */
  tone?: 'light' | 'dark';
};

const TONES = {
  light: { main: '#FFFFFF' },
  dark: { main: '#AE5636' },
} as const;

const DOTS_MS = 1500;
const STILL_MS = 1400;

/** Zs drifting up while the pet sleeps. */
function ZzzLayer({
  size,
  animate,
  color,
  at,
}: {
  size: number;
  animate: boolean;
  color: string;
  at: 'head' | 'bed';
}) {
  const values = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const u = Math.max(0.55, size / 220);
  const looks = useMemo(
    () =>
      values.map((value, i) => ({
        opacity: value.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [6 * u, -30 * u] }) },
          { translateX: value.interpolate({ inputRange: [0, 1], outputRange: [0, (8 + i * 3) * u] }) },
        ],
      })),
    [values, u],
  );

  useEffect(() => {
    if (!animate) return;
    const loops = values.map((value, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 560),
          Animated.timing(value, {
            toValue: 1,
            duration: 1800,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(value, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.delay((2 - i) * 560),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => {
      loops.forEach((loop) => loop.stop());
      values.forEach((value) => value.setValue(0));
    };
  }, [animate, values]);

  // The bed drawing lies with its head at the pillow end, low and to the left.
  const left = at === 'bed' ? size * 0.3 : size * 0.62;
  const top = at === 'bed' ? size * 0.2 : size * 0.16;
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left, top, flexDirection: 'row', alignItems: 'flex-end' }}
    >
      {values.map((value, i) => (
        <Animated.Text
          key={i}
          allowFontScaling={false}
          style={[
            { fontWeight: '800', color, fontSize: (13 + i * 5) * u, marginLeft: i === 0 ? 0 : 2 },
            animate ? looks[i] : { opacity: 0.9 - i * 0.2 },
          ]}
        >
          z
        </Animated.Text>
      ))}
    </View>
  );
}

export const PetEmotes = forwardRef<PetEmotesHandle, PetEmotesProps>(function PetEmotes(
  { size, zzz = false, zzzAt = 'head', tone = 'light' },
  ref,
) {
  const reduceMotion = useReduceMotion();
  const still = reduceMotion !== false;
  const stillRef = useRef(still);
  stillRef.current = still;
  const mounted = useRef(true);
  const burst = useRef(new Animated.Value(0)).current;
  const u = Math.max(0.55, size / 220);
  const dotLooks = useMemo(
    () =>
      [0, 1, 2].map((i) => {
        const s = 0.1 + i * 0.2;
        return {
          opacity: burst.interpolate({
            inputRange: [0, s, s + 0.06, 0.85, 1],
            outputRange: [0, 0, 1, 1, 0],
            extrapolate: 'clamp',
          }),
          transform: [
            {
              translateY: burst.interpolate({
                inputRange: [s, s + 0.1, s + 0.2],
                outputRange: [0, -4 * u, 0],
                extrapolate: 'clamp',
              }),
            },
          ],
        };
      }),
    [burst, u],
  );
  const [dots, setDots] = useState<number | null>(null);
  const counter = useRef(0);
  const stillTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const color = TONES[tone].main;

  function clearStillTimer() {
    if (stillTimer.current) clearTimeout(stillTimer.current);
    stillTimer.current = null;
  }

  useImperativeHandle(
    ref,
    () => ({
      play() {
        if (!mounted.current) return;
        counter.current += 1;
        setDots(counter.current);
      },
      stop() {
        clearStillTimer();
        if (mounted.current) setDots(null);
      },
    }),
    [],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearStillTimer();
    };
  }, []);

  // Run the dots once they are on screen.
  useEffect(() => {
    if (dots === null) return;
    clearStillTimer();
    if (stillRef.current) {
      stillTimer.current = setTimeout(() => {
        if (mounted.current) setDots(null);
      }, STILL_MS);
      return clearStillTimer;
    }
    burst.setValue(0);
    const anim = Animated.timing(burst, {
      toValue: 1,
      duration: DOTS_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    let live = true;
    anim.start(({ finished }) => {
      if (live && finished && mounted.current) setDots(null);
    });
    return () => {
      live = false;
      anim.stop();
    };
  }, [dots, burst]);

  const ax = size * 0.65;
  const ay = size * 0.16;
  const dim = 7 * u;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {zzz ? <ZzzLayer size={size} animate={!still} color={color} at={zzzAt} /> : null}
      {dots !== null
        ? dotLooks.map((look, i) => (
            <Animated.View
              key={`${dots}-${i}`}
              style={[
                {
                  position: 'absolute',
                  left: ax + (i - 1) * 14 * u - dim / 2,
                  top: ay,
                  width: dim,
                  height: dim,
                  borderRadius: dim / 2,
                  backgroundColor: color,
                },
                still ? null : look,
              ]}
            />
          ))
        : null}
    </View>
  );
});
