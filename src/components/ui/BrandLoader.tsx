'use client';

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { displayFont } from '@/lib/theme';
import { colors, shadowA } from '@/lib/colors';

/**
 * Brand-themed loading indicator — a red progress ring around the E3 mark. `fullscreen`
 * centers it over the viewport (route-level loading.tsx); otherwise within its container.
 */
export function BrandLoader({ fullscreen = false, label }: { fullscreen?: boolean; label?: string }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        minHeight: fullscreen ? '100dvh' : 240,
        width: '100%',
      }}
    >
      <Box sx={{ position: 'relative', width: 66, height: 66, display: 'grid', placeItems: 'center' }}>
        <CircularProgress size={66} thickness={3} sx={{ color: 'primary.main', position: 'absolute' }} />
        <Box
          sx={{
            width: 42,
            height: 42,
            borderRadius: 2.5,
            bgcolor: colors.brand.white,
            display: 'grid',
            placeItems: 'center',
            boxShadow: `0 2px 10px ${shadowA(0.12)}`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/icon-512.png" alt="" style={{ width: 28, height: 28 }} />
        </Box>
      </Box>
      <Typography sx={{ fontFamily: displayFont, fontWeight: 600, letterSpacing: 3, color: 'text.secondary', fontSize: '0.9rem' }}>
        {label ?? 'BRIDGETTE'}
      </Typography>
    </Box>
  );
}
