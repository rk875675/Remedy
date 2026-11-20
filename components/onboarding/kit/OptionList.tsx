import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useAfterTransition } from '../../../lib/useAfterTransition';
import { useReduceMotion } from '../../../lib/useReduceMotion';
import { ob } from './tokens';

export type OptionListProps = {
  children: React.ReactNode;
  /**
   * Wait before the first row, usually `useTypedDelay(line)`.
   * Capped at 900ms. Time already spent on the screen transition counts toward it.
   */
  delayMs?: number;
  /** Gap between rows. Default `ob.space.row`. */
  gap?: number;
};

const RISE = 12;
const DELAY_CAP = 900;

/**
 * Vertical stack that fades and rises once, after the question has typed.
 * Later renders do not replay the stagger.
 */
export function OptionList({ children, delayMs = 0, gap = ob.space.row }: OptionListProps) {
  const reduce = useReduceMotion();
  const ready = useAfterTransition();
  const items = React.Children.toArray(children);
  const anims = useRef<Animated.Value[]>([]);
  const played = useRef(false);
  const delayRef = useRef(delayMs);
  delayRef.current = delayMs;
  const mountedAt = useRef(Date.now());

  if (anims.current.length < items.length) {
    const visible = played.current || reduce === true;
    for (let i = anims.current.length; i < items.length; i += 1) {
      anims.current.push(new Animated.Value(visible ? 1 : 0));
    }
  }

  useEffect(() => {
    if (!ready || reduce === null) return;
    if (reduce) {
      anims.current.forEach((value) => value.setValue(1));
      played.current = true;
      return;
    }
    if (anims.current.length === 0) return;
    played.current = true;
    const budget = Math.min(DELAY_CAP, Math.max(0, delayRef.current));
    const remaining = Math.max(0, budget - (Date.now() - mountedAt.current));
    const motion = Animated.sequence([
      Animated.delay(remaining),
      Animated.stagger(
        ob.motion.stagger,
        anims.current.map((value) =>
          Animated.timing(value, {
            toValue: 1,
            duration: ob.motion.base,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
            isInteraction: false,
          }),
        ),
      ),
    ]);
    motion.start();
    return () => motion.stop();
  }, [ready, reduce, items.length]);

  return (
    <View style={{ gap }}>
      {items.map((child, index) => {
        const value = anims.current[index];
        if (!value) return <View key={index}>{child}</View>;
        return (
          <Animated.View
            key={index}
            style={[
              styles.item,
              {
                opacity: value,
                transform: [
                  {
                    translateY: value.interpolate({
                      inputRange: [0, 1],
                      outputRange: [RISE, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {child}
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    alignSelf: 'stretch',
  },
});
