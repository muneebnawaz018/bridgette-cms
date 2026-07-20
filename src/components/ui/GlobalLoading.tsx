'use client';

import { useGlobalLoading } from '@/lib/api/useGlobalLoading';

/**
 * Renders nothing and holds the app-wide overlay open while it is mounted.
 *
 * For the places that need a loader as an element rather than as a hook: a Suspense
 * fallback, or a lazy component's `loading` option. Those spots used to render their own
 * overlay, which sat inside the page and so left the sidebar and top bar uncovered.
 */
export function GlobalLoading() {
  useGlobalLoading(true);
  return null;
}
