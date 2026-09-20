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

/**
 * Dismisses any currently presented Superwall paywall. Needed before opening an
 * RN Modal from a paywall custom action (e.g. `redeem_promo_code`): Superwall's
 * native view controller renders above the RN hierarchy, so the modal would
 * otherwise appear behind it.
 */
export async function dismissSuperwall(): Promise<void> {
  if (!hasSuperwallNative) return;
  try {
    const { useSuperwallStore } = require('expo-superwall') as typeof import('expo-superwall');
    await useSuperwallStore.getState().dismiss();
  } catch {
    // Best-effort: worst case the modal opens behind the paywall.
  }
}

/**
 * Superwall skips `onboarding_paywall` when it still thinks the user is entitled
 * (leftover sandbox receipt, cancelled-but-cached status). Continue is an
 * explicit checkout CTA — force inactive so the next register can present.
 */
export async function setSuperwallSubscriptionInactive(): Promise<void> {
  if (!hasSuperwallNative) return;
  try {
    const { useSuperwallStore } = require('expo-superwall') as typeof import('expo-superwall');
    await useSuperwallStore.getState().setSubscriptionStatus({ status: 'INACTIVE' });
  } catch {
    // Best-effort: registerPlacement still runs.
  }
}
