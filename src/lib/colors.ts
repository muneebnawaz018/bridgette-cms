/**
 * Central color palette — single source of truth.
 *
 * Sampled from the Bridgette logo (see docs/BRANDING.md). Import from here everywhere
 * (MUI theme, viewport themeColor, components). Keep Tailwind's `brand.*` utilities and
 * the CSS variables in globals.css in sync with these values.
 */
export const colors = {
  brand: {
    red: '#ec222a',
    black: '#050707',
    white: '#ffffff',
    muted: '#ededed',
  },
  text: {
    primary: '#050707',
    secondary: '#4a4a4a',
  },
  border: '#e0e0e0',
} as const;

/** Primary brand color — used for MUI primary, themeColor, accents. */
export const BRAND_RED = colors.brand.red;
export const BRAND_BLACK = colors.brand.black;
export const BRAND_WHITE = colors.brand.white;
