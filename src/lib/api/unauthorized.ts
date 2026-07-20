'use client';

/**
 * Send the browser to /login after a 401 from an internal API route.
 *
 * Middleware already redirects page requests, but it verifies the access token's signature
 * and nothing else — it never touches the database. A token stays cryptographically valid
 * for its full TTL even after the account behind it is deleted, disabled, or demoted, so
 * the page renders and only the API call that follows discovers the session is dead. Left
 * unhandled that shows a broken screen full of errors instead of a login form.
 *
 * `window.location.assign` rather than the router: a hard navigation drops the SWR cache and
 * every piece of React state built from the old session, which a client-side push would keep.
 */

let redirecting = false;

export function handleUnauthorized(): void {
  if (typeof window === 'undefined') return;
  // Several requests commonly fail together on the same page; only the first should navigate.
  if (redirecting) return;

  const { pathname, search } = window.location;
  if (pathname === '/login') return;

  redirecting = true;
  const next = `${pathname}${search}`;
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}
