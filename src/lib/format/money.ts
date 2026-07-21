/**
 * Money formatting, in one place.
 *
 * The same `${currency} ${n.toFixed(2)}` expression had been rewritten in the invoice list,
 * the new-invoice form and the export modal, which is how "1234.00" and "1,234.00" end up
 * side by side in the same product. Grouping separators come from Intl so long amounts stay
 * readable.
 */

/** Two decimals with thousands separators, e.g. 1234.5 -> "1,234.50". */
export function formatAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

/**
 * How each currency is shown before the amount. USD uses the "$" sign (no space); PKR keeps its
 * code, since the rupee sign reads poorly and "PKR" is unambiguous. Anything else falls back to
 * its code with a space.
 */
const CURRENCY_PREFIX: Record<string, string> = {
  USD: '$',
  PKR: 'PKR ',
};

/** An amount with its currency marker, e.g. "$1,234.50" or "PKR 1,234.50". Always two decimals. */
export function formatMoney(currency: string | undefined, amount: number): string {
  const prefix = currency ? (CURRENCY_PREFIX[currency] ?? `${currency} `) : '';
  return `${prefix}${formatAmount(amount)}`;
}
