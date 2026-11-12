import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../../constants/colors';

/**
 * Barely-there warm wash behind onboarding screens. Keep it faint: it should
 * read as "warm paper", never as a visible gradient. Decorative only.
 */
export function WarmBackground() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="warm" cx="85%" cy="0%" rx="90%" ry="55%">
            <Stop offset="0" stopColor="#F3D2B3" stopOpacity={0.32} />
            <Stop offset="1" stopColor="#F3D2B3" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="sage" cx="10%" cy="100%" rx="80%" ry="40%">
            <Stop offset="0" stopColor={colors.primary} stopOpacity={0.05} />
            <Stop offset="1" stopColor={colors.primary} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#warm)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#sage)" />
      </Svg>
    </View>
  );
}
