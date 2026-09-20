import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text } from 'react-native';
import { colors } from '../../constants/colors';
import { getBubbleCopy } from '../../constants/personalizationBubbles';
import { onboardingHintShown } from '../../lib/analytics/events/onboarding';
import { activeStepKey } from '../../lib/analytics/onboardingSteps';

/** Sentinel: the hint was not visible at mount, so no value was pre-filled. */
const NO_PREFILL = Symbol('no-prefill');

type Props = {
  field: string;
  value: string | number | null | undefined;
  /** Override lookup copy (e.g. the nerve first-tap note). */
  copy?: string;
  numberOfLines?: number;
  color?: string;
};

/**
 * Quiet caption under a selected option. Same copy + hint analytics as
 * the old green box, without a dismiss control.
 */
export function PersonalizationHint({
  field,
  value,
  copy: copyOverride,
  numberOfLines = 2,
  color,
}: Props) {
  const copy = copyOverride ?? getBubbleCopy(field, value);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(2)).current;
  const visible = !!copy;

  const mount = useRef<{ prefilled: unknown } | null>(null);
  if (mount.current === null) mount.current = { prefilled: visible ? value : NO_PREFILL };

  useEffect(() => {
    if (!visible) return;
    const stepKey = activeStepKey();
    const isPrefill = value === mount.current?.prefilled;
    if (!isPrefill && stepKey !== null) onboardingHintShown({ step_key: stepKey, hint_key: field });
    opacity.setValue(0);
    translateY.setValue(2);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 480,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 480,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [field, value, visible, opacity, translateY]);

  if (!visible) return null;

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <Text style={[styles.text, color ? { color } : null]} numberOfLines={numberOfLines}>
        {copy}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '400',
    color: colors.textSecondary,
  },
});
