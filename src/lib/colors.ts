/**
 * Central color palette — single source of truth.
 *
 * Sampled from the Bridgette logo (see docs/BRANDING.md). Import from here everywhere
 * (MUI theme, viewport themeColor, components). Keep Tailwind's `brand.*` utilities and
 * the CSS variables in globals.css in sync with these values.
 *
 * Everything is authored as hex. The `hexToRgb` formula derives channels on demand, so
 * the `*A(alpha)` helpers take a hex and never a hand-written `rgb` string. Prefer those
 * helpers in components over raw `rgba(...)` so every tint/glow/overlay traces back here.
 */

// Base palette — the few colors reused throughout. Kept private; consume via `colors`.
const BASE = {
  red: '#ec222a',
  redDark: '#c11119',
  redSoft: '#ff5a5f',
  black: '#050707',
  white: '#ffffff',
  pureBlack: '#000000',
  ink: '#0c0e10', // dark rail base + neutral shadow ink
} as const;

/** Convert a hex color (`#rgb` or `#rrggbb`) to an `"r, g, b"` channel string. */
export function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const int = parseInt(full, 16);
  return `${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}`;
}

/** A hex color at a given alpha, as an `rgba(...)` string. */
export const withAlpha = (hex: string, a: number) => `rgba(${hexToRgb(hex)}, ${a})`;
/** Brand red at a given alpha — tints, active states, glows. */
export const redA = (a: number) => withAlpha(BASE.red, a);
/** White at a given alpha — text/borders/fills on dark surfaces. */
export const whiteA = (a: number) => withAlpha(BASE.white, a);
/** Pure black at a given alpha — scrims, vignettes. */
export const blackA = (a: number) => withAlpha(BASE.pureBlack, a);
/** Neutral shadow ink at a given alpha — elevation. */
export const shadowA = (a: number) => withAlpha(BASE.ink, a);

export const colors = {
  brand: {
    red: BASE.red,
    redDark: BASE.redDark,
    redSoft: BASE.redSoft,
    black: BASE.black,
    white: BASE.white,
    muted: '#ededed',
  },
  /** Frosted-glass surface (sticky header). */
  glass: whiteA(0.82),
  /** App chrome — the dark navigation rail and its states. */
  rail: {
    bg: BASE.ink,
    bgElevated: '#15181b',
    border: whiteA(0.08),
    text: whiteA(0.66),
    textActive: BASE.white,
    textDim: whiteA(0.45),
    label: whiteA(0.34),
    hover: whiteA(0.06),
    activeBg: redA(0.15),
    activeBgHover: redA(0.2),
  },
  /** Text/controls layered on dark or gradient surfaces (auth panel, quick actions). */
  onDark: {
    text: BASE.white,
    textDim: whiteA(0.6),
    border: whiteA(0.28),
    borderHover: whiteA(0.4),
    fill: whiteA(0.06),
    fillHover: whiteA(0.12),
  },
  /** Neutral surfaces + ink scale for the light content area. */
  surface: {
    canvas: '#f6f7f9',
    paper: BASE.white,
    subtle: '#f1f3f5',
    border: '#e7e9ee',
    borderStrong: '#d7dbe2',
  },
  ink: {
    900: '#0b0d0f',
    700: '#2c3138',
    500: '#5b636e',
    400: '#828b97',
    300: '#aab1bb',
  },
  text: {
    primary: '#0b0d0f',
    secondary: '#5b636e',
  },
  status: {
    success: '#12805c',
    successBg: '#e5f5ef',
    warning: '#b76e00',
    warningBg: '#fdf1e0',
    info: '#1f6fd6',
    infoBg: '#e8f1fd',
    error: '#d0342c',
    errorBg: '#fdecea',
    neutralBg: '#eef0f3',
  },
  border: '#e7e9ee',
} as const;

/** Reusable gradients (brand hero surfaces, accents). */
export const gradients = {
  brand: `linear-gradient(135deg, ${BASE.red} 0%, ${BASE.redDark} 55%, #7a0b10 100%)`,
  ink: `linear-gradient(150deg, #17191c 0%, ${BASE.black} 100%)`,
  authPanel: `linear-gradient(155deg, ${BASE.redDark} 0%, #8f0d13 42%, ${BASE.black} 100%)`,
} as const;

/** Primary brand color — used for MUI primary, themeColor, accents. */
export const BRAND_RED = colors.brand.red;
export const BRAND_WHITE = colors.brand.white;
