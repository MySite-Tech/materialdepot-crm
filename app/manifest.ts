import type { MetadataRoute } from 'next';

/* Served by Next at /manifest.webmanifest. `display: standalone` is the point
   of the exercise: the store tablet running /store-booking and the auditors'
   and installers' phones get an installed icon and a full-screen app with no
   URL bar to mistype.

   `start_url` is the root rather than a tab: which view someone lands on is
   decided by their role (app/App.tsx), not by the launcher. The two icon
   `purpose`s are both required — Android masks an "any" icon into whatever
   shape the launcher uses, cropping a transparent logo badly, so `maskable`
   carries its own padded, solid-background version. */
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
