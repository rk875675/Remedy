/**
 * Shared navigation constants.
 *
 * Import screenTransitionOptions into every Stack layout so all route groups
 * get the same animation preset automatically.
 *
 * Import TAB_BAR_STYLE / TAB_ICON_SIZE / TAB_LABEL_SIZE into app/(tabs)/_layout.tsx
 * so future tab additions inherit the correct sizing without extra work.
 */

import { Easing } from 'react-native';

/**
 * Stack screen animation preset.
 *
 * Native platform default (UINavigationController on iOS) — do not set
 * animationDuration. A forced 300ms duration overrides native timing and
 * reads as a cheap linear slide. freezeOnBlur keeps the outgoing screen
 * from running JS while the new one is sliding in.
 */
export const screenTransitionOptions = {
  animation: 'default',
  animationTypeForReplace: 'push',
  freezeOnBlur: true,
} as const;

/**
 * Tab SWITCH animation only (Home ↔ Progress ↔ Profile).
 * Single crossfade — no translate, no extra wrapper fade. A Y-shift reads
 * as a page-load entrance; stacking two fades flickered.
 */
export const tabTransitionOptions = {
  animation: 'fade' as const,
  transitionSpec: {
    animation: 'timing' as const,
    config: {
      duration: 280,
      easing: Easing.out(Easing.cubic),
    },
  },
};

/**
 * Tab bar content height (icons + labels + top padding).
 * The home-indicator inset is added at runtime in app/(tabs)/_layout.tsx —
 * a fixed total height here would sit the icons in the home-indicator zone.
 */
export const TAB_BAR_HEIGHT = 58;
export const TAB_BAR_PADDING_TOP = 10;
/** Minimum bottom padding when there is no home-indicator inset. */
export const TAB_BAR_PADDING_BOTTOM = 10;

/** Tab icon / label sizing. */
export const TAB_ICON_SIZE = 26;
export const TAB_LABEL_SIZE = 12;
