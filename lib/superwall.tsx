import React from 'react';
import { requireOptionalNativeModule } from 'expo';
import { colors } from '../constants/colors';
import { View } from 'react-native';

let SuperwallProvider: React.ComponentType<{
  apiKeys: { ios?: string; android?: string };
  children: React.ReactNode;
}> | null = null;

let usePlacementHook: typeof import('expo-superwall').usePlacement | null = null;
let useUserHook: typeof import('expo-superwall').useUser | null = null;
let useSuperwallEventsHook: typeof import('expo-superwall').useSuperwallEvents | null = null;

// Definitive check: is the Superwall native module actually registered in THIS runtime?
// In Expo Go (and any build without the Superwall config plugin) it is not, so trying to
// present a paywall hangs the screen. requireOptionalNativeModule returns null instead of
// throwing, so this is reliable regardless of how the JS package resolves.
const hasSuperwallNative = !!requireOptionalNativeModule('SuperwallExpo');

if (hasSuperwallNative) {
  try {
    const sw = require('expo-superwall');
    SuperwallProvider = sw.SuperwallProvider;
    usePlacementHook = sw.usePlacement;
    useUserHook = sw.useUser;
    useSuperwallEventsHook = sw.useSuperwallEvents;
  } catch {
    // Native module unavailable
  }
}

export const SUPERWALL_AVAILABLE = hasSuperwallNative && SuperwallProvider !== null;

export function SuperwallWrapper({ children }: { children: React.ReactNode }) {
  if (!SuperwallProvider) {
    return <>{children}</>;
  }

  const apiKey = process.env.EXPO_PUBLIC_SUPERWALL_API_KEY;
  if (!apiKey) {
    return <>{children}</>;
  }

  return (
    <SuperwallProvider apiKeys={{ ios: apiKey }}>
      {children}
    </SuperwallProvider>
  );
}

export function usePlacement(
  ...args: Parameters<typeof import('expo-superwall').usePlacement>
) {
  if (!usePlacementHook) {
    return {
      registerPlacement: async () => {},
      state: { status: 'idle' as const },
    };
  }
  return usePlacementHook(...args);
}

export function useUser() {
  if (!useUserHook) {
    return {
      identify: async (
        _userId: string,
        _options?: { restorePaywallAssignments?: boolean },
      ) => {},
      signOut: () => {},
      update: async () => {},
      refresh: async () => ({}),
      user: null,
      subscriptionStatus: undefined,
    };
  }
  return useUserHook();
}

export function useSuperwallEvents(
  ...args: Parameters<typeof import('expo-superwall').useSuperwallEvents>
) {
  if (!useSuperwallEventsHook) {
    return;
  }
  useSuperwallEventsHook(...args);
}
