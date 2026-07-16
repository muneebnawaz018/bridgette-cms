'use client';

import { createTheme, type Shadows } from '@mui/material/styles';
import KeyboardArrowDownRounded from '@mui/icons-material/KeyboardArrowDownRounded';
// Registers the MuiDataGrid slot on the theme's `components` map for type-checking.
import type {} from '@mui/x-data-grid/themeAugmentation';
import { colors, redA, shadowA } from '@/lib/colors';

const bodyFont = 'var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
/** Condensed display font — reserved for the wordmark + large metric numerals only. */
export const displayFont = 'var(--font-oswald), "Arial Narrow", sans-serif';

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
  ...Array.from({ length: 19 }, () => s(`0 18px 40px ${shadowA(0.12)}`, `0 6px 12px ${shadowA(0.06)}`)),
] as Shadows;

/** Bridgette brand theme — refined red/black SaaS. Clean type, soft depth, crisp accents. */
export const theme = createTheme({
  palette: {
    primary: { main: colors.brand.red, dark: colors.brand.redDark, light: colors.brand.redSoft, contrastText: colors.brand.white },
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
  shape: { borderRadius: 12 },
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
          borderRadius: 16,
        },
        elevation0: { boxShadow: softShadows[2] },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { borderRadius: 16, border: `1px solid ${colors.surface.border}` } },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 10, paddingInline: 18, paddingBlock: 8, transition: 'all .18s ease' },
        sizeLarge: { paddingBlock: 11, fontSize: '0.975rem' },
        contained: { boxShadow: softShadows[1] },
        containedPrimary: {
          boxShadow: `0 2px 8px ${redA(0.3)}`,
          '&:hover': { backgroundColor: colors.brand.redDark, boxShadow: `0 4px 14px ${redA(0.38)}` },
        },
        outlined: {
          borderColor: colors.surface.borderStrong,
          color: colors.ink[700],
          '&:hover': { borderColor: colors.ink[400], backgroundColor: colors.surface.subtle },
        },
        text: { '&:hover': { backgroundColor: colors.surface.subtle } },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: 8 },
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
          borderRadius: 10,
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
        paper: { borderRadius: 14, boxShadow: softShadows[4], border: `1px solid ${colors.surface.border}` },
      },
    },
    MuiPopover: { styleOverrides: { paper: { borderRadius: 14, boxShadow: softShadows[4] } } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 20, boxShadow: softShadows[5] } } },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { backgroundColor: colors.ink[900], borderRadius: 8, fontWeight: 500, fontSize: '0.75rem', padding: '6px 10px' },
      },
    },
    MuiListItemButton: {
      styleOverrides: { root: { borderRadius: 10 } },
    },
    MuiDivider: { styleOverrides: { root: { borderColor: colors.surface.border } } },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: colors.surface.border },
        head: { fontWeight: 700, color: colors.ink[500], fontSize: '0.75rem', letterSpacing: '0.04em', textTransform: 'uppercase' },
      },
    },
    MuiDataGrid: {
      styleOverrides: {
        root: {
          border: 'none',
          borderRadius: 16,
          overflow: 'hidden', // clip the grey header's square corners to the rounded grid (no white nub)
          backgroundColor: colors.surface.paper,
          '--DataGrid-rowBorderColor': colors.surface.border,
          fontSize: '0.875rem',
        },
        columnHeaders: { backgroundColor: colors.surface.subtle },
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
