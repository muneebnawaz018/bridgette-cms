'use client';

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { displayFont } from '@/lib/theme';
import { colors, redA, shadowA, whiteA } from '@/lib/colors';

/**
 * The single app loader: a red progress ring around the E3 mark, with a soft pulsing halo.
 *
 * - `overlay` pins it over the whole viewport with a translucent, blurred scrim and sits
 *   above everything — for route/page transitions so it's centered in the view, not in a
 *   div.
 * - `fullscreen` fills the viewport as a solid page (root loading.tsx, first paint).
 * - Otherwise it fills its parent, falling back to `minHeight` (default 60vh). Pass
 *   `minHeight={0}` inside a fixed-height container (e.g. a table) to just center there.
 */
export function BrandLoader({
  fullscreen = false,
  overlay = false,
  label,
  minHeight = '60vh',
}: {
  fullscreen?: boolean;
  overlay?: boolean;
  label?: string;
  minHeight?: number | string;
}) {
  const art = (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <Box sx={{ position: 'relative', width: 78, height: 78, display: 'grid', placeItems: 'center' }}>
        {/* Pulsing red halo */}
        <Box
          data-loader-halo
          sx={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${redA(0.28)}, transparent 68%)`,
            animation: 'loader-halo 2.2s ease-in-out infinite',
          }}
        />
        <CircularProgress size={78} thickness={2.6} sx={{ color: 'primary.main', position: 'absolute' }} />
        <Box
          data-loader-breathe
          sx={{
            width: 46,
            height: 46,
            borderRadius: 2.5,
            bgcolor: colors.brand.white,
            display: 'grid',
            placeItems: 'center',
            boxShadow: `0 4px 16px ${shadowA(0.16)}`,
            animation: 'loader-breathe 2.2s ease-in-out infinite',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/icon-512.png" alt="" style={{ width: 30, height: 30 }} />
        </Box>
      </Box>
      <Typography sx={{ fontFamily: displayFont, fontWeight: 600, letterSpacing: 3, color: 'text.secondary', fontSize: '0.9rem' }}>
        {label ?? 'BRIDGETTE'}
      </Typography>
    </Box>
  );

  if (overlay) {
    return (
      <Box
        className="rise-in"
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: (t) => t.zIndex.modal + 1,
          display: 'grid',
          placeItems: 'center',
          bgcolor: whiteA(0.6),
          backdropFilter: 'blur(5px) saturate(120%)',
        }}
      >
        {art}
      </Box>
    );
  }

  return (
    <Box
      className="rise-in"
      sx={{
        display: 'grid',
        placeItems: 'center',
        width: '100%',
        height: '100%',
        minHeight: fullscreen ? '100dvh' : minHeight,
      }}
    >
      {art}
    </Box>
  );
}
