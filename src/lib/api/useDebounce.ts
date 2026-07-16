'use client';

import { useEffect, useState } from 'react';

/** Debounce a fast-changing value (e.g. a search box) before using it as a fetch key. */
export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
