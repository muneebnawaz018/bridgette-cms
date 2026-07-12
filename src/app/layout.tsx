import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { theme } from '@/lib/theme';
import { BRAND_RED } from '@/lib/colors';
import './globals.css';

const APP_NAME = 'Bridgette Portal';
const APP_TITLE = 'Bridgette Enterprises — Management Portal';
const APP_DESCRIPTION =
  'Customer support portal and management system for Bridgette Enterprises LLC — invoicing, payments, customers, and reporting.';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

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
    <html lang="en">
      {/* suppressHydrationWarning: browser extensions (e.g. Grammarly) inject
          attributes into <body> before React hydrates, causing a false mismatch. */}
      <body suppressHydrationWarning>
        <AppRouterCacheProvider>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            {children}
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
