/**
 * Reminder presets, in minutes.
 *
 * One list, used by the picker on the invoice form and by whatever displays a stored value
 * back. Kept together because the alternative is a second hard-coded mapping somewhere that
 * says "4320" means three days, which stops being true the first time someone edits one of
 * the two lists and not the other.
 *
 * Minutes is the stored unit throughout: every hour and day is a whole number of them, so the
 * short intervals need no fractions. See invoice.model.ts.
 */

export interface ReminderPreset {
  minutes: number;
  label: string;
}

export const REMINDER_PRESETS: readonly ReminderPreset[] = [
  { minutes: 5, label: '5 minutes' },
  { minutes: 15, label: '15 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 360, label: '6 hours' },
  { minutes: 1440, label: '1 day' },
  { minutes: 4320, label: '3 days' },
  { minutes: 10080, label: '1 week' },
];

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/**
 * 4320 → "3 days". A raw minute count is unreadable past an hour or so, and the API accepts
 * any positive integer, so values outside the preset list still have to render sensibly.
 */
export function reminderLabel(minutes: number | null | undefined): string {
  if (minutes == null) return 'No reminder';

  const preset = REMINDER_PRESETS.find((p) => p.minutes === minutes);
  if (preset) return preset.label;

  if (minutes % 1440 === 0) return plural(minutes / 1440, 'day');
  if (minutes % 60 === 0) return plural(minutes / 60, 'hour');
  return plural(minutes, 'minute');
}
