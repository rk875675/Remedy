import React from 'react';
import { colors } from '../constants/colors';
import { View } from 'react-native';

let SuperwallProvider: React.ComponentType<{
  apiKeys: { ios?: string; android?: string };
  children: React.ReactNode;
}> | null = null;

let usePlacementHook: typeof import('expo-superwall').usePlacement | null = null;
let useUserHook: typeof import('expo-superwall').useUser | null = null;

try {
  const sw = require('expo-superwall');
  SuperwallProvider = sw.SuperwallProvider;
  usePlacementHook = sw.usePlacement;
  useUserHook = sw.useUser;
} catch {
  // Native module unavailable (Expo Go)
}

export const SUPERWALL_AVAILABLE = SuperwallProvider !== null;

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
      identify: async (_userId: string) => {},
      signOut: () => {},
      update: async () => {},
      refresh: async () => ({}),
      user: null,
      subscriptionStatus: undefined,
    };
  }
  return useUserHook();
}
