import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { hapticSelection } from '../../../lib/haptics';
import { useReduceMotion } from '../../../lib/useReduceMotion';
import { Icon } from './Icon';
import { ob, obType } from './tokens';

export type ChoiceCardProps = {
  title: string;
  sub?: string;
  art: React.ReactNode;
  selected: boolean;
  onPress: () => void;
  testID?: string;
};

const STROKE = 1.5;
const ON_ACCENT = '#FFFFFF';

function usePressScale(): {
  scale: Animated.Value;
  onPressIn: () => void;
  onPressOut: () => void;
} {
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;

  function springTo(toValue: number) {
    if (reduce === true) {
      scale.setValue(1);
      return;
    }
    Animated.spring(scale, {
      toValue,
      tension: ob.motion.spring.tension,
      friction: ob.motion.spring.friction,
      useNativeDriver: true,
      isInteraction: false,
    }).start();
  }

  return {
    scale,
    onPressIn: () => {
      if (reduce === true) return;
      springTo(ob.motion.pressScale);
    },
    onPressOut: () => springTo(1),
  };
}

function SelectionWash({ selected }: { selected: boolean }) {
  const reduce = useReduceMotion();
  const opacity = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    const next = selected ? 1 : 0;
    if (reduce !== false) {
      opacity.setValue(next);
      return;
    }
    const anim = Animated.timing(opacity, {
      toValue: next,
      duration: ob.motion.fast,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
      isInteraction: false,
    });
    anim.start();
    return () => anim.stop();
  }, [selected, reduce, opacity]);

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.selectedStroke, { opacity }]} />
  );
}

function PopCheck() {
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(reduce === true ? 1 : 0.6)).current;

  useEffect(() => {
    if (reduce === null) return;
    if (reduce) {
      scale.setValue(1);
      return;
    }
    scale.setValue(0.6);
    const anim = Animated.spring(scale, {
      toValue: 1,
      tension: ob.motion.spring.tension,
      friction: ob.motion.spring.friction,
      useNativeDriver: true,
      isInteraction: false,
    });
    anim.start();
    return () => anim.stop();
  }, [reduce, scale]);

  return (
    <Animated.View style={[styles.check, { transform: [{ scale }] }]}>
      <Icon name="checkmark" size={14} color={ON_ACCENT} />
    </Animated.View>
  );
}

/** Big illustrated choice for a 2-up or 2x2 grid. The parent cell sets the width. */
export function ChoiceCard({ title, sub, art, selected, onPress, testID }: ChoiceCardProps) {
  const { scale, onPressIn, onPressOut } = usePressScale();
  const accessibilityLabel = sub ? `${title}, ${sub}` : title;

  function handlePress() {
    hapticSelection();
    onPress();
  }

  return (
    <Animated.View style={[styles.wrap, selected ? styles.selectedRing : null, { transform: [{ scale }] }]}>
      <Pressable
        testID={testID}
        onPress={handlePress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="radio"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ selected }}
        style={styles.pressable}
      >
        <View style={styles.shell}>
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.baseChrome]} />
          <SelectionWash selected={selected} />
          <View style={styles.content}>
            <View style={styles.art}>{art}</View>
            <Text style={styles.title}>{title}</Text>
            {sub ? <Text style={styles.sub}>{sub}</Text> : null}
          </View>
          {selected ? (
            <View pointerEvents="none" style={styles.checkWrap}>
              <PopCheck />
            </View>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch',
    flexGrow: 1,
  },
  pressable: {
    flexGrow: 1,
  },
  shell: {
    flexGrow: 1,
    borderRadius: ob.radius.card,
    overflow: 'hidden',
  },
  baseChrome: {
    backgroundColor: ob.color.surface,
    borderRadius: ob.radius.card,
    borderWidth: STROKE,
    borderColor: ob.color.line,
  },
  selectedRing: {
    shadowColor: ob.color.accent,
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  selectedStroke: {
    borderRadius: ob.radius.card,
    borderWidth: STROKE,
    borderColor: ob.color.accent,
  },
  content: {
    flexGrow: 1,
    padding: 14 + STROKE,
    alignItems: 'center',
  },
  art: {
    flexGrow: 1,
    alignSelf: 'stretch',
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...obType.rowLabel,
    textAlign: 'center',
    alignSelf: 'stretch',
    marginTop: ob.space.sm,
  },
  sub: {
    ...obType.caption,
    textAlign: 'center',
    alignSelf: 'stretch',
    marginTop: 2,
  },
  checkWrap: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 2,
  },
  check: {
    width: ob.size.check,
    height: ob.size.check,
    borderRadius: ob.size.check / 2,
    backgroundColor: ob.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
