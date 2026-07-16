/**
 * App-wide date display: "12 July, 2026" — day first, month spelled out, no ambiguity
 * between the US and the rest-of-world reading of "7/12/2026".
 */
/** Bare calendar days, as <input type="date"> and the filter params emit them. */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function parse(value?: string | Date | null): Date | null {
  if (!value) return null;

  if (typeof value === 'string') {
    // new Date('2026-07-09') is UTC midnight, so getDate() returns the 8th anywhere behind
    // UTC. A bare day carries no timezone, so build it in local time and it renders as the
    // day the user actually picked. Full ISO timestamps keep their real instant.
    const parts = DATE_ONLY.exec(value);
    if (parts) return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
  }

  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "12 July, 2026" */
export function formatDate(value?: string | Date | null, fallback = '—'): string {
  const d = parse(value);
  if (!d) return fallback;
  return `${d.getDate()} ${d.toLocaleString('en-US', { month: 'long' })}, ${d.getFullYear()}`;
}

/**
 * "9 Jul" — compact label for filter buttons, where the full date is too wide. The year is
 * added only when it isn't the current one, so a normal range stays short but an old one is
 * never ambiguous.
 */
export function formatDateShort(value?: string | Date | null, fallback = '—'): string {
  const d = parse(value);
  if (!d) return fallback;
  const label = `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })}`;
  return d.getFullYear() === new Date().getFullYear() ? label : `${label} ${d.getFullYear()}`;
}

/** "July 2026" — for period labels (e.g. the dashboard pipeline). */
export function formatMonth(value?: string | Date | null, fallback = '—'): string {
  const d = parse(value);
  if (!d) return fallback;
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

/** "12 July, 2026, 11:55 AM" — for timestamps where the time of day matters. */
export function formatDateTime(value?: string | Date | null, fallback = '—'): string {
  const d = parse(value);
  if (!d) return fallback;
  const time = d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${formatDate(d)}, ${time}`;
}

/**
 * "2026-07-16" — the wire format for date filters and what <input type="date"> expects.
 * Built from the local calendar fields on purpose: toISOString() would shift the day for
 * anyone behind UTC, so "today" could render as yesterday.
 */
export function toDateInput(value: Date): string {
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

/** Today as YYYY-MM-DD. */
export function today(): string {
  return toDateInput(new Date());
}

/** `n` days before today as YYYY-MM-DD. Handles month/year rollover via the Date object. */
export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateInput(d);
}
