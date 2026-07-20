import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Inter, Oswald } from 'next/font/google';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { theme } from '@/lib/theme';
import { ToastProvider } from '@/components/ToastProvider';
import { GlobalRequestLoader } from '@/components/providers/GlobalRequestLoader';
import { BRAND_RED } from '@/lib/colors';
import { env } from '@/lib/config/env';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const oswald = Oswald({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-oswald',
  display: 'swap',
});

const APP_NAME = 'Bridgette Portal';
const APP_TITLE = 'Bridgette Enterprises Management Portal';
const APP_DESCRIPTION =
  'Customer support portal and management system for Bridgette Enterprises LLC. Handles invoicing, payments, customers, and reporting.';
// Via env.appUrl rather than reading process.env again: a second copy of the localhost
// fallback here would quietly reinstate the behaviour env.appUrl exists to prevent.
const SITE_URL = env.appUrl;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: APP_NAME,
  title: {
    default: APP_TITLE,
    template: '%s · Bridgette Portal',
  },
  description: APP_DESCRIPTION,
  keywords: ['Bridgette Enterprises', 'invoicing', 'management system', 'customer support portal'],
  authors: [{ name: 'Bridgette Enterprises LLC' }],
  robots: { index: false, follow: false }, // internal tool — keep out of search engines
  openGraph: {
    type: 'website',
    siteName: APP_NAME,
    title: APP_TITLE,
    description: APP_DESCRIPTION,
    url: SITE_URL,
    images: [{ url: '/brand/logo.png', width: 1978, height: 1145, alt: 'Bridgette Enterprises' }],
  },
  twitter: {
    card: 'summary',
    title: APP_TITLE,
    description: APP_DESCRIPTION,
    images: ['/brand/logo.png'],
  },
};

export const viewport: Viewport = {
  themeColor: BRAND_RED,
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${oswald.variable}`}>
      {/* suppressHydrationWarning: browser extensions (e.g. Grammarly) inject
          attributes into <body> before React hydrates, causing a false mismatch. */}
      <body suppressHydrationWarning>
        <AppRouterCacheProvider>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <ToastProvider>{children}</ToastProvider>
            <GlobalRequestLoader />
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
