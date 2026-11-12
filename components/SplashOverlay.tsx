import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  StyleSheet,
  View,
} from 'react-native';
import { petImage } from '../constants/petImages';
import { brand } from '../lib/brand';
import { useReduceMotion } from '../lib/useReduceMotion';
import { Dust, DUST_PALE, easedTimeAt, type DustHandle } from './pet/Dust';
import {
  call,
  createPetBody,
  moveHop,
  moveRock,
  petBodyStyles,
  restBody,
} from './pet/petMotion';

const LOGO_SIZE = 176;

interface SplashOverlayProps {
  /** When true the overlay will animate out and then call onDone. */
  isReady: boolean;
  onDone: () => void;
}

/** Same colour as the native launch screen, so the handoff is invisible. */
const BG = brand.backgroundColor;
const EXIT_DURATION = 520;
const BREATHE_DURATION = 2800;
/** Minimum ms the splash is visible, even if the app loads instantly. */
const MIN_DISPLAY_MS = 1200;
const WORDMARK = 'Remedy';
const LETTER_STAGGER_MS = 48;
const LETTER_DURATION_MS = 200;
const PAST = 14;
const ROLL_MS = 520;
const BACK_MS = 120;
/** moveHop is on the ground after the crouch, the rise and the fall. */
const HOP_LAND_MS = 410;

