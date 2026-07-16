'use client';

import { useEffect, useRef } from 'react';

export function useRetainedWhileClosing<T>(value: T | undefined, active: boolean): T | undefined {
  const last = useRef<T | undefined>(undefined);

  useEffect(() => {
    if (value !== undefined) last.current = value;
  }, [value]);

  if (value !== undefined) return value;
  return active ? undefined : last.current;
}
