import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { hapticPrimaryAction } from '../../../lib/haptics';
import { useReduceMotion } from '../../../lib/useReduceMotion';
import { Icon } from './Icon';
import { ob, obType } from './tokens';

export type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Trailing chevron. Default false. */
  chevron?: boolean;
  variant?: 'solid' | 'soft' | 'danger' | 'ink';
  /** Spinner in place of the label. Presses are ignored. */
  loading?: boolean;
  testID?: string;
  /** Spoken label, when it should say more than the visible words. */
  accessibilityLabel?: string;
};

/** Label ink on the forest-green fill. There is no on-accent token. */
const ON_ACCENT = '#FFFFFF';

type Layers = { back: string; front: string };

function usePressScale(enabled: boolean): {
  scale: Animated.Value;
  onPressIn: () => void;
  onPressOut: () => void;
} {
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;

  function springTo(toValue: number) {
    if (reduce === true) {
      scale.setValue(toValue === 1 ? 1 : ob.motion.pressScale);
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
      if (!enabled || reduce === true) return;
      springTo(ob.motion.pressScale);
    },
    onPressOut: () => {
      springTo(1);
    },
  };
}

/**
 * Cross-fades the label over `ob.motion.fast`. Both strings stay mounted so the
 * button's box never changes size when the words change.
 */
function CrossfadeLabel({
  label,
  color,
  chevron,
}: {
  label: string;
  color: string;
  chevron: boolean;
}) {
  const reduce = useReduceMotion();
  const shown = useRef(label);
  const play = useRef(false);
  const [layers, setLayers] = useState<Layers>({ back: label, front: label });
  const backOpacity = useRef(new Animated.Value(0)).current;
  const frontOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (label === shown.current) return;
    const previous = shown.current;
    shown.current = label;
    if (reduce !== false) {
      play.current = false;
      backOpacity.setValue(0);
      frontOpacity.setValue(1);
      setLayers({ back: label, front: label });
      return;
    }
    play.current = true;
    backOpacity.setValue(1);
    frontOpacity.setValue(0);
    setLayers({ back: previous, front: label });
  }, [label, reduce, backOpacity, frontOpacity]);

  useLayoutEffect(() => {
    if (!play.current) return;
    play.current = false;
    const anim = Animated.parallel([
      Animated.timing(backOpacity, {
        toValue: 0,
        duration: ob.motion.fast,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
        isInteraction: false,
      }),
      Animated.timing(frontOpacity, {
        toValue: 1,
        duration: ob.motion.fast,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
        isInteraction: false,
      }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [layers, backOpacity, frontOpacity]);

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[styles.labelLayer, { opacity: backOpacity }]}>
        <LabelRow text={layers.back} color={color} chevron={chevron} />
      </Animated.View>
      <Animated.View style={[styles.labelLayer, { opacity: frontOpacity }]}>
        <LabelRow text={layers.front} color={color} chevron={chevron} />
      </Animated.View>
    </View>
  );
}

function LabelRow({ text, color, chevron }: { text: string; color: string; chevron: boolean }) {
  return (
    <View style={styles.labelRow}>
      <Text style={[styles.label, { color }]}>{text}</Text>
      {chevron ? <Icon name="chevron-forward" size={16} color={color} /> : null}
    </View>
  );
}

function labelColor(variant: 'solid' | 'soft' | 'danger' | 'ink', disabled: boolean): string {
  if (disabled) return ob.color.disabledText;
  if (variant === 'soft') return ob.color.accentDeep;
  if (variant === 'danger') return ob.color.clay;
  return ON_ACCENT;
}

function fillColor(
  variant: 'solid' | 'soft' | 'danger' | 'ink',
  disabled: boolean,
  pressed: boolean,
): string {
  if (disabled) return ob.color.disabledBg;
  if (variant === 'soft') return ob.color.accentSoft;
  if (variant === 'danger') return ob.color.surface;
  if (variant === 'ink') return pressed ? '#000000' : '#111111';
  return pressed ? ob.color.accentDeep : ob.color.accent;
}

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  chevron = false,
  variant = 'solid',
  loading = false,
  testID,
  accessibilityLabel,
}: PrimaryButtonProps) {
  const blocked = disabled || loading;
  const { scale, onPressIn, onPressOut } = usePressScale(!blocked);
  const color = labelColor(variant, disabled);
  const showShadow = (variant === 'solid' || variant === 'ink') && !disabled;

  function handlePress() {
    if (blocked) return;
    hapticPrimaryAction();
    onPress();
  }

  return (
    <Animated.View style={[styles.wrap, { transform: [{ scale }] }]}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? (loading ? `${label}, loading` : label)}
        accessibilityState={{ disabled: blocked, busy: loading }}
        disabled={blocked}
        onPress={handlePress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: fillColor(variant, disabled, pressed && !blocked),
            borderWidth: variant === 'danger' && !disabled ? 1.5 : 0,
            borderColor: ob.color.clay,
          },
          showShadow ? styles.shadow : null,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={color} />
        ) : (
          <CrossfadeLabel label={label} color={color} chevron={chevron} />
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignSelf: 'stretch',
  },
  button: {
    height: ob.size.button,
    width: '100%',
    borderRadius: ob.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shadow: {
    shadowColor: ob.color.accentDeep,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  labelLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    gap: 6,
    paddingHorizontal: 20,
  },
  label: {
    ...obType.button,
    textAlign: 'center',
    flexShrink: 1,
  },
});
