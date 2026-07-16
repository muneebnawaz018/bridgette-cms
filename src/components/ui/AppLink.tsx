'use client';

import NextLink, { useLinkStatus, type LinkProps } from 'next/link';
import { forwardRef, useEffect, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { loadingBus } from '@/lib/api/loadingBus';

/**
 * Drop-in replacement for `next/link` that reports route transitions to the global loading
 * bus, so the one branded overlay covers them.
 *
 * Why this exists: clicking a link does nothing on screen until the router has the target
 * route's RSC payload and JS chunk. A prefetched route is instant, but on a slow connection
 * (or in dev, where chunks compile on demand and prefetch is off) that fetch can take
 * seconds with zero feedback — the click looks ignored. `loading.tsx` doesn't help: it only
 * renders once the router commits the navigation, which is the very thing we're waiting on.
 *
 * `useLinkStatus` gives us the pending window, and the bus's 300ms delay means an instant
 * navigation never flashes the overlay. Import this everywhere instead of `next/link`.
 */
function NavPendingBeacon() {
  const { pending } = useLinkStatus();

  useEffect(() => {
    if (!pending) return;
    loadingBus.begin();
    // Also covers the link unmounting mid-flight (its page is being replaced).
    return () => loadingBus.end();
  }, [pending]);

  return null;
}

type AppLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & { children?: ReactNode };

export const AppLink = forwardRef<HTMLAnchorElement, AppLinkProps>(function AppLink(
  { children, ...props },
  ref,
) {
  return (
    <NextLink {...props} ref={ref}>
      {children}
      {/* Renders nothing; must live inside the Link for useLinkStatus to see it. */}
      <NavPendingBeacon />
    </NextLink>
  );
});
