import React, { useEffect, useRef } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, Animated, Easing } from 'react-native';
import { colors, serifFont } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';
import { hapticSelection, hapticSuccess } from '../../lib/haptics';
import { trackEvent } from '../../lib/analytics';
import type { EquipmentTier } from '../../types/database';

type Copy = {
  title: string;
  body: string;
  confirmLabel: string;
  tone: 'gentle' | 'celebration';
};

// Shown once per equipment value per visit to the equipment question — see q7.tsx.
// A warm, brief nudge for the lower tiers; a confidence boost for gym. No scare tactics.
const COPY: Record<EquipmentTier, Copy> = {
  open_space: {
    title: 'Before you continue',
    body: "A resistance band or a couple of light dumbbells, if you're ever able to get them, can help your body heal even faster.",
    confirmLabel: 'Continue',
    tone: 'gentle',
  },
  bands_dumbbells: {
    title: 'One thing to know',
    body: 'If a gym is ever within reach, the extra resistance can help you heal even faster.',
    confirmLabel: 'Continue',
    tone: 'gentle',
  },
  gym: {
    title: 'Great choice',
    body: 'Full equipment access means we can build you the most effective program possible.',
    confirmLabel: "Let's go",
    tone: 'celebration',
  },
};

type EquipmentDisclaimerModalProps = {
  /** The equipment value to confirm, or null when the modal should be hidden. */
  value: EquipmentTier | null;
  /** User acknowledges and dismisses. */
  onConfirm: () => void;
};

export function EquipmentDisclaimerModal({ value, onConfirm }: EquipmentDisclaimerModalProps) {
  const visible = value !== null;
  const scale = useRef(new Animated.Value(0.92)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!value) return;
    const copy = COPY[value];
    trackEvent('onboarding_equipment_disclaimer_shown', { value });
    if (copy.tone === 'celebration') {
      hapticSuccess();
    } else {
      hapticSelection();
    }

    scale.setValue(0.92);
    opacity.setValue(0);

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 16,
        bounciness: 8,
      }),
    ]).start();
  }, [value, scale, opacity]);

  if (!visible || !value) return null;
  const copy = COPY[value];

  function handlePressIn() {
    Animated.spring(buttonScale, { toValue: 0.97, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  }

  function handlePressOut() {
    Animated.spring(buttonScale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 6 }).start();
  }

  function handleConfirm() {
    hapticSelection();
    trackEvent('onboarding_equipment_disclaimer_confirmed', { value });
    onConfirm();
  }

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={handleConfirm}>
      <View style={styles.backdrop}>
        <Animated.View style={[styles.panel, { opacity, transform: [{ scale }] }]}>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.body}</Text>

          <Animated.View style={{ width: '100%', transform: [{ scale: buttonScale }] }}>
            <Pressable
              style={styles.confirmButton}
              onPress={handleConfirm}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
            >
              <Text style={styles.confirmLabel}>{copy.confirmLabel}</Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(28, 28, 30, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  panel: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    ...shadows.high,
  },
  title: {
    fontSize: 20,
    fontFamily: serifFont,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 22,
  },
  confirmButton: {
    height: 50,
    width: '100%',
    borderRadius: radius.button,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.medium,
    shadowColor: colors.primaryDeep,
    shadowOpacity: 0.2,
  },
  confirmLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
