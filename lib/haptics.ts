/**
 * Shared haptic trigger helper.
 *
 * Import this module everywhere instead of calling expo-haptics directly so that
 * the project has one canonical place to audit / adjust haptic intensity.
 *
 * Trigger guide for new interactions:
 *   tabSwitch        — user presses a bottom tab
 *   selection        — option card, toggle, any multi-choice select (fires on
 *                      every tap, including deselect)
 *   primaryAction    — ContinueButton, "Start session", "Skip rest", any
 *                      forward-navigation advance
 *   success          — single-beat success (minor wins)
 *   sessionComplete  — two-beat finish: Medium impact → 80ms → success
 *   celebration      — three-beat program-complete sequence
 *   warning          — destructive confirm prompt AND the confirm tap itself
 *   error            — hard failure (network error, auth error)
 */

import * as Haptics from 'expo-haptics';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

/** Two-beat finish for session complete: impact lands, success settles. */
export async function hapticSessionComplete() {
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  await wait(80);
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

/** Three-beat celebration for program complete. */
export async function hapticCelebration() {
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  await wait(110);
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  await wait(110);
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export function hapticWarning() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
}

export function hapticError() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
}
