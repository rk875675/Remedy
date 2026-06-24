import React, { useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { colors } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';
import { hapticSelection } from '../../lib/haptics';

type OptionCardProps = {
  label: string;
  icon?: React.ReactNode;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
};

export function OptionCard({ label, icon, subtitle, selected, onPress }: OptionCardProps) {
  const scale = useRef(new Animated.Value(1)).current;

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
        style={[styles.card, selected && styles.cardSelected]}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        {icon && (
          <View style={[styles.iconCircle, selected && styles.iconCircleSelected]}>
            {icon}
          </View>
        )}
        <View style={styles.textContainer}>
          <Text style={[styles.label, selected && styles.labelSelected]}>
            {label}
          </Text>
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
  textContainer: {
    flex: 1,
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
