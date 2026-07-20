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

/** An amount with its currency code, e.g. "USD 1,234.50". */
export function formatMoney(currency: string | undefined, amount: number): string {
  return `${currency ?? ''} ${formatAmount(amount)}`.trim();
}
