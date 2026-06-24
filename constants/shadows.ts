import type { ViewStyle } from 'react-native';

/**
 * Three-level elevation system. Apply via spread: `...shadows.low`.
 * Do not invent ad-hoc shadow values elsewhere.
 */
export const shadows: Record<'low' | 'medium' | 'high', ViewStyle> = {
  low: {
    shadowColor: '#1C1C1E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  medium: {
    shadowColor: '#1C1C1E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  high: {
    shadowColor: '#1C1C1E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 6,
  },
};
