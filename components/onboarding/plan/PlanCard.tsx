import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useAfterTransition } from '../../../lib/useAfterTransition';
import { useReduceMotion } from '../../../lib/useReduceMotion';
import { RevealText } from '../kit/RevealText';
import { ob } from '../kit/tokens';

type PlanCardProps = {
  title?: string;
  /** Stagger, in ms, after the screen transition. */
  delay?: number;
  /** Rise without the white card chrome. Used for the clinician note. */
  plain?: boolean;
  children: React.ReactNode;
};

/** White plan card that fades and rises in. Snaps into place when motion is reduced. */
export function PlanCard({ title, delay = 0, plain = false, children }: PlanCardProps) {
  const reduce = useReduceMotion();
  const ready = useAfterTransition();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce === null || !ready) return;
    if (reduce) {
      anim.setValue(1);
      return;
    }
    anim.setValue(0);
    const timing = Animated.timing(anim, {
      toValue: 1,
      duration: ob.motion.base,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    timing.start();
    return () => timing.stop();
  }, [anim, delay, ready, reduce]);

  const style = {
    opacity: anim,
    transform: [
      {
        translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }),
      },
    ],
  };

  return (
    <Animated.View style={style}>
      <View style={plain ? styles.plain : styles.card}>
        {title ? (
          <RevealText style={styles.title} delay={delay}>{title}</RevealText>
        ) : null}
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: ob.color.surface,
    borderRadius: ob.radius.card,
    paddingHorizontal: 20,
    paddingVertical: 22,
    gap: 16,
    overflow: 'visible',
  },
  plain: {
    gap: 0,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: ob.color.ink,
  },
});
