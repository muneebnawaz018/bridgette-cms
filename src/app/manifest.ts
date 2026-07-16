import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Bridgette Enterprises Management Portal',
    short_name: 'Bridgette Portal',
    description: 'Customer support portal and management system for Bridgette Enterprises LLC.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ec222a',
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
