'use client';

import { Suspense, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { CITIES, loadCityFilter, saveCityFilter, sbGet, siteAuditRoleFromPermissions, type CityFilter } from '@/components/site-audit/siteAuditShared';
import SiteAuditorApp from '@/components/site-audit/SiteAuditorApp';
import SiteInstallerApp from '@/components/site-audit/SiteInstallerApp';
import SiteAuditJobsView from '@/components/site-audit/SiteAuditJobsView';
import SiteAuditPerfView from '@/components/site-audit/SiteAuditPerfView';
import SiteAuditAnalyticsView from '@/components/site-audit/SiteAuditAnalyticsView';
import SiteAuditInstallOpsView from '@/components/site-audit/SiteAuditInstallOpsView';
import SiteAuditOpsView from '@/components/site-audit/SiteAuditOpsView';
import SiteShadowerApp from '@/components/site-audit/SiteShadowerApp';
import SiteAuditBmView from '@/components/site-audit/SiteAuditBmView';

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
  bm: 'Business Manager',
};

type Person = { id: string; name: string; email: string; role: string; contact?: string };

function SiteAuditViewInner() {
  const searchParams = useSearchParams();
  const email = searchParams.get('person') || '';
  // ?view=shadowing opens the person's read-only shadowing schedule instead of
  // their own dashboard — shadowing is cross-role, so it's available for anyone.
  const wantShadowing = searchParams.get('view') === 'shadowing';
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [permissionRole, setPermissionRole] = useState<string | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [loading, setLoading] = useState(true);
  const [combinedView, setCombinedView] = useState<'auditor' | 'installer'>('auditor');
  const [smTab, setSmTab] = useState<'audit' | 'install'>('audit');
  const [smAuditSubTab, setSmAuditSubTab] = useState<'ops' | 'jobs' | 'perf' | 'analytics' | 'live'>('ops');
  const [city, setCity] = useState<CityFilter>('all');
  useEffect(() => { setCity(loadCityFilter()); }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('materialdepot_user');
      setLoggedIn(!!stored);
      setPermissionRole(siteAuditRoleFromPermissions(stored ? JSON.parse(stored)?.individualPermissions : null));
    } catch {
      setLoggedIn(false);
      setPermissionRole(null);
    }
  }, []);

  useEffect(() => {
    if (!email) { setLoading(false); return; }
    let alive = true;
    sbGet('profiles?email=eq.' + encodeURIComponent(email) + '&select=id,name,email,role,contact&limit=1').then((rows) => {
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
  const viewRole = person.role || permissionRole;

  return (
    <div className="min-h-screen bg-[#FAFAFA] p-4 sm:p-6">
      <div className="mb-4">
        <div className="text-base font-bold text-black">{person.name}</div>
        <div className="text-[12px] text-gray-400">{person.email} · {ROLE_LABELS[viewRole || ''] || viewRole || 'No site audit permission'}</div>
      </div>

      {wantShadowing ? (
        <SiteShadowerApp actingAs={actingAs} />
      ) : person.role === 'bm' ? (
        <SiteAuditBmView bm={{ id: person.id, name: person.name, email: person.email, contact: person.contact }} />
      ) : viewRole === 'site_auditor' ? (
        <SiteAuditorApp actingAs={actingAs} />
      ) : viewRole === 'installer' ? (
        <SiteInstallerApp actingAs={actingAs} />
      ) : viewRole === 'auditor_installer' ? (
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
      ) : viewRole === 'service_mgr' ? (
        <>
          <div className="flex gap-2 mb-3 items-center">
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
            <div className="ml-auto flex shrink-0 items-center gap-2 pl-4">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400" htmlFor="sav-city">City</label>
              <select
                id="sav-city"
                value={city}
                onChange={(e) => { const c = e.target.value as CityFilter; setCity(c); saveCityFilter(c); }}
                className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white min-w-[140px] focus:border-[#0F766E]"
              >
                <option value="all">All Cities</option>
                {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          {smTab === 'audit' && (
            <div className="flex gap-2 flex-wrap mb-3">
              {([
                ['ops', 'Audit Ops'],
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
            <SiteAuditInstallOpsView city={city} />
          ) : smAuditSubTab === 'ops' ? (
            <SiteAuditOpsView city={city} />
          ) : smAuditSubTab === 'jobs' ? (
            <SiteAuditJobsView city={city} />
          ) : smAuditSubTab === 'perf' ? (
            <SiteAuditPerfView city={city} />
          ) : smAuditSubTab === 'analytics' ? (
            <SiteAuditAnalyticsView city={city} />
          ) : (
            <SiteAuditLiveView city={city} />
          )}
        </>
      ) : (
        <div className="text-sm text-gray-400">
          No Site Audit dashboard permission set for this account. Ask an admin to grant a Site Audit sub-role under Admin &gt; Users.
        </div>
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
