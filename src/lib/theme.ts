'use client';

import { createTheme, type Shadows } from '@mui/material/styles';
import KeyboardArrowDownRounded from '@mui/icons-material/KeyboardArrowDownRounded';
// Registers the MuiDataGrid slot on the theme's `components` map for type-checking.
import type {} from '@mui/x-data-grid/themeAugmentation';
import { colors, gradients, redA, shadowA } from '@/lib/colors';

/**
 * `wide` (1024px) is the point where a half-width card stops feeling cramped, so two-up
 * card grids switch to a single column below it. MUI ships no 1024 stop (md=900, lg=1200),
 * hence the custom one — declared here so `size={{ xs: 12, wide: 6 }}` type-checks.
 */
declare module '@mui/material/styles' {
  interface BreakpointOverrides {
    wide: true;
  }
}

const bodyFont =
  'var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
/** Condensed display font — reserved for the wordmark + large metric numerals only. */
export const displayFont = 'var(--font-oswald), "Arial Narrow", sans-serif';

/**
 * The app's single corner radius. Everything with a corner uses it, so nothing has to be
 * eyeballed against anything else. Two things deliberately opt out: the brand mark's squircle
 * (identity, not chrome) and anything meant to read as a pill (progress bars, the nav's active
 * indicator), where a fixed 10px would either exceed half the height or be invisible.
 */
export const RADIUS = 10;

/**
 * The height every medium-sized control lands on — buttons, the search bar, anything that sits
 * on a row beside them. Left to itself a button is padding + line-height (40.5px) and the search
 * bar was a hand-picked 48, so the two never agreed; pinning both here means they always do.
 */
export const CONTROL_HEIGHT = 40;

// Soft, diffuse elevation scale — replaces MUI's harsh default shadows so cards, menus,
// and dialogs feel light and modern instead of stamped-on.
const s = (a: string, b: string) => `${a}, ${b}`;
const softShadows = [
  'none',
  s(`0 1px 2px ${shadowA(0.06)}`, `0 1px 1px ${shadowA(0.04)}`),
  s(`0 2px 6px ${shadowA(0.06)}`, `0 1px 2px ${shadowA(0.04)}`),
  s(`0 4px 12px ${shadowA(0.07)}`, `0 2px 4px ${shadowA(0.04)}`),
  s(`0 8px 20px ${shadowA(0.08)}`, `0 2px 6px ${shadowA(0.05)}`),
  s(`0 12px 28px ${shadowA(0.1)}`, `0 4px 8px ${shadowA(0.05)}`),
  ...Array.from({ length: 19 }, () =>
    s(`0 18px 40px ${shadowA(0.12)}`, `0 6px 12px ${shadowA(0.06)}`),
  ),
] as Shadows;

