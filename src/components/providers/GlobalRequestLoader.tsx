'use client';

import { useEffect, useState } from 'react';
import { loadingBus } from '@/lib/api/loadingBus';
import { BrandLoader } from '@/components/ui/BrandLoader';

/**
 * Full-screen branded loader shown whenever a mutating request is in flight (login,
 * saves, revokes, and every other write). Sits at the app root so it also covers the
 * auth pages.
 */
export function GlobalRequestLoader() {
  const [active, setActive] = useState(false);
  useEffect(() => loadingBus.subscribe(setActive), []);
  return active ? <BrandLoader overlay /> : null;
}
