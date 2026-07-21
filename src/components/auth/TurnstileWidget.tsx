'use client';

import { useEffect, useRef } from 'react';
import Box from '@mui/material/Box';

/**
 * Cloudflare Turnstile challenge, rendered only once the server asks for one.
 *
 * A challenge on every sign-in taxes the people who type their password correctly, so this
 * stays out of the way until an account has failed repeatedly. With no
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY configured it renders nothing at all, which is how it
 * behaves in development.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const SCRIPT_ID = 'cf-turnstile-script';

export function turnstileConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

/** Load the script once per page, and resolve when it's ready. */
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();

  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve) => existing.addEventListener('load', () => resolve()));
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load the verification challenge'));
    document.head.appendChild(script);
  });
}

export function TurnstileWidget({ onToken }: { onToken: (token: string | null) => void }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  // The callback changes identity on every parent render; a ref keeps the effect from
  // tearing down and re-rendering the widget each time.
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey || !hostRef.current) return;

    let widgetId: string | undefined;
    let cancelled = false;

    void loadScript()
      .then(() => {
        if (cancelled || !hostRef.current || !window.turnstile) return;
        widgetId = window.turnstile.render(hostRef.current, {
          sitekey: siteKey,
          callback: (token: string) => onTokenRef.current(token),
          'error-callback': () => onTokenRef.current(null),
          'expired-callback': () => onTokenRef.current(null),
        });
      })
      .catch(() => onTokenRef.current(null));

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey]);

  if (!siteKey) return null;
  // Turnstile renders a fixed 300px iframe. The auth form column is ~272px at 320px, so the
  // widget overflowed the page horizontally whenever the challenge fired. overflowX:auto keeps
  // any residual width inside this box rather than scrolling the whole login page.
  return <Box ref={hostRef} sx={{ display: 'flex', justifyContent: 'center', overflowX: 'auto' }} />;
}
