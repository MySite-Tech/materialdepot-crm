'use client';

import { Suspense, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { CITIES, decodePerson, initials, isSiteAuditOversightRole, loadCityFilter, saveCityFilter, sbGet, siteAuditRoleFromPermissions, type CityFilter } from '@/components/site-audit/siteAuditShared';
import SiteAuditorApp from '@/components/site-audit/apps/SiteAuditorApp';
import SiteInstallerApp from '@/components/site-audit/apps/SiteInstallerApp';
import SiteAuditJobsView from '@/components/site-audit/views/SiteAuditJobsView';
import SiteAuditPerfView from '@/components/site-audit/views/SiteAuditPerfView';
import SiteAuditAnalyticsView from '@/components/site-audit/views/SiteAuditAnalyticsView';
import SiteAuditInstallOpsView from '@/components/site-audit/views/SiteAuditInstallOpsView';
import SiteAuditOpsView from '@/components/site-audit/views/SiteAuditOpsView';
import SiteShadowerApp from '@/components/site-audit/apps/SiteShadowerApp';
import SiteAuditBmView from '@/components/site-audit/views/SiteAuditBmView';
import SiteAuditCoeView from '@/components/site-audit/views/SiteAuditCoeView';
import SiteAuditBranchManagerView from '@/components/site-audit/views/SiteAuditBranchManagerView';

const SiteAuditLiveView = dynamic(() => import('@/components/site-audit/views/SiteAuditLiveView'), { ssr: false });

const ROLE_LABELS: Record<string, string> = {
  service_mgr: 'Service Manager',
  site_auditor: 'Site Auditor',
  installer: 'Site Installer',
  auditor_installer: 'Auditor + Installer',
  bm: 'Business Manager',
  coe: 'Category Ops Executive',
  branch_mgr: 'Branch Manager',
};

type Person = { id: string; name: string; email: string; role: string; contact?: string };

function SiteAuditViewInner() {
  const searchParams = useSearchParams();

  const email = decodePerson(searchParams.get('p') || '') || searchParams.get('person') || '';

  const wantShadowing = searchParams.get('view') === 'shadowing';
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [mayPreview, setMayPreview] = useState(false);
  const [permissionRole, setPermissionRole] = useState<string | null>(null);

  const [crmName, setCrmName] = useState('');
  const [person, setPerson] = useState<Person | null>(null);
  const [loading, setLoading] = useState(true);
  const [combinedView, setCombinedView] = useState<'auditor' | 'installer'>('auditor');
  const [smTab, setSmTab] = useState<'audit' | 'install'>('audit');
  const [smAuditSubTab, setSmAuditSubTab] = useState<'ops' | 'jobs' | 'perf' | 'analytics' | 'live'>('ops');
  const [city, setCity] = useState<CityFilter>('all');
  useEffect(() => { setCity(loadCityFilter()); }, []);

  const [coeShowServiceMgr, setCoeShowServiceMgr] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('materialdepot_user');
      setLoggedIn(!!stored);
      const parsed = stored ? JSON.parse(stored) : null;
      const own = siteAuditRoleFromPermissions(parsed?.individualPermissions);
      setPermissionRole(own);
      setCrmName(parsed?.name || '');

      setMayPreview(isSiteAuditOversightRole(own));
    } catch {
      setLoggedIn(false);
      setPermissionRole(null);
      setMayPreview(false);
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
  if (!mayPreview) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center text-sm text-gray-500">
        This preview is limited to Site Audit oversight accounts.
      </div>
    );
  }
  if (!person) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">Person not found.</div>;
  }

  const actingAs = { id: person.id, name: person.name, email: person.email };
  const viewRole = person.role || permissionRole;

  const cityPicker = (
    <div className="flex shrink-0 items-center gap-2">
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
  );

  const isCombined = viewRole === 'auditor_installer' && !wantShadowing && person.role !== 'bm';

  const isCoe = person.role === 'coe' && !wantShadowing;
  const isBranchMgr = person.role === 'branch_mgr' && !wantShadowing;
  const isSm = (viewRole === 'service_mgr' || (isCoe && coeShowServiceMgr)) && !wantShadowing && person.role !== 'bm';
  const showSm = isSm || (isCoe && coeShowServiceMgr);
  const showCity = showSm || isCoe || isBranchMgr;

  type Tab = { key: string; label: string };
  const primaryTabs: Tab[] = showSm
    ? [{ key: 'audit', label: 'Audit Dashboard' }, { key: 'install', label: 'Install Dashboard' }]
    : isCombined
      ? [{ key: 'auditor', label: 'Auditor view' }, { key: 'installer', label: 'Installer view' }]
      : [];
  const activePrimary = showSm ? smTab : isCombined ? combinedView : '';
  const pickPrimary = (k: string) => (showSm ? setSmTab(k as 'audit' | 'install') : setCombinedView(k as 'auditor' | 'installer'));

  const smBody = smTab === 'install' ? (
    <SiteAuditInstallOpsView city={city} attribution={person.name || crmName} actorEmail={person.email} />
  ) : smAuditSubTab === 'ops' ? (
    <SiteAuditOpsView city={city} attribution={person.name || crmName} actorEmail={person.email} />
  ) : smAuditSubTab === 'jobs' ? (
    <SiteAuditJobsView city={city} />
  ) : smAuditSubTab === 'perf' ? (
    <SiteAuditPerfView city={city} />
  ) : smAuditSubTab === 'analytics' ? (

    <SiteAuditAnalyticsView city={city} execOnly />
  ) : (
    <SiteAuditLiveView city={city} />
  );

  const auditSubTabs: Tab[] = [
    { key: 'ops', label: 'Audit Ops' },
    { key: 'jobs', label: 'Job Overview' },
    { key: 'perf', label: 'Performance' },
    { key: 'analytics', label: 'Analytics' },
    { key: 'live', label: 'Live' },
  ];
  const showSubTabs = showSm && smTab === 'audit';

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-3 px-4 pt-3.5 sm:px-6">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#1F3A5F] text-[12px] font-bold text-white">
            {initials(person.name)}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-bold leading-tight text-black">{person.name}</div>
            <div className="truncate text-[11.5px] text-gray-400">
              {person.email} · {ROLE_LABELS[viewRole || ''] || viewRole || 'No site audit permission'}
            </div>
          </div>
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-amber-700">
            {wantShadowing ? 'Shadowing preview' : 'Preview'}
          </span>
          {isCoe ? (
            <button
              onClick={() => setCoeShowServiceMgr((v) => !v)}
              className="ml-auto shrink-0 rounded-md bg-purple-50 px-3 py-1.5 text-[12.5px] font-extrabold text-purple-700 cursor-pointer"
            >
              {coeShowServiceMgr ? '← Their dashboard' : 'Service Manager dashboard →'}
            </button>
          ) : null}
          {showCity ? <div className={isCoe ? '' : 'ml-auto'}>{cityPicker}</div> : null}
        </div>

        {primaryTabs.length ? (
          <div className="mt-2.5 flex items-center gap-0 overflow-x-auto px-4 sm:px-6">
            {primaryTabs.map((t) => (
              <button
                key={t.key}
                onClick={() => pickPrimary(t.key)}
                className={`whitespace-nowrap border-b-2 bg-transparent px-4 py-2.5 text-[13px] font-semibold ${
                  activePrimary === t.key ? 'border-[#EAB308] text-gray-800' : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : <div className="h-3.5" />}
      </header>

      <div className="px-4 py-4 sm:px-6 sm:py-5">
        {showSubTabs ? (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {auditSubTabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setSmAuditSubTab(t.key as typeof smAuditSubTab)}
                className={`rounded-full px-3 py-1.5 text-[11.5px] font-semibold ${
                  smAuditSubTab === t.key ? 'bg-[#1A1A1A] text-white' : 'border border-gray-200 bg-white text-gray-500 hover:border-gray-400'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : null}

        {wantShadowing ? (
          <SiteShadowerApp actingAs={actingAs} />
        ) : person.role === 'bm' ? (
          <SiteAuditBmView bm={{ id: person.id, name: person.name, email: person.email, contact: person.contact }} />
        ) : viewRole === 'site_auditor' ? (
          <SiteAuditorApp actingAs={actingAs} />
        ) : viewRole === 'installer' ? (
          <SiteInstallerApp actingAs={actingAs} />
        ) : isCoe && !coeShowServiceMgr ? (
          <SiteAuditCoeView city={city} who={person.name} whoEmail={person.email} />
        ) : isCombined ? (
          combinedView === 'auditor' ? <SiteAuditorApp actingAs={actingAs} /> : <SiteInstallerApp actingAs={actingAs} />
        ) : isCoe ? (
          <div>
            <div className="mb-3 flex justify-end">
              <button
                onClick={() => setCoeShowServiceMgr((v) => !v)}
                className="cursor-pointer rounded-md bg-purple-50 px-3 py-1.5 text-[12.5px] font-extrabold text-purple-700"
              >
                {coeShowServiceMgr ? '← COE dashboard' : 'Service Manager dashboard →'}
              </button>
            </div>
            {coeShowServiceMgr ? smBody : <SiteAuditCoeView city={city} who={person.name} whoEmail={person.email} />}
          </div>
        ) : isBranchMgr ? (
          <SiteAuditBranchManagerView branches={null} contact={person.contact || null} city={city} />
        ) : showSm ? (
          smBody
        ) : (
          <div className="text-sm text-gray-400">
            No Site Audit dashboard permission set for this account. Ask an admin to grant a Site Audit sub-role under Admin &gt; Users.
          </div>
        )}
      </div>
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
