/**
 * TabBarIcon — renders an Ionicons glyph, switching between outline (inactive)
 * and filled (active) based on the `focused` prop from React Navigation's
 * tabBarIcon callback. Plays a small spring scale when the tab becomes active
 * so switching tabs feels physically responsive.
 *
 * Usage in app/(tabs)/_layout.tsx:
 *   tabBarIcon: ({ focused, color }) => (
 *     <TabBarIcon focused={focused} color={color} outlineName="home-outline" filledName="home" />
 *   )
 *
 * Any new tab only needs to supply outlineName / filledName — no inline icon
 * logic required in _layout.tsx.
 */

import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { TAB_ICON_SIZE } from '../../constants/navigation';

type IoniconsName = ComponentProps<typeof Ionicons>['name'];

type TabBarIconProps = {
  focused: boolean;
  color: string;
  outlineName: IoniconsName;
  filledName: IoniconsName;
  /** Override size — defaults to TAB_ICON_SIZE */
  size?: number;
};

export function TabBarIcon({ focused, color, outlineName, filledName, size }: TabBarIconProps) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (focused) {
      scale.setValue(0.88);
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 24,
        bounciness: 9,
      }).start();
    }
  }, [focused]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Ionicons
        name={focused ? filledName : outlineName}
        size={size ?? TAB_ICON_SIZE}
        color={color}
      />
    </Animated.View>
  );
}
