import React, { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { hapticSelection } from '../../../lib/haptics';
import { useReduceMotion } from '../../../lib/useReduceMotion';
import { Icon, RevealText, TextLink, type IconName } from '../kit';
import { ob, obType } from '../kit/tokens';

const HEAR_OPTIONS = [
  { value: 'instagram', label: 'Instagram', icon: 'logo-instagram' },
  { value: 'tiktok', label: 'TikTok', icon: 'logo-tiktok' },
  { value: 'youtube', label: 'YouTube', icon: 'logo-youtube' },
  { value: 'facebook', label: 'Facebook', icon: 'logo-facebook' },
  { value: 'google', label: 'Google', icon: 'logo-google' },
  { value: 'friend_family', label: 'Friend or family', icon: 'people-outline' },
  { value: 'other', label: 'Other', icon: 'ellipsis-horizontal' },
] as const satisfies readonly { value: string; label: string; icon: IconName }[];

export type HearValue = (typeof HEAR_OPTIONS)[number]['value'];

type AttributionPopupProps = {
  onAnswer: (value: HearValue) => void;
  onSkip: () => void;
};

/** The old attribution question, asked once in the middle of the loader. */
export function AttributionPopup({ onAnswer, onSkip }: AttributionPopupProps) {
  const reduce = useReduceMotion();
  const { height } = useWindowDimensions();
  const scale = useRef(new Animated.Value(reduce === true ? 1 : 0.92)).current;
  const opacity = useRef(new Animated.Value(reduce === true ? 1 : 0)).current;
  const listMax = Math.max(200, height - 300);

  useEffect(() => {
    if (reduce === null) return;
    if (reduce) {
      scale.setValue(1);
      opacity.setValue(1);
      return;
    }
    const anim = Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        tension: ob.motion.spring.tension,
        friction: ob.motion.spring.friction,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: ob.motion.fast,
        useNativeDriver: true,
      }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [reduce, opacity, scale]);

  function choose(value: HearValue) {
    hapticSelection();
    onAnswer(value);
  }

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onSkip}>
      <View style={styles.scrim} accessibilityViewIsModal>
        <Animated.View style={[styles.card, { opacity, transform: [{ scale }] }]}>
          <RevealText style={styles.title}>One quick thing. Where did you hear about us?</RevealText>
          <ScrollView
            style={{ maxHeight: listMax }}
            contentContainerStyle={styles.list}
            bounces={false}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {HEAR_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                testID={`hear-${option.value}`}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                onPress={() => choose(option.value)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <Icon name={option.icon} size={20} color={ob.color.ink} />
                <Text style={styles.label}>{option.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View testID="hear-skip" collapsable={false}>
            <TextLink label="Skip" onPress={onSkip} tone="soft" />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: ob.color.scrim,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: ob.color.surface,
    borderRadius: ob.radius.card,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
    gap: 12,
  },
  title: {
    ...obType.heading,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  list: {
    gap: 8,
  },
  row: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: ob.color.tile,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
  },
  rowPressed: {
    backgroundColor: ob.color.accentSoft,
  },
  label: {
    ...obType.rowLabel,
    flex: 1,
  },
});
