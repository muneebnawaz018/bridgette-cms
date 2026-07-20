'use client';

import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

/**
 * The title / subtitle / actions bar every list page opens with.
 *
 * The invoice and user pages had grown their own copies of this block, comments and all, and
 * had already started to disagree about button widths on phones. One copy keeps them honest.
 *
 * Layout: below 768px the sidebar is a drawer, so the title centres and the actions go full
 * width. From 768px up it becomes title-left / actions-right.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1.5,
        mb: 2.5,
        '@media (min-width:768px)': { flexDirection: 'row', alignItems: 'flex-start' },
      }}
    >
      <Box
        sx={{
          flexGrow: 1,
          minWidth: 0,
          textAlign: 'center',
          '@media (min-width:768px)': { textAlign: 'left' },
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography color="text.secondary" variant="subtitle2" sx={{ mt: 0.25 }}>
            {subtitle}
          </Typography>
        )}
      </Box>

      {actions && (
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            gap: 1.5,
            flexShrink: 0,
            width: { xs: '100%', sm: 'auto' },
            alignSelf: { xs: 'stretch', sm: 'flex-end' },
            '@media (min-width:768px)': { alignSelf: 'flex-start' },
            // Phones stack the buttons full width; from sm up they sit side by side.
            '& > *': { flexShrink: 0, width: { xs: '100%', sm: 'auto' } },
          }}
        >
          {actions}
        </Box>
      )}
    </Box>
  );
}
