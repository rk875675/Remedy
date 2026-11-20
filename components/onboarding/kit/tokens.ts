import { Platform, type TextStyle } from 'react-native';
import { colors } from '../../../constants/colors';

/**
 * Design tokens for the onboarding kit. Every kit component and onboarding screen
 * reads sizes, colours and timings from here so the flow stays one system.
 */
export const ob = {
  color: {
    bg: colors.background,
    surface: colors.surface,
    ink: colors.textPrimary,
    inkSoft: colors.textSecondary,
    hint: '#9C8F7D',
    line: colors.border,
    lineSoft: colors.borderLight,
    accent: colors.primary,
    accentDeep: colors.primaryDeep,
    accentSoft: colors.primaryMuted,
    clay: colors.secondary,
    claySoft: colors.secondaryMuted,
    /** Icon tile and neutral chip fill */
    tile: '#F1E7D8',
    /** Source / citation card fill */
    source: '#EEF2EC',
    disabledBg: '#E6DCCD',
    disabledText: '#A89C8A',
    warn: colors.warning,
    warnSoft: '#FBF0D9',
    scrim: 'rgba(28,28,30,0.42)',
    /** Plan reveal page wash */
    mint: '#EAF2EC',
  },
  space: {
    /** Horizontal screen padding */
    screen: 24,
    /** Gap between option rows */
    row: 10,
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  radius: {
    row: 18,
    card: 24,
    pill: 28,
    tile: 12,
    bubble: 18,
    chip: 12,
    sheet: 32,
  },
  size: {
    button: 56,
    rowMin: 64,
    iconTile: 40,
    icon: 22,
    backButton: 40,
    check: 24,
    progressHeight: 6,
    progressGap: 6,
    /** Small pet beside the question bubble */
    petAsk: 60,
    /** Armadillo beside the question. Stage 1 only fills part of the box. */
    petQuestion: 108,
    /** Hero pet on chapter openers */
    petHero: 220,
  },
  motion: {
    fast: 160,
    base: 240,
    slow: 420,
    /** Delay between staggered siblings */
    stagger: 45,
    /** Pet bubble typing speed, must match PetSays */
    typeMs: 22,
    spring: { tension: 180, friction: 16 },
    pressScale: 0.98,
  },
} as const;

const heavy: TextStyle['fontWeight'] = Platform.OS === 'ios' ? '800' : '700';

export const obType = {
  /** Interstitial and plan headlines */
  display: { fontSize: 32, lineHeight: 38, fontWeight: heavy, letterSpacing: -0.6, color: ob.color.ink },
  title: { fontSize: 28, lineHeight: 34, fontWeight: heavy, letterSpacing: -0.4, color: ob.color.ink },
  /** Question text inside the pet bubble */
  question: { fontSize: 19, lineHeight: 26, fontWeight: '700', letterSpacing: -0.2, color: ob.color.ink },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.2, color: ob.color.ink },
  rowLabel: { fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.2, color: ob.color.ink },
  rowSub: { fontSize: 13, lineHeight: 18, fontWeight: '400', color: ob.color.inkSoft },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400', color: ob.color.inkSoft },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600', color: ob.color.ink },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500', color: ob.color.inkSoft },
  micro: { fontSize: 11, lineHeight: 15, fontWeight: '700', letterSpacing: 1.1, color: ob.color.hint },
  button: { fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: 0.1 },
  stat: { fontSize: 44, lineHeight: 48, fontWeight: heavy, letterSpacing: -1, color: ob.color.ink },
} satisfies Record<string, TextStyle>;

export type ObTone = 'accent' | 'clay' | 'neutral' | 'warn';

export function toneColors(tone: ObTone): { bg: string; fg: string; border: string } {
  switch (tone) {
    case 'accent':
      return { bg: ob.color.accentSoft, fg: ob.color.accentDeep, border: ob.color.accent };
    case 'clay':
      return { bg: ob.color.claySoft, fg: ob.color.clay, border: ob.color.clay };
    case 'warn':
      return { bg: ob.color.warnSoft, fg: '#8A5A00', border: ob.color.warn };
    case 'neutral':
      return { bg: ob.color.tile, fg: ob.color.ink, border: ob.color.line };
  }
}
