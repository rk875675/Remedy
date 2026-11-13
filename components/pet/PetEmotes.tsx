import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, Easing, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useReduceMotion } from '../../lib/useReduceMotion';

/**
 * Small marks that float around the pet's head: Zs, steam, an anger mark, a
 * tear, hearts. Monochrome glyphs and shapes, no emoji. Fill the pet's box with
 * it (it is absolutely positioned and never takes touches) and call
 * `ref.play(kind)`. `zzz` loops while asleep. With Reduce Motion on, a mark is
 * shown still for a moment instead of moving.
 */
export type EmoteKind =
  | 'zzz'
  | 'steam'
  | 'vein'
  | 'bang'
  | 'drop'
  | 'hearts'
  | 'sparkle'
  | 'question'
  | 'dots';

export type PetEmotesHandle = {
  play: (kind: EmoteKind) => void;
  stop: () => void;
};

type PetEmotesProps = {
  /** Size of the pet's box. */
  size: number;
  /** Floating Zs for as long as this is true. */
  zzz?: boolean;
  /** `light` on the green hill, `dark` on the tan page. */
  tone?: 'light' | 'dark';
};

type OneShot = Exclude<EmoteKind, 'zzz'>;
type Shape = 'text' | 'puff' | 'drop' | 'vein' | 'dot';
type Slot = 'main' | 'soft';

type Piece = {
  key: string;
  shape: Shape;
  glyph?: string;
  x: number;
  y: number;
  dim: number;
  slot: Slot;
  motion: Animated.WithAnimatedValue<ViewStyle>;
};

const TONES = {
  light: { main: '#FFFFFF', soft: '#F6EDE0', puff: 'rgba(246, 237, 224, 0.85)' },
  dark: { main: '#AE5636', soft: '#AE5636', puff: 'rgba(174, 86, 54, 0.45)' },
} as const;

const DURATION_MS: Record<OneShot, number> = {
  steam: 1100,
  vein: 900,
  bang: 800,
  drop: 1300,
  hearts: 1500,
  sparkle: 1000,
  question: 1300,
  dots: 1500,
};
const STILL_MS = 1400;
const ZZZ_ONCE_MS = 3600;

