/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // A second Next process (a production build check, a browser test) writes into the same
  // .next as a running `npm run dev` and breaks it — the dev server starts requiring chunks
  // that were replaced, or manifests that vanished. Point those runs at their own directory
  // instead: NEXT_DIST_DIR=.next-probe npx next dev -p 3997
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Hide Next's dev-only build-activity badge (the spinning "N" bottom-left). Our own
  // BrandLoader overlay already covers route transitions, so the badge is just noise.
  devIndicators: false,
  // Keep heavy/native-ish server deps out of the bundle — loaded at runtime instead.
  // Improves build speed and avoids bundling issues as the data layer grows.
  serverExternalPackages: ['mongoose', 'bcryptjs', 'pino', 'pino-pretty'],

  experimental: {
    /*
     * Rewrite `import { DataGrid } from '@mui/x-data-grid'` into the one deep path it actually
     * needs, so a route that touches the grid does not pull the whole package's module graph
     * through the compiler. Next already does this for @mui/material and @mui/icons-material by
     * default; the x-* packages are not on that list and are the heaviest things we import.
     */
    optimizePackageImports: ['@mui/x-data-grid', '@mui/x-date-pickers', 'notistack'],
  },

  /**
   * Baseline security headers.
   *
   * Deliberately no Content-Security-Policy yet. MUI's styling engine injects style tags at
   * runtime, so a useful CSP needs a per-request nonce threaded through emotion and the
   * document. That is worth doing, but it is a change that breaks the whole UI when it is
   * subtly wrong, so it belongs in its own pass rather than bundled in here. Everything
   * below is inert if you get it right and harmless if you do not.
   */
  async headers() {
    const securityHeaders = [
      // Clickjacking: nobody may frame this app. frame-ancestors is the modern spelling;
      // X-Frame-Options is kept for older browsers that ignore it.
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
      { key: 'X-Frame-Options', value: 'DENY' },
      // Stop browsers guessing a response is HTML/JS when we said it was not, which is how
      // an uploaded file turns into a script.
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      // Don't leak internal paths (invoice ids, reset links) to third-party sites.
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      // The app asks for none of these, so deny them outright.
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
      // Cross-origin isolation for our own resources.
      { key: 'X-DNS-Prefetch-Control', value: 'off' },
    ];

    /*
     * Keep every page out of search except the two public ones.
     *
     * The root layout already sets a noindex meta tag, but that only reaches responses Next
     * renders as HTML documents. Route Handlers (/api-docs) and any file response never see it,
     * so the header covers the rest.
     *
     * The negative lookahead spares `/` and `/login`, which are the sign-in page under two
     * URLs. They are public either way, they are all a crawler can reach, and the sign-in route
     * carries its own description, canonical and organisation markup. Everything past them
     * stays out: an invoice, a customer record and a one-time intake link do not belong in a
     * search result.
     *
     * Note there is deliberately no robots.txt with `Disallow: /`. Disallow stops a crawler
     * fetching the URL at all, so it never reads the noindex, and a URL linked from somewhere
     * else can then still be indexed, listing-only. Letting the crawler in and telling it
     * noindex is what actually keeps pages out.
     */
    const noIndex = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];

    // HSTS only in production: sending it from localhost pins http://localhost to https in
    // the browser and is a genuine nuisance to undo.
    if (process.env.NODE_ENV === 'production') {
      securityHeaders.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      });
    }

    return [
      { source: '/:path*', headers: securityHeaders },
      /*
       * Listed explicitly rather than as "everything but the sign-in page": a negative
       * lookahead in a header source is read differently by path-to-regexp than it looks, and
       * got this exactly backwards on the first attempt: noindex on the one public page and
       * nothing on the private ones. A list is longer and cannot be misread.
       */
      ...[
        '/dashboard',
        '/invoices',
        '/customers',
        '/users',
        '/settings',
        '/profile',
        '/terms',
        '/billing-terms',
        '/intake',
        '/print',
        '/api',
        '/api-docs',
      ].flatMap((base) => [
        { source: base, headers: noIndex },
        { source: `${base}/:path*`, headers: noIndex },
      ]),
      // Authenticated JSON must never sit in a shared or browser cache.
      {
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' }],
      },
    ];
  },
};

export default nextConfig;
