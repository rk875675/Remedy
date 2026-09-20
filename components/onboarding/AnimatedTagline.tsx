import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../constants/colors';
import { useAfterTransition } from '../../lib/useAfterTransition';

const WORD_STAGGER_MS = 55;
const WORD_DURATION_MS = 340;

const revealedKeys = new Set<string>();

function claimReveal(key: string): boolean {
  if (revealedKeys.has(key)) return false;
  revealedKeys.add(key);
  return true;
}

type Props = {
  text: string;
  revealKey: string;
};

function AnimatedWord({ word, index }: { word: string; index: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(7)).current;
  const ready = useAfterTransition();

  useEffect(() => {
    if (!ready) return;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: WORD_DURATION_MS,
        delay: index * WORD_STAGGER_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: WORD_DURATION_MS,
        delay: index * WORD_STAGGER_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [index, opacity, translateY, ready]);

  return (
    <Animated.Text style={[styles.word, { opacity, transform: [{ translateY }] }]}>
      {word}{' '}
    </Animated.Text>
  );
}

export function AnimatedTagline({ text, revealKey }: Props) {
  const words = useMemo(() => text.trim().split(/\s+/).filter(Boolean), [text]);
  const animate = useRef<boolean | null>(null);
  if (animate.current === null) {
    animate.current = claimReveal(`${revealKey}:${text}`);
  }

  if (!animate.current) {
    return <Text style={styles.tagline}>{text}</Text>;
  }

  return (
    <View style={styles.row} accessible accessibilityLabel={text}>
      {words.map((word, index) => (
        <AnimatedWord key={`${text}:${index}`} word={word} index={index} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tagline: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
    textAlign: 'center',
    maxWidth: 300,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    maxWidth: 300,
  },
  word: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
  },
});