/** Bridgette brand theme — refined red/black SaaS. Clean type, soft depth, crisp accents. */
export const theme = createTheme({
  breakpoints: {
    values: { xs: 0, sm: 600, md: 900, wide: 1024, lg: 1200, xl: 1536 },
  },
  palette: {
    primary: {
      main: colors.brand.red,
      dark: colors.brand.redDark,
      light: colors.brand.redSoft,
      contrastText: colors.brand.white,
    },
    secondary: { main: colors.brand.black },
    background: { default: colors.surface.canvas, paper: colors.surface.paper },
    text: { primary: colors.text.primary, secondary: colors.text.secondary },
    divider: colors.surface.border,
    success: { main: colors.status.success },
    warning: { main: colors.status.warning },
    info: { main: colors.status.info },
    error: { main: colors.status.error },
    grey: { 100: colors.surface.subtle, 200: colors.surface.border },
  },
  // One radius for the whole app: cards, grids, dialogs, buttons, inputs and menus all
  // share it, so `borderRadius: 1` in any sx means the same corner everywhere. The usual
  // outer-surface-rounder-than-inner-control nesting is deliberately given up for that.
  shape: { borderRadius: RADIUS },
  shadows: softShadows,
  typography: {
    fontFamily: bodyFont,
    // Modern, quiet hierarchy — sentence case, tight tracking. No shouty uppercase.
    h1: { fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.08 },
    h2: { fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.12 },
    h3: { fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.16 },
    h4: { fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 },
    h5: { fontWeight: 700, letterSpacing: '-0.015em', lineHeight: 1.25 },
    h6: { fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.3 },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 600, letterSpacing: 0 },
    body1: { lineHeight: 1.6 },
    body2: { lineHeight: 1.55 },
    button: { fontWeight: 600, textTransform: 'none', letterSpacing: 0 },
    overline: { fontWeight: 700, letterSpacing: '0.08em', fontSize: '0.68rem' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: colors.surface.canvas },
        '::selection': { background: redA(0.16) },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: `1px solid ${colors.surface.border}`,
          borderRadius: RADIUS,
        },
        elevation0: { boxShadow: softShadows[2] },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { borderRadius: RADIUS, border: `1px solid ${colors.surface.border}` },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: RADIUS,
          paddingInline: 18,
          paddingBlock: 8,
          // minHeight, not height, so a wrapped label still grows. lineHeight is pulled in from
          // MUI's 1.75 so the natural box (37px) stays under the floor and minHeight decides.
          minHeight: CONTROL_HEIGHT,
          lineHeight: 1.5,
          // Named properties, not `all`: `all` also animates the flip to disabled, so the
          // button fades through a half-red state instead of just going grey.
          transition:
            'background-color .18s ease, box-shadow .18s ease, border-color .18s ease, color .18s ease',
          // Becoming disabled should snap — mid-fade the button still reads as clickable.
          '&.Mui-disabled': { transition: 'none' },
        },
        sizeLarge: { paddingBlock: 11, fontSize: '0.975rem' },
        // Same cascade problem as `outlined` below, at the large size (SessionScopeDialog stacks
        // a contained-large directly on an outlined-large).
        outlinedSizeLarge: { paddingBlock: 10 },
        contained: { boxShadow: softShadows[1] },
        containedPrimary: {
          // The brand gradient, so every primary CTA carries the identity instead of a flat red.
          backgroundImage: gradients.brand,
          boxShadow: `0 2px 8px ${redA(0.3)}`,
          '&:not(.Mui-disabled):hover': {
            backgroundImage: gradients.brand,
            filter: 'brightness(0.94)',
            boxShadow: `0 6px 18px ${redA(0.42)}`,
          },
          // MUI only greys the background-color when disabled; the gradient image would stay
          // painted over it and leave the button looking active-but-faded. Drop it so a disabled
          // primary reads as plainly disabled.
          '&.Mui-disabled': {
            backgroundImage: 'none',
            boxShadow: 'none',
          },
        },
        outlined: {
          // MUI's own `outlined` class carries padding: 5px 15px, and it sits after `root` in the
          // cascade, so root's 8/18 loses and an outlined button renders 6px shorter and 6px
          // narrower than the contained one beside it. Restate it here, one pixel off each side
          // to absorb the 1px border, so both variants come out the same size.
          paddingBlock: 7,
          paddingInline: 17,
          borderColor: colors.surface.borderStrong,
          color: colors.ink[700],
          '&:not(.Mui-disabled):hover': {
            borderColor: colors.ink[400],
            backgroundColor: colors.surface.subtle,
          },
        },
        text: { '&:not(.Mui-disabled):hover': { backgroundColor: colors.surface.subtle } },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: RADIUS },
        sizeSmall: { fontSize: '0.72rem', height: 22 },
        outlined: { borderColor: colors.surface.borderStrong },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'inherit' },
      styleOverrides: {
        root: {
          backgroundColor: colors.glass,
          backdropFilter: 'saturate(180%) blur(12px)',
          color: colors.ink[900],
          borderBottom: `1px solid ${colors.surface.border}`,
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: RADIUS,
          backgroundColor: colors.surface.paper,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: colors.surface.borderStrong },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: colors.ink[400] },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderWidth: 1.5 },
        },
      },
    },
    MuiInputLabel: { styleOverrides: { root: { fontWeight: 500 } } },
    MuiSelect: {
      // Chevron instead of the default filled triangle; rotates on open
      // (MUI adds `.MuiSelect-iconOpen` → 180deg) with a smooth transition. Position is
      // left at MUI's per-variant default so it never overlaps the value or the border.
      defaultProps: { IconComponent: KeyboardArrowDownRounded },
      styleOverrides: {
        icon: { color: colors.ink[400], transition: 'transform .22s ease' },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: RADIUS,
          boxShadow: softShadows[4],
          border: `1px solid ${colors.surface.border}`,
        },
      },
    },
    MuiMenuItem: {
      // MUI's default is a 48px row at body1 (1rem), which next to a 40px control reads as a
      // much heavier list than the field that opened it. Same height and text size as the
      // trigger, so an open dropdown looks like a continuation of it.
      styleOverrides: {
        root: {
          minHeight: CONTROL_HEIGHT,
          fontSize: '0.9rem',
          paddingBlock: 6,
        },
      },
    },
    MuiPopover: { styleOverrides: { paper: { borderRadius: RADIUS, boxShadow: softShadows[4] } } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: RADIUS, boxShadow: softShadows[5] } } },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: colors.ink[900],
          borderRadius: RADIUS,
          fontWeight: 500,
          fontSize: '0.75rem',
          padding: '6px 10px',
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: { root: { borderRadius: RADIUS } },
    },
    MuiDivider: { styleOverrides: { root: { borderColor: colors.surface.border } } },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: colors.surface.border },
        head: {
          fontWeight: 700,
          color: colors.ink[500],
          fontSize: '0.75rem',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        },
      },
    },
    MuiDataGrid: {
      styleOverrides: {
        root: {
          border: 'none',
          borderRadius: RADIUS,
          overflow: 'hidden', // clip the grey header's square corners to the rounded grid (no white nub)
          backgroundColor: colors.surface.paper,
          '--DataGrid-rowBorderColor': colors.surface.border,
          fontSize: '0.875rem',
        },
        columnHeaders: { backgroundColor: colors.surface.subtle },
        // No square focus/hover outline on headers — it draws outside the box and pokes past
        // the grid's rounded top corners.
        columnHeader: { '&:focus, &:focus-within': { outline: 'none' } },
        columnHeaderTitle: {
          fontWeight: 700,
          color: colors.ink[500],
          fontSize: '0.72rem',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        },
        cell: { borderColor: colors.surface.border, outline: 'none !important' },
        row: { '&:hover': { backgroundColor: colors.surface.subtle } },
        footerContainer: { borderTop: `1px solid ${colors.surface.border}` },
        columnSeparator: { color: 'transparent' },
      },
    },
  },
});
