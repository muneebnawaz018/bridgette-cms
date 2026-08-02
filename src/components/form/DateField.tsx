'use client';

import dynamic from 'next/dynamic';
import TextField from '@mui/material/TextField';

/**
 * The app's one date input — a themed MUI DatePicker with a proper calendar popup, replacing
 * the browser-native `<input type="date">` (whose calendar cannot be styled and looked out of
 * place). Values go in and out as plain `YYYY-MM-DD` strings so the surrounding forms keep the
 * same shape they had with the native input; display is DD/MM/YYYY.
 *
 * The picker is loaded on demand (see DatePickerInner). @mui/x-date-pickers + dayjs is one of
 * the heaviest imports in the app and only two places use it — the invoice list's date-range
 * filter and the export modal — both behind a click. Splitting it keeps the package out of
 * every other route's compile and bundle.
 */

export interface DateFieldProps {
  label: string;
  /** `YYYY-MM-DD`, or '' for empty. */
  value: string;
  onChange: (value: string) => void;
  size?: 'small' | 'medium';
  disabled?: boolean;
  /** Shows the value but blocks editing (calendar and typing), without the greyed disabled look. */
  readOnly?: boolean;
  error?: boolean;
  helperText?: string;
  fullWidth?: boolean;
  clearable?: boolean;
  /** `YYYY-MM-DD` bounds, e.g. to cross-bind a start/end range. */
  minDate?: string;
  maxDate?: string;
}

export const DateField = dynamic(() => import('./DatePickerInner'), {
  // Client-only anyway — server-rendering it just to swap it out costs a hydration pass.
  ssr: false,
  // A same-sized disabled box, so the row does not jump when the chunk lands.
  loading: () => <TextField size="small" fullWidth disabled />,
});
