'use client';

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';

/**
 * Brand-themed loading spinner. `fullscreen` centers it over the viewport (used by
 * route-level loading.tsx); otherwise it centers within its container.
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
        minHeight: fullscreen ? '100vh' : 240,
        width: '100%',
      }}
    >
      <Box sx={{ position: 'relative', display: 'inline-flex' }}>
        <CircularProgress size={64} thickness={4} sx={{ color: 'primary.main' }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon.png"
          alt=""
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            height: 30,
          }}
        />
      </Box>
      {label && (
        <Box sx={{ color: 'text.secondary', fontSize: 14 }}>{label}</Box>
      )}
    </Box>
  );
}
