'use client';

import dayjs, { type Dayjs } from 'dayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import type { DateFieldProps } from './DateField';

/**
 * The actual MUI DatePicker, kept in its own module so DateField can pull it in with
 * next/dynamic. @mui/x-date-pickers + dayjs is one of the heaviest things the app imports, and
 * only two places use it (the invoice list's date-range filter and the export modal) — both
 * behind a click. Isolating it here keeps it out of every other route's compile and bundle.
 *
 * LocalizationProvider lives here rather than in a root provider for the same reason: hoisting
 * it would drag the package back into every page. It is only context, so one per field costs
 * nothing.
 */
export default function DatePickerInner({
  label,
  value,
  onChange,
  size = 'small',
  disabled,
  readOnly,
  error,
  helperText,
  fullWidth = true,
  clearable = true,
  minDate,
  maxDate,
}: DateFieldProps) {
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <DatePicker
        label={label}
        value={value ? dayjs(value) : null}
        onChange={(d: Dayjs | null) => onChange(d && d.isValid() ? d.format('YYYY-MM-DD') : '')}
        disabled={disabled}
        readOnly={readOnly}
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
          // A read-only field has nothing to clear; hide the clear affordance too.
          field: { clearable: clearable && !readOnly },
        }}
      />
    </LocalizationProvider>
  );
}
