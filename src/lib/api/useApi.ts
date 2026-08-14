'use client';

import useSWR, { type SWRConfiguration } from 'swr';
import { useGlobalLoading } from '@/lib/api/useGlobalLoading';
import { handleUnauthorized } from '@/lib/api/unauthorized';

/** Fetcher for internal `{ ok, data }` endpoints — unwraps data or throws the error. */
async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  // A dead session is not a data error — bounce to /login rather than surfacing "Unauthorized"
  // on a page the user can no longer load anything into.
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error('Unauthorized');
  }
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? 'Request failed');
  return json.data as T;
}

export interface UseApiConfig<T> extends SWRConfiguration<T> {
  /**
   * Whether a first load shows the app-wide overlay. Default true.
   *
   * Set false where the component already renders its own contained loader, such as inside
   * a modal or a card — otherwise both appear at once, which is the thing the single
   * overlay exists to avoid.
   */
  globalLoading?: boolean;
}

/**
 * Cached GET hook (SWR): dedupes concurrent requests, caches results, and revalidates on
 * focus/reconnect. Pass `null` to skip the request. Returns `mutate` to revalidate after
 * writes.
 *
 * A first load drives the app-wide overlay. Background revalidation deliberately does not,
 * so returning to the tab never flashes a loader over content that is already on screen.
 */
export function useApi<T>(key: string | null, config?: UseApiConfig<T>) {
  const { globalLoading = true, ...swrConfig } = config ?? {};

  const { data, error, isLoading, isValidating, mutate } = useSWR<T>(key, fetcher, {
    revalidateOnFocus: true,
    /*
     * How often regaining focus may trigger a refetch. SWR's default is 5s, which is far too
     * eager for this app: switching to DevTools, to a WhatsApp tab, or to any other window and
     * back is a focus event, so a minute of ordinary work refetched every list on screen a
     * dozen times over. None of this data changes second to second — it is edited by the handful
     * of people using the portal — so a minute between focus-driven refetches is plenty.
     */
    focusThrottleInterval: 60_000,
    dedupingInterval: 5000,
    keepPreviousData: true,
    ...swrConfig,
  });

  useGlobalLoading(globalLoading && isLoading);

  return { data, error, isLoading, isValidating, mutate };
}
