/**
 * Core palette follows the armadillo: forest green (its world), shell brown,
 * and the light tan of its body.
 */
export const colors = {
  /** Light tan — a paler version of the pet's body colour */
  background: '#F6EDE0',

  /** Deep warm forest green — primary brand accent, CTAs, selection */
  primary: '#3E6B4E',
  /** Pressed / emphasis variant of primary */
  primaryDeep: '#2F5440',
  /** Soft green wash — selected fills, tinted backgrounds */
  primaryMuted: '#E7EFE9',

  /** Shell brown (sampled from the pet art) — warmth accent: celebration, highlights */
  secondary: '#AE5636',
  /** Soft brown wash */
  secondaryMuted: '#F3DFCF',

  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',

  textPrimary: '#1C1C1E',
  textSecondary: '#6B6B6B',
  /** Disabled / placeholder text and glyphs */
  textTertiary: '#B3A796',

  /** Standard hairline borders on cards and inputs */
  border: '#E5D8C6',
  /** Lighter divider lines inside cards */
  borderLight: '#EFE5D7',

  warning: '#E5A020',
};

/**
 * Serif used only for headings on emotional screens
 * (Welcome, Education, Session Complete, Program Complete) and the Home hero title.
 * Never for UI chrome.
 */
export const serifFont = 'Georgia';
