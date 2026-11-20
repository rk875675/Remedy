import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { colors, serifFont } from '../../constants/colors';
import { shadows } from '../../constants/shadows';
import type { ExerciseDetail } from '../../lib/exerciseDetails';
import { hapticPrimaryAction } from '../../lib/haptics';
import { useAfterTransition } from '../../lib/useAfterTransition';
import { useReduceMotion } from '../../lib/useReduceMotion';
import { BottomSheet, Icon } from '../onboarding/kit';

type ExerciseGuideSheetProps = {
  visible: boolean;
  name: string;
  detail: ExerciseDetail;
  onClose: () => void;
};

function present(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function ExerciseGuideSheet({ visible, name, detail, onClose }: ExerciseGuideSheetProps) {
  const steps = detail.steps.map((step) => step.trim()).filter((step) => step.length > 0);
  const mistakes = detail.mistakes.map((item) => item.trim()).filter((item) => item.length > 0);
  const feel = present(detail.feel);
  const purpose = present(detail.purpose);
  const tempo = present(detail.tempo);
  const breathing = present(detail.breathing);
  const easier = present(detail.easier);
  const harder = present(detail.harder);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.name}>{name}</Text>
      {purpose ? <Text style={styles.purpose}>{purpose}</Text> : null}

      {steps.length > 0 ? (
        <View style={styles.section}>
          {steps.map((step, index) => (
            <View
              key={`${index}-${step}`}
              style={styles.stepRow}
              accessible
              accessibilityLabel={`Step ${index + 1}. ${step}`}
            >
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>{index + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {feel ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>You should feel it</Text>
          <Text style={styles.body}>{feel}</Text>
        </View>
      ) : null}

      {mistakes.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Common mistakes</Text>
          {mistakes.map((item, index) => (
            <View key={`${index}-${item}`} style={styles.mistakeRow}>
              <Icon name="close-circle-outline" size={18} color={colors.secondary} />
              <Text style={styles.mistakeText}>{item}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {tempo || breathing ? (
        <View style={styles.chips}>
          {tempo ? (
            <View style={styles.chip}>
              <Text style={styles.chipText}>{tempo}</Text>
            </View>
          ) : null}
          {breathing ? (
            <View style={styles.chip}>
              <Text style={styles.chipText}>{breathing}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {easier ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Make it easier</Text>
          <Text style={styles.body}>{easier}</Text>
        </View>
      ) : null}
      {harder ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Make it harder</Text>
          <Text style={styles.body}>{harder}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={styles.gotIt}
        onPress={() => {
          hapticPrimaryAction();
          onClose();
        }}
        accessibilityRole="button"
        accessibilityLabel="Got it"
      >
        <Text style={styles.gotItText}>Got it</Text>
      </TouchableOpacity>
    </BottomSheet>
  );
}

type ExerciseGuidePillProps = {
  pulse: boolean;
  onPress: () => void;
  onPulseEnd: () => void;
};

/** Compact entry to the guide. Pulses once when auto-open is skipped. */
export function ExerciseGuidePill({ pulse, onPress, onPulseEnd }: ExerciseGuidePillProps) {
  const reduce = useReduceMotion();
  const ready = useAfterTransition();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!pulse || reduce !== false || !ready) return;
    const anim = Animated.sequence([
      Animated.timing(opacity, {
        toValue: 0.4,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]);
    anim.start(({ finished }) => {
      if (finished) onPulseEnd();
    });
    return () => anim.stop();
  }, [onPulseEnd, opacity, pulse, ready, reduce]);

  return (
    <Animated.View style={[styles.pillWrap, { opacity }]}>
      <TouchableOpacity
        style={styles.pill}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="How to do it"
      >
        <Text style={styles.pillText}>How to do it</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  name: {
    fontFamily: serifFont,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  purpose: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.textSecondary,
    marginBottom: 18,
  },
  section: {
    marginBottom: 18,
  },
  sectionLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 8,
  },
  body: {
    fontSize: 17,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stepText: {
    flex: 1,
    fontSize: 17,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  mistakeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  mistakeText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  chip: {
    maxWidth: '100%',
    backgroundColor: colors.primaryMuted,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: colors.primary,
  },
  gotIt: {
    height: 52,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    ...shadows.medium,
    shadowColor: colors.primaryDeep,
    shadowOpacity: 0.25,
  },
  gotItText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  pillWrap: {
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  pill: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
});
