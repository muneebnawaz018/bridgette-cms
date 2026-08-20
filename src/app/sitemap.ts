import type { MetadataRoute } from 'next';
import { env } from '@/lib/config/env';

/**
 * The sitemap, which is one entry by design.
 *
 * Everything past the sign-in page is private, and a sitemap listing pages a crawler will only
 * ever be redirected away from is worse than no sitemap at all.
 *
 * `/` is deliberately absent even though it resolves to the same screen. The root layout marks
 * every page `noindex` and only `/login` opts back in, so submitting `/` asked Google to index
 * a URL that tells it not to — which Search Console reports as "Submitted URL marked
 * 'noindex'". One canonical, indexable URL is listed, and it is the one carrying the
 * description, the canonical tag and the organisation markup.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${env.appUrl}/login`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1,
    },
  ];
}
