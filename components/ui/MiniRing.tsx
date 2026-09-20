import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../../constants/colors';

type MiniRingProps = {
  value: number;
  total: number;
  size?: number;
  /** Progress arc color. Defaults to primary green. */
  accent?: string;
  track?: string;
};

/** Compact progress ring — value vs total (e.g. week N of M). */
export function MiniRing({
  value,
  total,
  size = 52,
  accent = colors.primary,
  track = colors.border,
}: MiniRingProps) {
  const stroke = Math.max(5, Math.round(size * 0.068));
  const cx = size / 2;
  const r = (size - stroke) / 2 - 1;
  const circ = 2 * Math.PI * r;
  const progress = total > 0 ? Math.min(Math.max(value, 0) / total, 1) : 0;
  const done = total > 0 && value >= total;
  const fontSize = Math.round(size * 0.3);

  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessibilityLabel={`${value} of ${total}`}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={cx}
          cy={cx}
          r={r - stroke * 0.35}
          fill={colors.background}
        />
        <Circle
          cx={cx}
          cy={cx}
          r={r}
          stroke={track}
          strokeWidth={stroke}
          fill="none"
        />
        {progress > 0 ? (
          <Circle
            cx={cx}
            cy={cx}
            r={r}
            stroke={accent}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circ} ${circ}`}
            strokeDashoffset={circ * (1 - progress)}
            fill="none"
            transform={`rotate(-90 ${cx} ${cx})`}
          />
        ) : null}
      </Svg>
      <Text
        style={[
          styles.text,
          { fontSize, color: done ? accent : colors.textPrimary },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  text: {
    position: 'absolute',
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
  },
});
