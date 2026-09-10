import type { Metadata } from 'next';
import SiteAuditStoreTeamView from '@/components/site-audit/views/store-team/index';

export const metadata: Metadata = {
  title: 'Store Booking — Material Depot',
};

export default function StoreBookingPage() {
  return (
    <div className="min-h-screen bg-[#FAFAFA] p-4 sm:p-6">
      <SiteAuditStoreTeamView />
    </div>
  );
}
