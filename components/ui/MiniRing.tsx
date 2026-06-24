import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../../constants/colors';

type MiniRingProps = {
  value: number;
  total: number;
  size?: number;
};

/** Compact progress ring — value vs total (e.g. week N of M). */
export function MiniRing({ value, total, size = 52 }: MiniRingProps) {
  const STROKE = Math.max(6, Math.round(size * 0.1));
  const R = (size - STROKE) / 2;
  const CIRC = 2 * Math.PI * R;
  const progress = total > 0 ? Math.min(value / total, 1) : 0;
  const fontSize = Math.round(size * 0.22);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={R}
          stroke={colors.primaryMuted}
          strokeWidth={STROKE}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={R}
          stroke={colors.primary}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - progress)}
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={[styles.text, { fontSize }]}>
        {value}/{total}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  text: {
    position: 'absolute',
    fontWeight: '700',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
});
