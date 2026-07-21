'use client';

import dayjs, { type Dayjs } from 'dayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';

/**
 * The app's one date input — a themed MUI DatePicker with a proper calendar popup, replacing
 * the browser-native `<input type="date">` (whose calendar cannot be styled and looked out of
 * place). Values go in and out as plain `YYYY-MM-DD` strings so the surrounding forms keep the
 * same shape they had with the native input; display is DD/MM/YYYY.
 */
export function DateField({
  label,
  value,
  onChange,
  size = 'small',
  disabled,
  error,
  helperText,
  fullWidth = true,
  clearable = true,
  minDate,
  maxDate,
}: {
  label: string;
  /** `YYYY-MM-DD`, or '' for empty. */
  value: string;
  onChange: (value: string) => void;
  size?: 'small' | 'medium';
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
  fullWidth?: boolean;
  clearable?: boolean;
  /** `YYYY-MM-DD` bounds, e.g. to cross-bind a start/end range. */
  minDate?: string;
  maxDate?: string;
}) {
  return (
    <DatePicker
      label={label}
      value={value ? dayjs(value) : null}
      onChange={(d: Dayjs | null) => onChange(d && d.isValid() ? d.format('YYYY-MM-DD') : '')}
      disabled={disabled}
      minDate={minDate ? dayjs(minDate) : undefined}
      maxDate={maxDate ? dayjs(maxDate) : undefined}
      format="DD/MM/YYYY"
      slotProps={{
        textField: {
          size,
          fullWidth,
          error,
          helperText,
          InputLabelProps: { shrink: true },
        },
        field: { clearable },
      }}
    />
  );
}
