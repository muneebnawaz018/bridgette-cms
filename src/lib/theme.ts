'use client';

import { createTheme } from '@mui/material/styles';
import { colors } from '@/lib/colors';

const bodyFont = 'var(--font-inter), Roboto, Helvetica, Arial, sans-serif';
const displayFont = 'var(--font-oswald), "Arial Narrow", sans-serif';

/** Bridgette brand theme — red/black/white with a bold, athletic display type. */
export const theme = createTheme({
  palette: {
    primary: { main: colors.brand.red },
    secondary: { main: colors.brand.black },
    background: { default: '#f5f5f5' },
    text: { primary: colors.text.primary },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: bodyFont,
    // Headings use the condensed display font, uppercase for the sporty brand feel.
    h1: { fontFamily: displayFont, fontWeight: 700, textTransform: 'uppercase' },
    h2: { fontFamily: displayFont, fontWeight: 700, textTransform: 'uppercase' },
    h3: { fontFamily: displayFont, fontWeight: 700, textTransform: 'uppercase' },
    h4: { fontFamily: displayFont, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 },
    h5: { fontFamily: displayFont, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 },
    h6: { fontFamily: displayFont, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 },
    button: { fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 6 },
        containedPrimary: { boxShadow: 'none' },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        colorPrimary: { backgroundColor: colors.brand.black },
      },
    },
  },
});