export default function SplashOverlay({ isReady, onDone }: SplashOverlayProps) {
  const reduceMotion = useReduceMotion();
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const mounted = useRef(true);
  const dust = useRef<DustHandle>(null);

  const travel = useRef(Math.max(1, Dimensions.get('window').width * 0.7)).current;
  const roll = useRef(new Animated.Value(-travel)).current;
  const rollDegrees = (travel / (LOGO_SIZE * 0.445)) * (180 / Math.PI);
  const rollSpin = useRef(
    roll.interpolate({
      inputRange: [-travel, travel],
      outputRange: [`-${rollDegrees}deg`, `${rollDegrees}deg`],
    }),
  ).current;

  const body = useRef(createPetBody()).current;
  const bodyLook = useMemo(
    () => petBodyStyles(body, { height: LOGO_SIZE, hop: LOGO_SIZE * 0.16 }),
    [body],
  );
  const breathe = useRef(new Animated.Value(1)).current;
  const breatheLoop = useRef<Animated.CompositeAnimation | null>(null);
  const arrival = useRef<Animated.CompositeAnimation | null>(null);
  const exiting = useRef(false);
  const innerStyle = useMemo(
    () => ({ transform: [...bodyLook.squash.transform, { scale: breathe }] }),
    [bodyLook, breathe],
  );

  // --- entry ---
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const letterAnims = useRef(
    WORDMARK.split('').map(() => ({
      opacity: new Animated.Value(0),
      y: new Animated.Value(8),
    })),
  ).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineY = useRef(new Animated.Value(8)).current;

  // --- exit ---
  const overlayOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    mounted.current = true;
    const minTimer = setTimeout(() => {
      if (mounted.current) setMinTimeElapsed(true);
    }, MIN_DISPLAY_MS);
    return () => {
      mounted.current = false;
      clearTimeout(minTimer);
      const running = arrival.current;
      arrival.current = null;
      running?.stop();
      breatheLoop.current?.stop();
      breatheLoop.current = null;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion === null) return;
    const extras: Animated.CompositeAnimation[] = [];

    if (reduceMotion) {
      roll.setValue(0);
      logoOpacity.setValue(1);
      breathe.setValue(1);
      restBody(body);
      letterAnims.forEach((letter) => {
        letter.opacity.setValue(1);
        letter.y.setValue(0);
      });
      taglineOpacity.setValue(1);
      taglineY.setValue(0);
      return;
    }

    const from = -travel;
    const ease = Easing.out(Easing.cubic);
    const spots = [0.18, 0.4, 0.62, 0.84].map((f) => from + (PAST - from) * f);
    dust.current?.play(
      spots.map((spot) => ({
        x: spot,
        delay: Math.round(ROLL_MS * easedTimeAt(ease, (spot - from) / (PAST - from))),
        size: 11,
      })),
    );

    restBody(body);
    const rollIn = Animated.sequence([
      Animated.timing(roll, {
        toValue: PAST,
        duration: ROLL_MS,
        easing: ease,
        useNativeDriver: true,
      }),
      Animated.timing(roll, {
        toValue: 0,
        duration: BACK_MS,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      moveRock(body, 1),
      Animated.parallel([
        moveHop(body, 0.7),
        Animated.sequence([
          Animated.delay(HOP_LAND_MS),
          call(() => {
            dust.current?.play([{ x: 0, delay: 0, size: 12 }]);
          }),
        ]),
      ]),
    ]);
    arrival.current = rollIn;
    rollIn.start(({ finished }) => {
      if (!finished || !mounted.current || arrival.current !== rollIn) return;
      arrival.current = null;
      if (exiting.current) return;
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(breathe, {
            toValue: 1.024,
            duration: BREATHE_DURATION * 0.45,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(breathe, {
            toValue: 1,
            duration: BREATHE_DURATION * 0.55,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      );
      breatheLoop.current = loop;
      loop.start();
    });

    const fade = Animated.timing(logoOpacity, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    fade.start();
    extras.push(fade);

    // Letters appear one by one — quick, but readable
    const letters = Animated.sequence([
      Animated.delay(320),
      Animated.stagger(
        LETTER_STAGGER_MS,
        letterAnims.map((letter) =>
          Animated.parallel([
            Animated.timing(letter.opacity, {
              toValue: 1,
              duration: LETTER_DURATION_MS,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(letter.y, {
              toValue: 0,
              duration: LETTER_DURATION_MS,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ]),
        ),
      ),
    ]);
    letters.start();
    extras.push(letters);

    const tagline = Animated.sequence([
      Animated.delay(320 + LETTER_STAGGER_MS * 3),
      Animated.parallel([
        Animated.timing(taglineOpacity, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(taglineY, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]);
    tagline.start();
    extras.push(tagline);

    return () => {
      if (arrival.current === rollIn) arrival.current = null;
      rollIn.stop();
      breatheLoop.current?.stop();
      breatheLoop.current = null;
      extras.forEach((anim) => anim.stop());
    };
    // The animated values are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  useEffect(() => {
    if (!isReady || !minTimeElapsed) return;

    // Let the arrival finish under the fade rather than freezing it mid-air.
    exiting.current = true;
    breatheLoop.current?.stop();
    breatheLoop.current = null;
    breathe.stopAnimation();

    const fade = Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: EXIT_DURATION,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    });
    fade.start(({ finished }) => {
      if (finished && mounted.current) onDone();
    });
    return () => fade.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, minTimeElapsed]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.root, { opacity: overlayOpacity }]}
    >
      {/* The armadillo, curled up, rolls in from the left and settles. */}
      <Animated.View style={[styles.logoWrap, { opacity: logoOpacity }]}>
        <View pointerEvents="none" style={styles.dustOrigin}>
          <Dust ref={dust} color={DUST_PALE} />
        </View>
        <Animated.View style={{ transform: [{ translateX: roll }, { rotate: rollSpin }] }}>
          <Animated.View style={bodyLook.mover}>
            <Animated.View style={innerStyle}>
              <Image
                source={petImage(1, 'ready')}
                style={styles.logo}
                resizeMode="contain"
                accessibilityLabel="Remedy"
              />
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </Animated.View>

      <View style={styles.wordmarkRow} accessibilityLabel="Remedy">
        <View style={styles.wordmarkLetters}>
          {WORDMARK.split('').map((char, i) => (
            <Animated.Text
              key={`${char}-${i}`}
              style={[
                styles.wordmark,
                {
                  opacity: letterAnims[i].opacity,
                  transform: [{ translateY: letterAnims[i].y }],
                },
              ]}
            >
              {char}
            </Animated.Text>
          ))}
        </View>
        <Animated.Text
          style={[
            styles.tagline,
            {
              opacity: taglineOpacity,
              transform: [{ translateY: taglineY }],
            },
          ]}
        >
          back pain relief
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrap: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dustOrigin: {
    position: 'absolute',
    left: LOGO_SIZE / 2,
    bottom: 8,
    width: 1,
    height: 20,
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
  wordmarkRow: {
    alignItems: 'center',
    marginTop: 48,
    gap: 12,
  },
  wordmarkLetters: {
    flexDirection: 'row',
  },
  wordmark: {
    fontFamily: 'Georgia',
    fontSize: 48,
    fontWeight: '400',
    color: '#FFFFFF',
    letterSpacing: 6,
  },
  tagline: {
    fontSize: 14,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
});
