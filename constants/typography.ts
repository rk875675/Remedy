import type { TextStyle } from 'react-native';
import { serifFont } from './colors';

/**
 * Typography scale — compose into StyleSheet entries via spread.
 *
 *   display — serif hero headings on emotional screens only
 *   title   — screen titles
 *   heading — section/card headings
 *   body    — paragraph copy (line-height ≥ 1.5×)
 *   label   — UPPERCASE overlines (always letterSpacing 1.2)
 *   metric  — numeric stats; tabular numerals so digits don't jitter
 */
export const type = {
  display: {
    fontSize: 32,
    fontFamily: serifFont,
    fontWeight: '700',
    letterSpacing: -0.3,
  } as TextStyle,
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.3,
  } as TextStyle,
  heading: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.2,
  } as TextStyle,
  question: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 34,
  } as TextStyle,
  body: {
    fontSize: 15,
    lineHeight: 23,
  } as TextStyle,
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  } as TextStyle,
  metric: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  } as TextStyle,
} as const;

/**
 * Motion constants — one vocabulary for durations so screens feel related.
 *   fast     — micro feedback (press states, toggles)
 *   standard — entrances, crossfades
 *   slow     — staged/emotional reveals
 */
export const motion = {
  fast: 160,
  standard: 250,
  slow: 350,
} as const;
