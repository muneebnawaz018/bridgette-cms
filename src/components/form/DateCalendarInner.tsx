'use client';

import dayjs, { type Dayjs } from 'dayjs';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import type { DateCalendarFieldProps } from './DateCalendarField';

/**
 * A bare themed calendar, no text field around it — for places that already display the date
 * themselves and only need a picker on click. The invoice template is the case in point: its
 * DUE line is printed type, not a form control, so a boxed input would break the document it is
 * pretending to be.
 *
 * Same lazy split as DatePickerInner: @mui/x-date-pickers + dayjs is heavy, this is behind a
 * click, and LocalizationProvider stays inside the lazy chunk so hoisting it never drags the
 * package back into every route.
 */
export default function DateCalendarInner({
  value,
  onChange,
  minDate,
  maxDate,
  disabled,
}: DateCalendarFieldProps) {
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <DateCalendar
        value={value ? dayjs(value) : null}
        onChange={(d: Dayjs | null) => onChange(d && d.isValid() ? d.format('YYYY-MM-DD') : '')}
        minDate={minDate ? dayjs(minDate) : undefined}
        maxDate={maxDate ? dayjs(maxDate) : undefined}
        disabled={disabled}
      />
    </LocalizationProvider>
  );
}
