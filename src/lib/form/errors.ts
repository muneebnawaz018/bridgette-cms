import type { z } from 'zod';

/** One message per field — the shape form inputs render. */
export type FieldErrors = Record<string, string>;

/** Flatten a Zod error from client-side validation. */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const [field, messages] of Object.entries(error.flatten().fieldErrors)) {
    const first = (messages as string[] | undefined)?.[0];
    if (first) out[field] = first;
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
