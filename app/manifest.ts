import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MaterialDepot CRM',
    short_name: 'MD CRM',
    description: 'Sales CRM, Site Audit and store booking for Material Depot',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#FAFAFA',
    theme_color: '#1F3A5F',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Store Booking', short_name: 'Booking', url: '/store-booking' },
      { name: 'Site Audit', short_name: 'Site Audit', url: '/?tab=siteAudit' },
    ],
  };
}
