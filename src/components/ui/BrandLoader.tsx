'use client';

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';

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
      <CircularProgress size={56} thickness={4} sx={{ color: 'primary.main' }} />
      <Typography
        variant="h6"
        sx={{ color: 'primary.main', letterSpacing: 2 }}
      >
        {label ?? 'Bridgette'}
      </Typography>
    </Box>
  );
}
