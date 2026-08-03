/**
 * Page-size bounds for every list endpoint.
 *
 * Kept in their own module, free of any mongoose import: the list schemas that validate `limit`
 * live beside form schemas that client components import, and pulling paginate.ts in for a
 * number would drag the driver into the browser bundle.
 */

/** Used when a caller sends no `limit`. */
export const DEFAULT_LIMIT = 20;

/**
 * Hard ceiling on one page. paginate() clamps to this regardless, but the list schemas declare
 * it too, so an oversized `limit` is refused at the edge with a clear message instead of being
 * silently reinterpreted as something the caller never asked for.
 */
export const MAX_LIMIT = 100;
