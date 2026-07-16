import type { MetadataRoute } from 'next';
import { BRAND_RED, BRAND_WHITE } from '@/lib/colors';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Bridgette Enterprises Management Portal',
    short_name: 'Bridgette Portal',
    description: 'Customer support portal and management system for Bridgette Enterprises LLC.',
    start_url: '/',
    display: 'standalone',
    background_color: BRAND_WHITE,
    theme_color: BRAND_RED,
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
