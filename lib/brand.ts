import meta from '../assets/brand/meta.json';

/** In-app logo — always loaded from the single brand source file. */
export const BRAND_LOGO = require('../assets/brand/logo.png');

export const brand = {
  backgroundColor: meta.backgroundColor,
  /** Approximate iOS home-screen squircle corner radius for in-app display. */
  logoCornerRadiusRatio: 0.2237,
  logoSizes: {
    sm: 88,
    md: 112,
    lg: 128,
  },
} as const;

export type BrandLogoSize = keyof typeof brand.logoSizes;
