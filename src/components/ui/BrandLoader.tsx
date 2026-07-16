'use client';

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { displayFont } from '@/lib/theme';
import { colors, redA, shadowA, whiteA } from '@/lib/colors';

/**
 * The single app loader: a red progress ring around the E3 mark, with a soft pulsing halo.
 * Nothing else should spin — every "loading" state in the app renders this, sized to fit.
 *
 * - `overlay` pins it over the whole viewport with a translucent, blurred scrim and sits
 *   above everything — for route/page transitions so it's centered in the view, not in a
 *   div.
 * - `fullscreen` fills the viewport as a solid page (root loading.tsx, first paint).
 * - Otherwise it fills its parent, falling back to `minHeight` (default 60vh). Pass
 *   `minHeight={0}` inside a fixed-height container (e.g. a table) to just center there.
 * - `size` shrinks the mark for tight spots (an avatar overlay, a small card). The wordmark
 *   hides itself below 48px, or pass `label={null}` to drop it explicitly.
 */
export function BrandLoader({
  fullscreen = false,
  overlay = false,
  label,
  minHeight = '60vh',
  size = 78,
}: {
  fullscreen?: boolean;
  overlay?: boolean;
  /** `null` hides the wordmark — for compact/inline use. */
  label?: string | null;
  minHeight?: number | string;
  size?: number;
}) {
  const showLabel = label !== null && size >= 48;
  const markSize = size * 0.59;
  const iconSize = size * 0.385;

  const art = (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <Box sx={{ position: 'relative', width: size, height: size, display: 'grid', placeItems: 'center' }}>
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
        <CircularProgress size={size} thickness={2.6} sx={{ color: 'primary.main', position: 'absolute' }} />
        <Box
          data-loader-breathe
          sx={{
            width: markSize,
            height: markSize,
            borderRadius: 2.5,
            bgcolor: colors.brand.white,
            display: 'grid',
            placeItems: 'center',
            boxShadow: `0 4px 16px ${shadowA(0.16)}`,
            animation: 'loader-breathe 2.2s ease-in-out infinite',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/icon-512.png" alt="" style={{ width: iconSize, height: iconSize }} />
        </Box>
      </Box>
      {showLabel && (
        <Typography sx={{ fontFamily: displayFont, fontWeight: 600, letterSpacing: 3, color: 'text.secondary', fontSize: '0.9rem' }}>
          {label ?? 'BRIDGETTE'}
        </Typography>
      )}
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
