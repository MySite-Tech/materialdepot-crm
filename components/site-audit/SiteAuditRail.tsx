'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import SiteAuditRoleViewerView from '@/components/site-audit/SiteAuditRoleViewerView';
import SiteAuditJobsView from '@/components/site-audit/SiteAuditJobsView';
import SiteAuditPerfView from '@/components/site-audit/SiteAuditPerfView';
import SiteAuditAnalyticsView from '@/components/site-audit/SiteAuditAnalyticsView';

/* leaflet touches `window` at module-load time, so it must never be pulled
   into the server-rendered pass Next.js still does for client components. */
const SiteAuditLiveView = dynamic(() => import('@/components/site-audit/SiteAuditLiveView'), { ssr: false });

/* Sub-tab wrapper for the CRM's Site Audit tab. Role Viewer here is a
   role/person picker only — the original's iframe+localStorage impersonation
   trick only works same-origin, so it links out to the real Admin Console
   instead of embedding it. Store Booking isn't a tab here — it's the public
   /store-booking route (see app/store-booking/page.tsx), same as the
   original's public kiosk link. */

type View = 'roleviewer' | 'jobs' | 'perf' | 'analytics' | 'live';

const TABS: Array<{ view: View; label: string }> = [
  { view: 'roleviewer', label: 'Role Viewer' },
  { view: 'jobs', label: 'Job Overview' },
  { view: 'perf', label: 'Performance' },
  { view: 'analytics', label: 'Analytics' },
  { view: 'live', label: 'Live' },
];

export default function SiteAuditRail() {
  const [view, setView] = useState<View>('roleviewer');

  return (
    <div>
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 flex gap-0">
          {TABS.map((t) => (
            <button
              key={t.view}
              onClick={() => setView(t.view)}
              className={`px-5 py-3 text-[13px] font-semibold border-b-2 cursor-pointer bg-transparent ${
                view === t.view ? 'border-[#EAB308] text-gray-800' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-4 sm:p-6">
        {view === 'roleviewer' && <SiteAuditRoleViewerView />}
        {view === 'jobs' && <SiteAuditJobsView />}
        {view === 'perf' && <SiteAuditPerfView />}
        {view === 'analytics' && <SiteAuditAnalyticsView />}
        {view === 'live' && <SiteAuditLiveView />}
      </div>
    </div>
  );
}
