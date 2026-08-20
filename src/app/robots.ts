import type { MetadataRoute } from 'next';
import { env } from '@/lib/config/env';

/**
 * robots.txt.
 *
 * Without this file the request falls through to the app's catch-all page, so `/robots.txt`
 * answered with HTML: a 200 that no crawler can parse, and which Lighthouse reports as an
 * invalid robots.txt.
 *
 * Deliberately no blanket `Disallow: /`. Disallow stops a crawler fetching a URL at all, so it
 * never reads the `noindex` we send with it, and a URL linked from anywhere else can still be
 * listed from that link alone. Letting the crawler in and telling it `noindex` is what actually
 * keeps a page out. The private areas are listed all the same, since a crawler that respects
 * Disallow will not waste requests on pages that answer with a login redirect.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/login'],
        disallow: [
          '/api/',
          '/api-docs',
          '/dashboard',
          '/invoices',
          '/customers',
          '/users',
          '/settings',
          '/profile',
          '/terms',
          '/billing-terms',
          // One-time customer links and the printable invoice view. Neither is guessable, and
          // neither belongs in an index.
          '/intake/',
          '/print/',
        ],
      },
    ],
    sitemap: `${env.appUrl}/sitemap.xml`,
    host: env.appUrl,
  };
}
