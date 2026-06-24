import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing } from 'react-native';
import { colors } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { getBubbleCopy } from '../../constants/personalizationBubbles';
import { trackEvent } from '../../lib/analytics';

type PersonalizationBubbleProps = {
  field: string;
  value: string | number | null | undefined;
};

// Small, dismissible, non-blocking tooltip shown when a user selects an option that
// affects their plan. It does not require a tap to continue — the Continue button stays
// active. Re-appears when the selected value changes.
export function PersonalizationBubble({ field, value }: PersonalizationBubbleProps) {
  const copy = getBubbleCopy(field, value);
  const [dismissedFor, setDismissedFor] = useState<string | number | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(6)).current;

  const visible = !!copy && value !== dismissedFor;

  useEffect(() => {
    if (!visible) return;
    // Analytics: bubble shown for this option.
    trackEvent('onboarding_option_bubble_shown', { field, value });
    opacity.setValue(0);
    translateY.setValue(6);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [field, value, visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.bubble, { opacity, transform: [{ translateY }] }]}>
      <Text style={styles.icon}>✦</Text>
      <Text style={styles.text}>{copy}</Text>
      <Pressable hitSlop={10} onPress={() => setDismissedFor(value ?? null)}>
        <Text style={styles.dismiss}>✕</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.chip,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 16,
  },
  icon: {
    fontSize: 13,
    color: colors.primary,
    marginTop: 1,
  },
  text: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: colors.primaryDeep,
  },
  dismiss: {
    fontSize: 12,
    color: colors.primary,
    paddingHorizontal: 2,
  },
});
