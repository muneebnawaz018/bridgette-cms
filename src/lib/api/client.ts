'use client';

import { loadingBus } from '@/lib/api/loadingBus';

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
    return (await res.json()) as ApiResult<T>;
  } catch {
    return { ok: false, error: 'Network error' };
  } finally {
    loadingBus.end();
  }
}

export const apiPost = <T = unknown>(path: string, body: unknown) => send<T>('POST', path, body);
export const apiPatch = <T = unknown>(path: string, body: unknown) => send<T>('PATCH', path, body);
export const apiDelete = <T = unknown>(path: string, body?: unknown) => send<T>('DELETE', path, body);
