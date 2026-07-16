import 'server-only';

/**
 * A leading =, +, -, @ (or tab/CR) makes Excel and Sheets treat the cell as a formula, so a
 * customer named `=cmd|'/c calc'!A1` would execute on open. Prefixing with a single quote
 * neutralises it. Numbers are written unquoted and unprefixed, so a negative total stays a
 * number rather than turning into the text `'-40`.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Byte-order mark (U+FEFF). Without it Excel reads the file as ANSI and mangles accented
 * names. Built from its code point so it survives editors that strip invisible characters.
 */
const BOM = String.fromCharCode(0xfeff);

function cell(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';

  let s = String(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
  if (/["\n\r,]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** RFC 4180 CSV. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))];
  return `${BOM}${lines.join('\r\n')}\r\n`;
}
