import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Image, Easing, type ImageSourcePropType } from 'react-native';
import { colors } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';
import { hapticSelection } from '../../lib/haptics';
import { useAfterTransition } from '../../lib/useAfterTransition';

type OptionCardProps = {
  label: string;
  icon?: React.ReactNode;
  image?: ImageSourcePropType;
  illustration?: ImageSourcePropType;
  iconStyle?: 'circle' | 'plain';
  subtitle?: string;
  badge?: string;
  photoSize?: number;
  minHeight?: number;
  /** Extra lift (pt) applied to the title when a hint is showing. Default 6. */
  hintLift?: number;
  /** Grey caption under the label, inside the card. Does not change card size. */
  hint?: React.ReactNode;
  selected: boolean;
  onPress: () => void;
};

function IllustrationTile({ source, size }: { source: ImageSourcePropType; size: number }) {
  const bob = useRef(new Animated.Value(0)).current;
  const ready = useAfterTransition();

  useEffect(() => {
    if (!ready) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: -4,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob, ready]);

  return (
    <Animated.View
      style={[styles.illoWrap, { width: size, height: size, transform: [{ translateY: bob }] }]}
    >
      <Image source={source} style={[styles.illoImage, { width: size, height: size }]} />
    </Animated.View>
  );
}

export function OptionCard({
  label,
  icon,
  image,
  illustration,
  iconStyle = 'circle',
  subtitle,
  badge,
  photoSize,
  minHeight,
  hintLift = 6,
  hint,
  selected,
  onPress,
}: OptionCardProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const hasArt = !!image || !!illustration;
  const tile = photoSize ?? 80;

  function handlePressIn() {
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
      bounciness: 0,
    }).start();
  }

  function handlePressOut() {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 8,
    }).start();
  }

  function handlePress() {
    // Fires on every tap, including deselecting the current option.
    hapticSelection();
    onPress();
  }

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        style={[
          styles.card,
          hasArt && styles.cardWithPhoto,
          selected && styles.cardSelected,
          minHeight !== undefined && { minHeight },
        ]}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        {illustration ? (
          <IllustrationTile source={illustration} size={tile} />
        ) : image ? (
          <Image
            source={image}
            style={[styles.photo, { width: tile, height: tile, borderRadius: Math.round(tile * 0.175) }]}
          />
        ) : icon ? (
          iconStyle === 'plain' ? (
            <View style={styles.iconPlain}>{icon}</View>
          ) : (
            <View style={[styles.iconCircle, selected && styles.iconCircleSelected]}>{icon}</View>
          )
        ) : null}
        <View style={styles.textContainer}>
          <View
            style={[
              styles.labelBlock,
              !!hint && { transform: [{ translateY: -hintLift }] },
            ]}
          >
            <View style={styles.labelRow}>
              <Text style={[styles.label, selected && styles.labelSelected]}>
                {label}
              </Text>
              {badge ? <Text style={styles.badge}>{badge}</Text> : null}
            </View>
            {hint ? <View style={styles.hintOverlay} pointerEvents="none">{hint}</View> : null}
          </View>
          {subtitle && (
            <Text style={[styles.subtitle, selected && styles.subtitleSelected]}>
              {subtitle}
            </Text>
          )}
        </View>
        <View style={[styles.checkDot, selected && styles.checkDotSelected]}>
          {selected && <Text style={styles.checkMark}>✓</Text>}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: radius.button,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 14,
  },
  // Photo rows match Hinge-style body-area cards: ~80pt square that fills
  // the row, with tight padding so the image is the visual weight.
  cardWithPhoto: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 14,
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
    ...shadows.low,
    shadowColor: colors.primaryDeep,
    shadowOpacity: 0.12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: radius.circle,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleSelected: {
    backgroundColor: colors.primary,
  },
  photo: {
    width: 80,
    height: 80,
    borderRadius: 14,
    backgroundColor: colors.borderLight,
  },
  illoWrap: {
    width: 80,
    height: 80,
    borderRadius: 14,
    backgroundColor: '#F3EEE6',
    overflow: 'hidden',
  },
  illoImage: {
    width: 80,
    height: 80,
  },
  iconPlain: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
  },
  labelBlock: {
    position: 'relative',
  },
  hintOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '100%',
    marginTop: 2,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.secondary,
    backgroundColor: colors.secondaryMuted,
    overflow: 'hidden',
    borderRadius: radius.chip,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  label: {
    fontSize: 17,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  labelSelected: {
    color: colors.primaryDeep,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 20,
  },
  subtitleSelected: {
    color: colors.primary,
  },
  checkDot: {
    width: 22,
    height: 22,
    borderRadius: radius.circle,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkDotSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  checkMark: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 14,
  },
});
