'use client';

import { loadingBus } from '@/lib/api/loadingBus';
import { handleUnauthorized } from '@/lib/api/unauthorized';

export interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  details?: unknown;
}

/**
 * Send JSON to an internal API route. Never throws — returns a typed result. Every call
 * (all mutating: POST/PATCH/DELETE) drives the global loading overlay via the loadingBus.
 */
async function send<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  loadingBus.begin();
  try {
    const res = await fetch(path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    // Same reasoning as the GET fetcher: a 401 means the session is gone, so send the user to
    // /login instead of letting the caller render "Unauthorized" in a snackbar and carry on.
    if (res.status === 401) handleUnauthorized();
    return (await res.json()) as ApiResult<T>;
  } catch {
    return { ok: false, error: 'Network error' };
  } finally {
    loadingBus.end();
  }
}

// Body is optional: action endpoints such as resend-invite / reactivate carry their whole
// input in the URL, and `send` already omits the Content-Type header when there is none.
export const apiPost = <T = unknown>(path: string, body?: unknown) => send<T>('POST', path, body);
export const apiPatch = <T = unknown>(path: string, body: unknown) => send<T>('PATCH', path, body);
export const apiDelete = <T = unknown>(path: string, body?: unknown) => send<T>('DELETE', path, body);
