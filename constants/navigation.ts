/**
 * Shared navigation constants.
 *
 * Import screenTransitionOptions into every Stack layout so all route groups
 * get the same animation preset automatically.
 *
 * Import TAB_BAR_STYLE / TAB_ICON_SIZE / TAB_LABEL_SIZE into app/(tabs)/_layout.tsx
 * so future tab additions inherit the correct sizing without extra work.
 */

/** Stack screen animation preset — ~300 ms slide-from-right. */
export const screenTransitionOptions = {
  animation: 'slide_from_right',
  animationDuration: 300,
} as const;

/** Tab bar height / padding constants. */
export const TAB_BAR_HEIGHT = 72;
export const TAB_BAR_PADDING_BOTTOM = 10;

/** Tab icon / label sizing. */
export const TAB_ICON_SIZE = 24;
export const TAB_LABEL_SIZE = 12;
