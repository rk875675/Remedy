import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  View,
} from 'react-native';

interface SplashOverlayProps {
  /** When true the overlay will animate out and then call onDone. */
  isReady: boolean;
  onDone: () => void;
}

const BG = '#33663f';
const EXIT_DURATION = 520;
const BREATHE_DURATION = 2800;
/** Minimum ms the splash is visible, even if the app loads instantly. */
const MIN_DISPLAY_MS = 1200;
const WORDMARK = 'Remedy';
const LETTER_STAGGER_MS = 48;
const LETTER_DURATION_MS = 200;

export default function SplashOverlay({ isReady, onDone }: SplashOverlayProps) {
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);

  // --- entry ---
  const logoScale = useRef(new Animated.Value(0.82)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const letterAnims = useRef(
    WORDMARK.split('').map(() => ({
      opacity: new Animated.Value(0),
      y: new Animated.Value(8),
    })),
  ).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineY = useRef(new Animated.Value(8)).current;

  // --- breathing loop ---
  const breathe = useRef(new Animated.Value(1)).current;
  const breatheLoop = useRef<Animated.CompositeAnimation | null>(null);

  // --- exit ---
  const overlayOpacity = useRef(new Animated.Value(1)).current;

  // Entry sequence
  useEffect(() => {
    const minTimer = setTimeout(() => setMinTimeElapsed(true), MIN_DISPLAY_MS);

    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        tension: 55,
        friction: 10,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // Letters appear one by one — quick, but readable
    Animated.sequence([
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
    ]).start();

    Animated.sequence([
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
    ]).start();

    const breatheTimeout = setTimeout(() => {
      breatheLoop.current = Animated.loop(
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
      breatheLoop.current.start();
    }, 900);

    return () => {
      clearTimeout(breatheTimeout);
      clearTimeout(minTimer);
      breatheLoop.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isReady || !minTimeElapsed) return;

    breatheLoop.current?.stop();
    breathe.stopAnimation();

    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: EXIT_DURATION,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onDone();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, minTimeElapsed]);

  const logoTransform = [
    { scale: Animated.multiply(logoScale, breathe) },
  ];

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.root, { opacity: overlayOpacity }]}
    >
      <Animated.View style={{ opacity: logoOpacity, transform: logoTransform }}>
        <Image
          source={require('../assets/splash-icon.png')}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="Remedy"
        />
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
  logo: {
    width: 176,
    height: 176,
    borderRadius: 38,
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
