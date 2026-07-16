'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '@/lib/pagination';

/**
 * Per-device user preferences (persisted to localStorage). Right now this is just the
 * table page size, chosen once in Settings and reused by every list in the app.
 */

const STORAGE_KEY = 'bp_prefs_v1';

interface Preferences {
  pageSize: number;
}

interface PreferencesContext extends Preferences {
  setPageSize: (n: number) => void;
}

const Ctx = createContext<PreferencesContext | null>(null);

function isValidPageSize(n: unknown): n is number {
  return typeof n === 'number' && (PAGE_SIZE_OPTIONS as readonly number[]).includes(n);
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [pageSize, setPageSizeState] = useState<number>(DEFAULT_PAGE_SIZE);

  // Hydrate from localStorage after mount (SSR has no window).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Preferences>;
      if (isValidPageSize(parsed.pageSize)) setPageSizeState(parsed.pageSize);
    } catch {
      /* ignore malformed storage */
    }
  }, []);

  const setPageSize = useCallback((n: number) => {
    if (!isValidPageSize(n)) return;
    setPageSizeState(n);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ pageSize: n }));
    } catch {
      /* storage may be unavailable (private mode) — keep the in-memory value */
    }
  }, []);

  return <Ctx.Provider value={{ pageSize, setPageSize }}>{children}</Ctx.Provider>;
}

export function usePreferences(): PreferencesContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePreferences must be used within a PreferencesProvider');
  return ctx;
}
