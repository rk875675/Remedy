/**
 * Skeleton — shimmer loading placeholder.
 *
 * Renders a neutral block with an animated highlight band sweeping
 * left-to-right. The gradient is drawn with react-native-svg (works in both
 * Expo Go and dev builds — no extra native module required).
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../../constants/colors';

type SkeletonProps = {
  height: number;
  width?: DimensionValue;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

export function Skeleton({ height, width = '100%', borderRadius = 12, style }: SkeletonProps) {
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration: 1300,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-measuredWidth, measuredWidth],
  });

  return (
    <View
      style={[styles.base, { height, width, borderRadius, overflow: 'hidden' }, style]}
      onLayout={(e) => setMeasuredWidth(e.nativeEvent.layout.width)}
    >
      {measuredWidth > 0 && (
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}>
          <Svg width={measuredWidth} height={height}>
            <Defs>
              <LinearGradient id="shimmer" x1="0" y1="0.5" x2="1" y2="0.5">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
                <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.55" />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width={measuredWidth} height={height} fill="url(#shimmer)" />
          </Svg>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.border,
  },
});
