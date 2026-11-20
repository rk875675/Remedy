import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { ob, obType, toneColors, type ObTone } from './tokens';

type NoteCardProps = {
  tone?: ObTone;
  icon?: IconName;
  title?: string;
  text: string;
};

/** Small tinted note under a control: a live result or a one-line helper. */
export function NoteCard({ tone = 'accent', icon, title, text }: NoteCardProps) {
  const colors = toneColors(tone);
  return (
    <View style={[styles.card, { backgroundColor: colors.bg }]}>
      {icon ? <Icon name={icon} size={18} color={colors.fg} /> : null}
      <View style={styles.copy}>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        <Text style={styles.text}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...obType.bodyStrong,
  },
  text: {
    ...obType.caption,
    color: ob.color.ink,
  },
});
