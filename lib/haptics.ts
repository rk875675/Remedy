/**
 * Shared haptic trigger helper.
 *
 * Import this module everywhere instead of calling expo-haptics directly so that
 * the project has one canonical place to audit / adjust haptic intensity.
 *
 * Trigger guide for new interactions:
 *   tabSwitch        — user presses a bottom tab
 *   selection        — option card, toggle, any multi-choice select
 *   primaryAction    — ContinueButton, "Start session", paywall purchase
 *   success          — session complete, onboarding done
 *   warning          — destructive confirm (sign out, reset), validation error
 *   error            — hard failure (network error, auth error)
 */

import * as Haptics from 'expo-haptics';

export function hapticTabSwitch() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function hapticSelection() {
  Haptics.selectionAsync();
}

export function hapticPrimaryAction() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

export function hapticSuccess() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export function hapticWarning() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
}

export function hapticError() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
}
