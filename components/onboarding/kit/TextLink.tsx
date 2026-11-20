import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { ob, obType } from './tokens';

export type TextLinkProps = {
  label: string;
  onPress: () => void;
  /** `ink` is the default. `soft` is for a quieter second action. */
  tone?: 'ink' | 'soft' | 'light';
};

/** Centred text button. Skip, sign-in, and other quiet actions. */
export function TextLink({ label, onPress, tone = 'ink' }: TextLinkProps) {
  const color = tone === 'light' ? '#F6EDE0' : tone === 'soft' ? ob.color.inkSoft : ob.color.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.link, pressed ? styles.pressed : null]}
    >
      <Text style={[obType.bodyStrong, styles.label, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: {
    minHeight: 44,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  pressed: {
    opacity: 0.6,
  },
  label: {
    textAlign: 'center',
  },
});
