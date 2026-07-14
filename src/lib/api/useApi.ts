'use client';

import useSWR, { type SWRConfiguration } from 'swr';

/** Fetcher for internal `{ ok, data }` endpoints — unwraps data or throws the error. */
async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? 'Request failed');
  return json.data as T;
}

/**
 * Cached GET hook (SWR): dedupes concurrent requests, caches results, and revalidates on
 * focus/reconnect. Pass `null` to skip the request. Returns `mutate` to revalidate after
 * writes.
 */
export function useApi<T>(key: string | null, config?: SWRConfiguration<T>) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<T>(key, fetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 5000,
    keepPreviousData: true,
    ...config,
  });
  return { data, error, isLoading, isValidating, mutate };
}
