'use client';

import { createTheme } from '@mui/material/styles';
import { colors } from '@/lib/colors';

/** Bridgette brand theme — red/black/white, sampled from the logo (see docs/BRANDING.md). */
export const theme = createTheme({
  palette: {
    primary: { main: colors.brand.red },
    secondary: { main: colors.brand.black },
    background: { default: colors.brand.white },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: 'var(--font-inter), Arial, sans-serif',
  },
});