function buildPieces(burst: Animated.Value, size: number): Record<OneShot, Piece[]> {
  const u = Math.max(0.55, size / 220);
  const ax = size * 0.6;
  const ay = size * 0.26;
  const ramp = (inputRange: number[], outputRange: number[]) =>
    burst.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });
  const deg = (inputRange: number[], outputRange: string[]) =>
    burst.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });

  const steam: Piece[] = [0, 1, 2].map((i) => {
    const s = i * 0.1;
    const dim = (13 + (i % 2) * 5) * u;
    return {
      key: `steam-${i}`,
      shape: 'puff',
      x: ax + (i - 1) * 16 * u - dim / 2,
      y: ay,
      dim,
      slot: 'main',
      motion: {
        opacity: ramp([0, s, s + 0.12, 0.7, 1], [0, 0, 0.9, 0.5, 0]),
        transform: [
          { translateX: ramp([s, 1], [0, (i - 1) * size * 0.1]) },
          { translateY: ramp([s, 1], [0, -size * (0.2 + i * 0.04)]) },
          { scale: ramp([s, 1], [0.4, 1.6]) },
        ],
      },
    };
  });

  const vein: Piece[] = [
    {
      key: 'vein',
      shape: 'vein',
      x: ax + size * 0.08,
      y: ay - size * 0.12,
      dim: 22 * u,
      slot: 'main',
      motion: {
        opacity: ramp([0, 0.05, 0.8, 1], [0, 1, 1, 0]),
        transform: [
          { scale: ramp([0, 0.15, 0.3, 1], [0, 1.4, 1, 1]) },
          { rotate: deg([0, 0.3, 0.4, 0.5, 0.6, 0.7, 1], ['0deg', '-10deg', '10deg', '-8deg', '8deg', '0deg', '0deg']) },
        ],
      },
    },
  ];

  const bang: Piece[] = [
    {
      key: 'bang',
      shape: 'text',
      glyph: '!',
      x: ax + size * 0.04,
      y: ay - size * 0.2,
      dim: 38 * u,
      slot: 'main',
      motion: {
        opacity: ramp([0, 0.1, 0.75, 1], [0, 1, 1, 0]),
        transform: [
          { scale: ramp([0, 0.2, 0.3, 1], [0, 1.5, 1, 1]) },
          { translateY: ramp([0, 0.3, 1], [0, -4 * u, -10 * u]) },
        ],
      },
    },
  ];

  const drop: Piece[] = [
    {
      key: 'drop',
      shape: 'drop',
      x: ax + size * 0.1,
      y: ay + size * 0.04,
      dim: 10 * u,
      slot: 'main',
      motion: {
        opacity: ramp([0, 0.12, 0.75, 1], [0, 1, 1, 0]),
        transform: [
          { translateY: ramp([0, 1], [0, size * 0.17]) },
          { scale: ramp([0, 0.2, 1], [0.4, 1, 1]) },
        ],
      },
    },
  ];

  const hearts: Piece[] = [0, 1, 2].map((i) => {
    const s = i * 0.18;
    return {
      key: `heart-${i}`,
      shape: 'text',
      glyph: '\u2661',
      x: ax + [-0.08, 0.1, 0.01][i]! * size,
      y: ay,
      dim: (22 + i * 3) * u,
      slot: 'soft',
      motion: {
        opacity: ramp([0, s, s + 0.12, 0.7, 1], [0, 0, 1, 1, 0]),
        transform: [
          { translateY: ramp([s, 1], [0, -size * 0.3]) },
          { translateX: ramp([s, s + 0.4, 1], [0, (i % 2 ? 6 : -6) * u, 0]) },
          { scale: ramp([s, s + 0.2, 1], [0.4, 1, 1]) },
        ],
      },
    };
  });

  const sparkle: Piece[] = [0, 1].map((i) => {
    const s = i * 0.25;
    return {
      key: `sparkle-${i}`,
      shape: 'text',
      glyph: '\u2726',
      x: ax + (i === 0 ? -0.05 : 0.12) * size,
      y: ay - (i === 0 ? 0.08 : 0.02) * size,
      dim: (i === 0 ? 24 : 16) * u,
      slot: 'soft',
      motion: {
        opacity: ramp([0, s, s + 0.1, s + 0.5, 1], [0, 0, 1, 0, 0]),
        transform: [
          { scale: ramp([0, s, s + 0.2, s + 0.5, 1], [0, 0, 1.2, 0, 0]) },
          { rotate: deg([0, s, s + 0.5, 1], ['0deg', '0deg', '90deg', '90deg']) },
        ],
      },
    };
  });

  const question: Piece[] = [
    {
      key: 'question',
      shape: 'text',
      glyph: '?',
      x: ax + size * 0.04,
      y: ay - size * 0.2,
      dim: 38 * u,
      slot: 'main',
      motion: {
        opacity: ramp([0, 0.1, 0.8, 1], [0, 1, 1, 0]),
        transform: [
          { scale: ramp([0, 0.2, 1], [0, 1.2, 1]) },
          { rotate: deg([0, 0.3, 0.5, 0.7, 1], ['0deg', '-12deg', '10deg', '-6deg', '0deg']) },
          { translateY: ramp([0, 1], [0, -8 * u]) },
        ],
      },
    },
  ];

  const dots: Piece[] = [0, 1, 2].map((i) => {
    const s = 0.1 + i * 0.2;
    const dim = 7 * u;
    return {
      key: `dot-${i}`,
      shape: 'dot',
      x: ax + (i - 1) * 14 * u - dim / 2 + size * 0.05,
      y: ay - size * 0.1,
      dim,
      slot: 'main',
      motion: {
        opacity: ramp([0, s, s + 0.06, 0.85, 1], [0, 0, 1, 1, 0]),
        transform: [{ translateY: ramp([s, s + 0.1, s + 0.2], [0, -4 * u, 0]) }],
      },
    };
  });

  return { steam, vein, bang, drop, hearts, sparkle, question, dots };
}

