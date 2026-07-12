/**
 * Money helpers. Amounts are handled as numbers in major units (e.g. dollars) and
 * always rounded to 2 dp to avoid floating drift. Stored as Decimal128 at the DB edge.
 */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function sum(values: number[]): number {
  return round2(values.reduce((a, b) => a + b, 0));
}

export function multiply(a: number, b: number): number {
  return round2(a * b);
}

/** Clamp to non-negative (balances never go below zero from rounding). */
export function nonNegative(n: number): number {
  return n < 0 ? 0 : round2(n);
}
