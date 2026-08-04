import type { Metadata } from 'next';
import SiteAuditStoreTeamView from '@/components/site-audit/SiteAuditStoreTeamView';

export const metadata: Metadata = {
  title: 'Store Booking — Material Depot',
};

/* Public, no-login route — mirrors the original Store_Team_App.html, which
   was a public kiosk link so store staff without CRM accounts could book
   slots on a tablet. Deliberately outside the CRM's auth/permission gate
   (see app/App.tsx); it renders the exact same component the CRM's own
   Site Audit > Store Booking tab uses. */
export default function StoreBookingPage() {
  return (
    <div className="min-h-screen bg-[#FAFAFA] p-4 sm:p-6">
      <SiteAuditStoreTeamView />
    </div>
  );
}
