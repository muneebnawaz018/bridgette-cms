'use client';

import dynamic from 'next/dynamic';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';

/**
 * Calendar-only date picker (see DateCalendarInner), loaded on demand. Use it where the date is
 * already rendered by the surrounding design and only the picking needs a UI — DateField is the
 * one to reach for anywhere a labelled input is wanted.
 */
export interface DateCalendarFieldProps {
  /** `YYYY-MM-DD`, or '' for empty. */
  value: string;
  onChange: (value: string) => void;
  /** `YYYY-MM-DD` bounds, e.g. a due date that cannot precede its invoice date. */
  minDate?: string;
  maxDate?: string;
  disabled?: boolean;
}

export const DateCalendarField = dynamic(() => import('./DateCalendarInner'), {
  ssr: false,
  // Holds the popover at roughly the calendar's size so it does not resize once the chunk lands.
  loading: () => (
    <Box sx={{ display: 'grid', placeItems: 'center', width: 320, height: 336 }}>
      <CircularProgress size={22} />
    </Box>
  ),
});
