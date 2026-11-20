import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { hapticSelection } from '../../../lib/haptics';
import { useAfterTransition } from '../../../lib/useAfterTransition';
import { useReduceMotion } from '../../../lib/useReduceMotion';
import { GlyphTile, type ObGlyph } from './glyphs';
import { Icon, IconTile, type IconName } from './Icon';
import { ob, obType } from './tokens';

export type OptionRowProps = {
  label: string;
  sub?: string;
  icon?: IconName;
  /** Existing onboarding illustration. Wins over `glyph` and `icon`. */
  image?: ImageSourcePropType;
  /** Custom drawing in a soft tile. Wins over `icon`. */
  glyph?: ObGlyph;
  selected: boolean;
  onPress: () => void;
  /** Default `single`. Multi always shows the circle. Single reserves the slot. */
  mode?: 'single' | 'multi';
  /** Small chip to the right of the label, for example "Recommended". */
  badge?: string;
  disabled?: boolean;
  testID?: string;
};

/** Stroke is inside the chrome layers, so padding adds it back to keep 12 / 14 inside the border. */
const STROKE = 1.5;
const ON_ACCENT = '#FFFFFF';

function usePressScale(enabled: boolean): {
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
      if (!enabled || reduce === true) return;
      springTo(ob.motion.pressScale);
    },
    onPressOut: () => {
      springTo(1);
    },
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
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: ob.color.accentSoft }]} />
      <View style={[StyleSheet.absoluteFill, styles.selectedStroke]} />
    </Animated.View>
  );
}

const ART = 72;

function OptionImage({ source, selected }: { source: ImageSourcePropType; selected: boolean }) {
  const reduce = useReduceMotion();
  const ready = useAfterTransition();
  const bob = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!ready || reduce !== false) {
      bob.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: -3,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [ready, reduce, bob]);

  useEffect(() => {
    if (reduce === true) {
      scale.setValue(1);
      return;
    }
    const anim = Animated.spring(scale, {
      toValue: selected ? 1.04 : 1,
      tension: ob.motion.spring.tension,
      friction: ob.motion.spring.friction,
      useNativeDriver: true,
      isInteraction: false,
    });
    anim.start();
    return () => anim.stop();
  }, [selected, reduce, scale]);

  return (
    <Animated.View style={[styles.imageWrap, { transform: [{ translateY: bob }, { scale }] }]}>
      <Image source={source} style={styles.image} />
    </Animated.View>
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
    <Animated.View style={[styles.filledCheck, { transform: [{ scale }] }]}>
      <Icon name="checkmark" size={14} color={ON_ACCENT} />
    </Animated.View>
  );
}

export function OptionRow({
  label,
  sub,
  icon,
  image,
  glyph,
  selected,
  onPress,
  mode = 'single',
  badge,
  disabled = false,
  testID,
}: OptionRowProps) {
  const { scale, onPressIn, onPressOut } = usePressScale(!disabled);
  const accessibilityLabel = [label, badge, sub].filter((part) => part && part.length > 0).join(', ');

  function handlePress() {
    if (disabled) return;
    hapticSelection();
    onPress();
  }

  return (
    <Animated.View style={[{ transform: [{ scale }] }, disabled ? styles.disabled : null]}>
      <Pressable
        testID={testID}
        disabled={disabled}
        onPress={handlePress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole={mode === 'multi' ? 'checkbox' : 'radio'}
        accessibilityLabel={accessibilityLabel}
        accessibilityState={
          mode === 'multi'
            ? { checked: selected, disabled }
            : { selected, disabled }
        }
        style={styles.shell}
      >
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.baseChrome]} />
        <SelectionWash selected={selected} />
        <View style={[styles.content, image ? styles.contentArt : null]}>
          {image ? (
            <OptionImage source={image} selected={selected} />
          ) : glyph ? (
            <GlyphTile name={glyph} selected={selected} />
          ) : icon ? (
            <IconTile name={icon} selected={selected} />
          ) : null}
          <View style={styles.textCol}>
            <View style={styles.labelLine}>
              <Text style={[styles.label, selected ? styles.labelOn : null]}>{label}</Text>
              {badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge}</Text>
                </View>
              ) : null}
            </View>
            {sub ? <Text style={styles.sub}>{sub}</Text> : null}
          </View>
          <View style={styles.checkSlot}>
            {mode === 'multi' && !selected ? <View style={styles.emptyCheck} /> : null}
            {selected ? <PopCheck /> : null}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: ob.radius.row,
    overflow: 'hidden',
  },
  baseChrome: {
    backgroundColor: ob.color.surface,
    borderRadius: ob.radius.row,
    borderWidth: STROKE,
    borderColor: ob.color.line,
  },
  selectedStroke: {
    borderRadius: ob.radius.row,
    borderWidth: STROKE,
    borderColor: ob.color.accent,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12 + STROKE,
    paddingHorizontal: 14 + STROKE,
    minHeight: ob.size.rowMin,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  labelLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 8,
    rowGap: 4,
  },
  label: {
    ...obType.rowLabel,
    flexGrow: 0,
    flexShrink: 0,
    maxWidth: '100%',
  },
  labelOn: {
    color: ob.color.accentDeep,
  },
  sub: {
    ...obType.rowSub,
    marginTop: 2,
  },
  badge: {
    flexGrow: 0,
    flexShrink: 0,
    maxWidth: '100%',
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: ob.color.accentSoft,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  badgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: ob.color.accentDeep,
  },
  checkSlot: {
    width: ob.size.check,
    height: ob.size.check,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCheck: {
    width: ob.size.check,
    height: ob.size.check,
    borderRadius: ob.size.check / 2,
    borderWidth: STROKE,
    borderColor: ob.color.line,
    backgroundColor: ob.color.surface,
  },
  filledCheck: {
    width: ob.size.check,
    height: ob.size.check,
    borderRadius: ob.size.check / 2,
    backgroundColor: ob.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  contentArt: {
    paddingVertical: 8 + STROKE,
    paddingLeft: 8 + STROKE,
  },
  imageWrap: {
    width: ART,
    height: ART,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#F3EEE6',
  },
  image: {
    width: ART,
    height: ART,
  },
});
