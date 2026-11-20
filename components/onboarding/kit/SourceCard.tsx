import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { ob, obType } from './tokens';

type SourceKind = 'journal' | 'guideline' | 'study';

type SourceCardProps = {
  org: string;
  line: string;
  kind?: SourceKind;
};

const KIND_ICON: Record<SourceKind, IconName> = {
  journal: 'book-outline',
  guideline: 'shield-checkmark-outline',
  study: 'analytics-outline',
};

/** Citation card. Glyphs stand in for logos so we never draw a trademark. */
export function SourceCard({ org, line, kind = 'journal' }: SourceCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.glyph}>
        <Icon name={KIND_ICON[kind]} size={18} color={ob.color.accent} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.org}>{org}</Text>
        <Text style={styles.line}>{line}</Text>
      </View>
    </View>
  );
}

type SourcesLinkProps = {
  onPress: () => void;
  label?: string;
};

/** Quiet underlined caption that opens the sources sheet. */
export function SourcesLink({ onPress, label = 'Sources' }: SourcesLinkProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
    >
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: ob.color.source,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  glyph: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: ob.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  org: {
    ...obType.bodyStrong,
  },
  line: {
    ...obType.caption,
  },
  link: {
    minHeight: 44,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  linkPressed: {
    opacity: 0.6,
  },
  linkText: {
    ...obType.caption,
    color: ob.color.ink,
    textDecorationLine: 'underline',
  },
});
