import React, { useEffect, useMemo } from 'react';
import { Animated, Easing, StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { useAfterTransition } from '../../../lib/useAfterTransition';
import { useReduceMotion } from '../../../lib/useReduceMotion';

type Piece = { word: string; color?: string; breakBefore: boolean };

const WORD_MS = 90;
const FADE_MS = 320;

/** Pull the words out of a heading, keeping a highlight colour and line breaks. */
function piecesOf(node: React.ReactNode, color?: string): Piece[] {
  if (node == null || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') {
    const out: Piece[] = [];
    String(node)
      .split('\n')
      .forEach((line, lineIndex) => {
        line
          .split(/\s+/)
          .filter((word) => word.length > 0)
          .forEach((word, wordIndex) => {
            out.push({ word, color, breakBefore: lineIndex > 0 && wordIndex === 0 });
          });
      });
    return out;
  }
  if (Array.isArray(node)) return node.flatMap((child) => piecesOf(child, color));
  if (React.isValidElement<{ children?: React.ReactNode; style?: StyleProp<TextStyle> }>(node)) {
    const next = StyleSheet.flatten(node.props.style)?.color;
    return piecesOf(node.props.children, typeof next === 'string' ? next : color);
  }
  return [];
}

type RevealTextProps = {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  /** Wait this long before the first word. */
  delay?: number;
  /** Hold the words back until this is true. Default true. */
  play?: boolean;
  testID?: string;
};

/**
 * A heading that arrives one word at a time. Each word fades into the space it
 * already holds, so the line never reflows. Reduce Motion shows it all at once.
 */
export function RevealText({ children, style, delay = 0, play = true, testID }: RevealTextProps) {
  const reduce = useReduceMotion();
  const ready = useAfterTransition();
  const pieces = useMemo(() => piecesOf(children), [children]);
  const spoken = pieces.map((piece) => `${piece.breakBefore ? '\n' : ''}${piece.word}`).join(' ');
  const anims = useMemo(
    () => pieces.map(() => new Animated.Value(reduce === true ? 1 : 0)),
    // A new heading (or a change in Reduce Motion) starts the words over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spoken, reduce],
  );

  useEffect(() => {
    if (!play || !ready || reduce === null) return;
    if (reduce) {
      anims.forEach((value) => value.setValue(1));
      return;
    }
    anims.forEach((value) => value.setValue(0));
    const motion = Animated.parallel(
      anims.map((value, index) =>
        Animated.timing(value, {
          toValue: 1,
          duration: FADE_MS,
          delay: delay + index * WORD_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
          isInteraction: false,
        }),
      ),
    );
    motion.start();
    return () => motion.stop();
  }, [play, ready, reduce, delay, anims]);

  return (
    <Text testID={testID} accessibilityRole="header" accessibilityLabel={spoken} style={style}>
      {pieces.map((piece, index) => {
        const value = anims[index];
        return (
          <Animated.Text
            key={`${piece.word}-${index}`}
            accessible={false}
            style={piece.color ? { color: piece.color, opacity: value ?? 1 } : { opacity: value ?? 1 }}
          >
            {piece.breakBefore ? '\n' : index > 0 ? ' ' : ''}
            {piece.word}
          </Animated.Text>
        );
      })}
    </Text>
  );
}
