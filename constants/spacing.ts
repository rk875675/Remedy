/**
 * Spacing scale — use these tokens instead of hardcoded padding/margin.
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/**
 * Border radius scale.
 *   card   — surface cards
 *   button — primary/secondary buttons
 *   chip   — small chips, badges, tags
 *   circle — icon circles, avatars (fully round)
 */
export const radius = {
  card: 20,
  button: 14,
  chip: 10,
  circle: 999,
} as const;