/** The mark itself, drawn from Views and a glyph. */
function Mark({ piece, color, puff }: { piece: Piece; color: string; puff: string }) {
  const { dim } = piece;
  if (piece.shape === 'puff') {
    return <View style={{ width: dim, height: dim, borderRadius: dim / 2, backgroundColor: puff }} />;
  }
  if (piece.shape === 'dot') {
    return <View style={{ width: dim, height: dim, borderRadius: dim / 2, backgroundColor: color }} />;
  }
  if (piece.shape === 'drop') {
    return (
      <View
        style={{
          width: dim,
          height: dim,
          borderRadius: dim / 2,
          borderTopRightRadius: 0,
          backgroundColor: color,
          transform: [{ rotate: '-45deg' }],
        }}
      />
    );
  }
  if (piece.shape === 'vein') {
    // Four short arcs round an empty middle: the anger mark.
    const a = dim * 0.42;
    const t = Math.max(2, dim * 0.13);
    const arc = { position: 'absolute' as const, width: a, height: a, borderColor: color };
    return (
      <View style={{ width: dim, height: dim }}>
        <View style={[arc, { top: 0, left: 0, borderRightWidth: t, borderBottomWidth: t, borderBottomRightRadius: a }]} />
        <View style={[arc, { top: 0, right: 0, borderLeftWidth: t, borderBottomWidth: t, borderBottomLeftRadius: a }]} />
        <View style={[arc, { bottom: 0, left: 0, borderRightWidth: t, borderTopWidth: t, borderTopRightRadius: a }]} />
        <View style={[arc, { bottom: 0, right: 0, borderLeftWidth: t, borderTopWidth: t, borderTopLeftRadius: a }]} />
      </View>
    );
  }
  return (
    <Text style={{ fontSize: dim, lineHeight: dim * 1.15, fontWeight: '900', color }} allowFontScaling={false}>
      {piece.glyph}
    </Text>
  );
}

/** Zs drifting up while the pet sleeps. */
function ZzzLayer({
  size,
  animate,
  color,
}: {
  size: number;
  animate: boolean;
  color: string;
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

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: size * 0.62, top: size * 0.16, flexDirection: 'row', alignItems: 'flex-end' }}
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
  { size, zzz = false, tone = 'light' },
  ref,
) {
  const reduceMotion = useReduceMotion();
  const still = reduceMotion !== false;
  const stillRef = useRef(still);
  stillRef.current = still;
  const mounted = useRef(true);
  const burst = useRef(new Animated.Value(0)).current;
  const pieces = useMemo(() => buildPieces(burst, size), [burst, size]);
  const [shown, setShown] = useState<{ kind: OneShot; id: number } | null>(null);
  const [zzzOnce, setZzzOnce] = useState(false);
  const counter = useRef(0);
  const stillTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zzzTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const colors = TONES[tone];

  function clearStillTimer() {
    if (stillTimer.current) clearTimeout(stillTimer.current);
    stillTimer.current = null;
  }

  useImperativeHandle(
    ref,
    () => ({
      play(kind) {
        if (!mounted.current) return;
        if (kind === 'zzz') {
          setZzzOnce(true);
          if (zzzTimer.current) clearTimeout(zzzTimer.current);
          zzzTimer.current = setTimeout(() => {
            if (mounted.current) setZzzOnce(false);
          }, ZZZ_ONCE_MS);
          return;
        }
        counter.current += 1;
        setShown({ kind, id: counter.current });
      },
      stop() {
        clearStillTimer();
        if (zzzTimer.current) clearTimeout(zzzTimer.current);
        zzzTimer.current = null;
        if (!mounted.current) return;
        setShown(null);
        setZzzOnce(false);
      },
    }),
    [],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearStillTimer();
      if (zzzTimer.current) clearTimeout(zzzTimer.current);
    };
  }, []);

  // Run the mark once it is on screen.
  useEffect(() => {
    if (!shown) return;
    clearStillTimer();
    if (stillRef.current) {
      stillTimer.current = setTimeout(() => {
        if (mounted.current) setShown(null);
      }, STILL_MS);
      return clearStillTimer;
    }
    burst.setValue(0);
    const anim = Animated.timing(burst, {
      toValue: 1,
      duration: DURATION_MS[shown.kind],
      easing: Easing.linear,
      useNativeDriver: true,
    });
    let live = true;
    anim.start(({ finished }) => {
      if (live && finished && mounted.current) setShown(null);
    });
    return () => {
      live = false;
      anim.stop();
    };
  }, [shown, burst]);

  const list = shown ? pieces[shown.kind] : [];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {zzz || zzzOnce ? <ZzzLayer size={size} animate={!still} color={colors.main} /> : null}
      {list.map((piece) => (
        <Animated.View
          key={`${shown?.id ?? 0}-${piece.key}`}
          style={[{ position: 'absolute', left: piece.x, top: piece.y }, still ? null : piece.motion]}
        >
          <Mark piece={piece} color={colors[piece.slot]} puff={colors.puff} />
        </Animated.View>
      ))}
    </View>
  );
});
