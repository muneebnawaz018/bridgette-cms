import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { COMPANY_CONTACT_US } from '@/modules/legal/company';
import { env } from '@/lib/config/env';

/**
 * Metadata for the one page of this app a search engine may see.
 *
 * Everything behind the sign-in is `noindex` and stays that way: an invoice, a customer record
 * and a one-time intake link have no business in a search result. The sign-in page itself is
 * public whether or not it is indexed, and it is the only URL anyone could usefully find, so it
 * carries the description, the canonical and the organisation markup instead of inheriting the
 * root layout's blanket "keep out".
 *
 * The canonical drops the `?next=` parameter the middleware adds when it bounces someone to
 * sign in. Without it every protected URL somebody shares becomes a separate near-duplicate of
 * this one page.
 */

const TITLE = 'Sign in';
const DESCRIPTION =
  'Sign in to the Bridgette Enterprises management portal to raise invoices, record payments, and manage customers, products and shipping.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/login' },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  // Next merges metadata shallowly, so this block replaces the root layout's `openGraph`
  // rather than extending it: anything the root sets and this omits is simply dropped from
  // this route. `siteName` and `locale` are repeated here for that reason. The preview image
  // is not — it comes from the `opengraph-image` file convention, which is applied per
  // segment and survives the merge.
  openGraph: {
    type: 'website',
    url: `${env.appUrl}/login`,
    title: `${TITLE} · Bridgette Portal`,
    description: DESCRIPTION,
    siteName: 'Bridgette Portal',
    locale: 'en_US',
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

/**
 * Who the portal belongs to, in the form a search engine reads. Rendered as a plain script tag
 * rather than through a component so nothing has to hydrate for it to exist.
 */
const ORGANISATION = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Bridgette Enterprises LLC',
  url: env.appUrl,
  logo: `${env.appUrl}/brand/logo.png`,
  email: COMPANY_CONTACT_US.email,
  telephone: COMPANY_CONTACT_US.phone,
  address: {
    '@type': 'PostalAddress',
    streetAddress: COMPANY_CONTACT_US.addressLines[0],
    addressLocality: 'Chino',
    addressRegion: 'CA',
    postalCode: '91710',
    addressCountry: 'US',
  },
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        // The value is a literal object defined above, never user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANISATION) }}
      />
      {children}
    </>
  );
}
