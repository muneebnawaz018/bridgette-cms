'use client';

import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import LockRounded from '@mui/icons-material/LockRounded';

/**
 * Shown in place of a page or panel the signed-in user may not see.
 *
 * Previously the user page rendered a centred card for this and the new-invoice page rendered
 * a red error alert, so the same situation looked like two different problems. A missing
 * permission is not an error the user caused, so it reads as a calm statement rather than a
 * failure.
 */
export function NoAccess({
  title = 'No access',
  message,
}: {
  title?: string;
  message: string;
}) {
  return (
    <Box className="rise-in">
      <Paper sx={{ p: { xs: 4, md: 6 }, textAlign: 'center' }}>
        <Box
          sx={{
            display: 'grid',
            placeItems: 'center',
            width: 48,
            height: 48,
            mx: 'auto',
            mb: 1.5,
            borderRadius: 2,
            color: 'text.secondary',
            bgcolor: 'action.hover',
          }}
        >
          <LockRounded />
        </Box>
        <Typography variant="h6" gutterBottom>
          {title}
        </Typography>
        <Typography color="text.secondary">{message}</Typography>
      </Paper>
    </Box>
  );
}
