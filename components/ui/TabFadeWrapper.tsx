/**
 * TabFadeWrapper — wraps a tab screen's root view and plays a subtle
 * fade + slide-up animation each time the tab receives focus.
 *
 * Uses only React Native's built-in Animated API (no Reanimated required).
 *
 * Usage: wrap the outermost View/ScrollView in each tab screen.
 *   <TabFadeWrapper>
 *     <ScrollView ...>
 *   </TabFadeWrapper>
 */

import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

type TabFadeWrapperProps = {
  children: React.ReactNode;
};

export function TabFadeWrapper({ children }: TabFadeWrapperProps) {
  const isFocused = useIsFocused();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(6)).current;

  useEffect(() => {
    if (isFocused) {
      opacity.setValue(0);
      translateY.setValue(6);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isFocused]);

  return (
    <Animated.View
      style={{ flex: 1, opacity, transform: [{ translateY }] }}
    >
      {children}
    </Animated.View>
  );
}
