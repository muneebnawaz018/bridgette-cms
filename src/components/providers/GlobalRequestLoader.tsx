'use client';

import { useEffect, useState } from 'react';
import { loadingBus } from '@/lib/api/loadingBus';
import { BrandLoader } from '@/components/ui/BrandLoader';

/**
 * Full-screen branded loader shown whenever a mutating request is in flight (login,
 * saves, revokes, and every other write). Sits at the app root so it also covers the
 * auth pages. It waits ~300ms before appearing so fast requests never flash the overlay —
 * only genuinely slow ones show it.
 */
const SHOW_DELAY_MS = 300;

export function GlobalRequestLoader() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = loadingBus.subscribe((active) => {
      if (active) {
        timer = setTimeout(() => setShow(true), SHOW_DELAY_MS);
      } else {
        if (timer) clearTimeout(timer);
        setShow(false);
      }
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  return show ? <BrandLoader overlay /> : null;
}
