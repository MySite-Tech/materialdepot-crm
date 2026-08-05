'use client';

import { Suspense, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { sbGet } from '@/components/site-audit/siteAuditShared';
import SiteAuditorApp from '@/components/site-audit/SiteAuditorApp';
import SiteInstallerApp from '@/components/site-audit/SiteInstallerApp';
import SiteAuditJobsView from '@/components/site-audit/SiteAuditJobsView';
import SiteAuditPerfView from '@/components/site-audit/SiteAuditPerfView';
import SiteAuditAnalyticsView from '@/components/site-audit/SiteAuditAnalyticsView';
import SiteAuditInstallOpsView from '@/components/site-audit/SiteAuditInstallOpsView';

/* leaflet touches `window` at module-load time — see SiteAuditRail.tsx. */
const SiteAuditLiveView = dynamic(() => import('@/components/site-audit/SiteAuditLiveView'), { ssr: false });

/* Dashboard-only preview target for the Role Viewer's "open in new tab" links
   (see SiteAuditRoleViewerView.tsx). Deliberately outside the CRM's
   header/nav/tab shell (app/App.tsx) — this tab should show nothing but the
   person's own dashboard, the same way the real Auditor/Installer apps will
   look once they log in for real. Still requires an existing CRM session
   (checked via the same localStorage key App.tsx sets on login) since this
   surfaces real job/install data, unlike the public /store-booking kiosk. */

const ROLE_LABELS: Record<string, string> = {
  service_mgr: 'Service Manager',
  site_auditor: 'Site Auditor',
  installer: 'Site Installer',
  auditor_installer: 'Auditor + Installer',
};

type Person = { id: string; name: string; email: string; role: string };

function SiteAuditViewInner() {
  const searchParams = useSearchParams();
  const email = searchParams.get('person') || '';
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [loading, setLoading] = useState(true);
  const [combinedView, setCombinedView] = useState<'auditor' | 'installer'>('auditor');
  const [smTab, setSmTab] = useState<'audit' | 'install'>('audit');
  const [smAuditSubTab, setSmAuditSubTab] = useState<'jobs' | 'perf' | 'analytics' | 'live'>('jobs');

  useEffect(() => {
    try {
      setLoggedIn(!!localStorage.getItem('materialdepot_user'));
    } catch {
      setLoggedIn(false);
    }
  }, []);

  useEffect(() => {
    if (!email) { setLoading(false); return; }
    let alive = true;
    sbGet('profiles?email=eq.' + encodeURIComponent(email) + '&select=id,name,email,role&limit=1').then((rows) => {
      if (!alive) return;
      setPerson(Array.isArray(rows) && rows[0] ? rows[0] : null);
      setLoading(false);
    }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [email]);

  if (loggedIn === null || loading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">Loading…</div>;
  }
  if (!loggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Please <a href="/" className="text-[#EAB308] font-semibold underline">log in to the CRM</a> first.
      </div>
    );
  }
  if (!person) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">Person not found.</div>;
  }

  const actingAs = { id: person.id, name: person.name, email: person.email };

  return (
    <div className="min-h-screen bg-[#FAFAFA] p-4 sm:p-6">
      <div className="mb-4">
        <div className="text-base font-bold text-black">{person.name}</div>
        <div className="text-[12px] text-gray-400">{person.email} · {ROLE_LABELS[person.role] || person.role}</div>
      </div>

      {person.role === 'site_auditor' ? (
        <SiteAuditorApp actingAs={actingAs} />
      ) : person.role === 'installer' ? (
        <SiteInstallerApp actingAs={actingAs} />
      ) : person.role === 'auditor_installer' ? (
        <>
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setCombinedView('auditor')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold ${combinedView === 'auditor' ? 'bg-[#1A1A1A] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'}`}
            >
              Auditor view
            </button>
            <button
              onClick={() => setCombinedView('installer')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold ${combinedView === 'installer' ? 'bg-[#1A1A1A] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'}`}
            >
              Installer view
            </button>
          </div>
          {combinedView === 'auditor' ? <SiteAuditorApp actingAs={actingAs} /> : <SiteInstallerApp actingAs={actingAs} />}
        </>
      ) : person.role === 'service_mgr' ? (
        <>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setSmTab('audit')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold ${smTab === 'audit' ? 'bg-[#1A1A1A] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'}`}
            >
              Audit Dashboard
            </button>
            <button
              onClick={() => setSmTab('install')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold ${smTab === 'install' ? 'bg-[#1A1A1A] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'}`}
            >
              Install Dashboard
            </button>
          </div>
          {smTab === 'audit' && (
            <div className="flex gap-2 flex-wrap mb-3">
              {([
                ['jobs', 'Job Overview'],
                ['perf', 'Performance'],
                ['analytics', 'Analytics'],
                ['live', 'Live'],
              ] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setSmAuditSubTab(k)}
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold ${smAuditSubTab === k ? 'bg-[#EAB308] text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-400'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {smTab === 'install' ? (
            <SiteAuditInstallOpsView />
          ) : smAuditSubTab === 'jobs' ? (
            <SiteAuditJobsView />
          ) : smAuditSubTab === 'perf' ? (
            <SiteAuditPerfView />
          ) : smAuditSubTab === 'analytics' ? (
            <SiteAuditAnalyticsView />
          ) : (
            <SiteAuditLiveView />
          )}
        </>
      ) : (
        <div className="text-sm text-gray-400">No dashboard available for role &quot;{person.role}&quot;.</div>
      )}
    </div>
  );
}

export default function SiteAuditViewPage() {
  return (
    <Suspense>
      <SiteAuditViewInner />
    </Suspense>
  );
}
