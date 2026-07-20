import type { z } from 'zod';

/** One message per field — the shape form inputs render. */
export type FieldErrors = Record<string, string>;

/**
 * Flatten a Zod error from client-side validation, keyed by the full path so nested fields
 * survive: a bad invoice line comes back as `items.0.description`, not just `items`. The
 * first message per path wins, which is the one worth showing under an input.
 */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.');
    if (key && !(key in out)) out[key] = issue.message;
  }
  return out;
}

export function serverFieldErrors(details: unknown): FieldErrors {
  const fieldErrors = (details as { fieldErrors?: Record<string, string[]> } | undefined)
    ?.fieldErrors;
  if (!fieldErrors) return {};
  const out: FieldErrors = {};
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (messages?.[0]) out[field] = messages[0];
  }
  return out;
}
