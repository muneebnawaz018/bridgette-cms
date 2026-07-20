'use client';

import { useEffect } from 'react';
import { loadingBus } from '@/lib/api/loadingBus';

/**
 * Hold the app-wide loading overlay open for as long as `active` is true.
 *
 * This is how anything that loads asks for a loader. Nothing should render its own
 * full-screen overlay: one mounted at the app root (GlobalRequestLoader) covers the sidebar
 * and top bar, while an overlay rendered inside a page cannot, because the page wrapper is a
 * containing block for fixed positioning. Two of them were showing at once.
 */
export function useGlobalLoading(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    loadingBus.begin();
    return () => loadingBus.end();
  }, [active]);
}
