/**
 * Tab content wrapper. The navigator owns the Home ↔ Progress ↔ Profile
 * crossfade — a second fade here stacked on top and flickered.
 */

import React from 'react';
import { View } from 'react-native';

type TabFadeWrapperProps = {
  children: React.ReactNode;
};

export function TabFadeWrapper({ children }: TabFadeWrapperProps) {
  return <View style={{ flex: 1 }}>{children}</View>;
}
