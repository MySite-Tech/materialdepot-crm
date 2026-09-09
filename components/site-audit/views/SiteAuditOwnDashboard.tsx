'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { CITIES, loadCityFilter, ownProfileQuery, pickOwnProfile, saveCityFilter, sbGet, type CityFilter } from '../siteAuditShared';
import SiteAuditorApp from '../apps/SiteAuditorApp';
import SiteInstallerApp from '../apps/SiteInstallerApp';
import SiteAuditJobsView from './SiteAuditJobsView';
import SiteAuditPerfView from './SiteAuditPerfView';
import SiteAuditAnalyticsView from './SiteAuditAnalyticsView';
import SiteAuditInstallOpsView from './SiteAuditInstallOpsView';
import SiteAuditOpsView from './SiteAuditOpsView';
import SiteShadowerApp from '../apps/SiteShadowerApp';
import SiteAuditBmView from './SiteAuditBmView';
import SiteAuditCoeView from './SiteAuditCoeView';
import SiteAuditBranchManagerView from './SiteAuditBranchManagerView';

const SiteAuditLiveView = dynamic(() => import('./SiteAuditLiveView'), { ssr: false });

type Person = { id: string; name: string; email: string; role: string; branch: string | null; deleted_at?: string | null };

export default function SiteAuditOwnDashboard({
  contact,
  permissionRole,
  crmName = '',
  allowedBranches = null,
}: {
  contact: string;
  permissionRole: string | null;

  crmName?: string;

  allowedBranches?: string[] | null;
}) {
  const [person, setPerson] = useState<Person | null>(null);
  const [loading, setLoading] = useState(true);

  const [loadErr, setLoadErr] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [combinedView, setCombinedView] = useState<'auditor' | 'installer'>('auditor');
  const [smTab, setSmTab] = useState<'audit' | 'install'>('audit');
  const [smAuditSubTab, setSmAuditSubTab] = useState<'ops' | 'jobs' | 'perf' | 'analytics' | 'live'>('ops');

  const [coeShowServiceMgr, setCoeShowServiceMgr] = useState(false);

  const [shadowing, setShadowing] = useState(false);

  const [city, setCity] = useState<CityFilter>('all');
  useEffect(() => { setCity(loadCityFilter()); }, []);

  useEffect(() => {
    if (!contact) { setLoading(false); return; }
    let alive = true;
    ownProfileQuery(contact).then((q) => sbGet(q)).then((rows) => {
      if (!alive) return;
      if (!Array.isArray(rows)) { setLoadErr(true); setLoading(false); return; }
      setLoadErr(false);
      setPerson(pickOwnProfile<Person>(rows));
      setLoading(false);
    }).catch(() => { if (alive) { setLoadErr(true); setLoading(false); } });
    return () => { alive = false; };
  }, [contact, reloadTick]);

  if (loading) {
    return <div className="p-6 text-center text-sm text-gray-400">Loading…</div>;
  }
  const retryBtn = (
    <button
      onClick={() => { setLoading(true); setReloadTick((t) => t + 1); }}
      className="rounded-md bg-[#1F3A5F] px-3 py-1.5 text-[12.5px] font-extrabold text-white cursor-pointer"
    >
      Retry
    </button>
  );

  const sessionOnlyRole = permissionRole === 'bm' || permissionRole === 'branch_mgr';
  if (loadErr && !person && !sessionOnlyRole) {
    return (
      <div className="p-6 text-center text-sm text-gray-500">
        Couldn&apos;t load your field-app profile just now — a connection problem, not a missing account.
        <div className="mt-3">{retryBtn}</div>
      </div>
    );
  }

  const managerBranches = allowedBranches && allowedBranches.length
    ? allowedBranches
    : (person?.branch ? [person.branch] : null);

  const loadErrNotice = loadErr ? (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border-l-4 border-amber-400 bg-amber-50 px-4 py-2.5 text-[12.5px] text-amber-900">
      <span>Your field-app profile didn&apos;t load, so this view is running off your CRM account only.</span>
      {retryBtn}
    </div>
  ) : null;

  if (!person) {

    if (permissionRole === 'branch_mgr') {
      return <div className="p-4 sm:p-6">{loadErrNotice}<SiteAuditBranchManagerView branches={managerBranches} contact={contact} city={city} /></div>;
    }

    if (permissionRole === 'bm') {
      return <div className="p-4 sm:p-6">{loadErrNotice}<SiteAuditBmView bm={{ name: crmName, contact }} /></div>;
    }
    return (
      <div className="p-6 text-center text-sm text-gray-400">
        No Site Audit profile found for this phone number yet. Ask an admin to link it in the field-app profile.
      </div>
    );
  }

  const actingAs = { id: person.id, name: person.name, email: person.email };
  const shadowBar = (
    <div className="flex justify-end border-b border-gray-200 bg-white px-6 py-2">
      <button
        onClick={() => setShadowing((v) => !v)}
        className={`rounded-md px-3 py-1.5 text-[12.5px] font-extrabold ${shadowing ? 'bg-[#1F3A5F] text-white' : 'bg-purple-50 text-purple-700'}`}
      >
        {shadowing ? '← Back to my dashboard' : '👁 My shadowing'}
      </button>
    </div>
  );

  if (shadowing) {
    return <div>{shadowBar}<div className="p-4 sm:p-6"><SiteShadowerApp actingAs={actingAs} /></div></div>;
  }

  const renderServiceMgrDashboard = () => (
    <>
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 flex gap-0 items-center">
          {([['audit', 'Audit Dashboard'], ['install', 'Install Dashboard']] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setSmTab(k)}
              className={`px-5 py-3 text-[13px] font-semibold border-b-2 cursor-pointer bg-transparent ${smTab === k ? 'border-[#EAB308] text-gray-800' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              {label}
            </button>
          ))}
          <div className="ml-auto flex shrink-0 items-center gap-2 pl-4">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400" htmlFor="sm-city">City</label>
            <select
              id="sm-city"
              value={city}
              onChange={(e) => { const c = e.target.value as CityFilter; setCity(c); saveCityFilter(c); }}
              className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white min-w-[140px] focus:border-[#0F766E]"
            >
              <option value="all">All Cities</option>
              {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </div>
      <div className="p-4 sm:p-6">
        {smTab === 'audit' && (
          <div className="flex gap-2 flex-wrap mb-4">
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
                className={`px-3 py-1.5 rounded-full text-[11px] font-semibold ${smAuditSubTab === k ? 'bg-[#EAB308] text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-400'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {smTab === 'install' ? (
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
        )}
      </div>
    </>
  );

  if (person.role === 'bm') {
    return <div>{shadowBar}<div className="p-4 sm:p-6"><SiteAuditBmView bm={{ id: person.id, name: person.name, email: person.email, contact, aliases: crmName ? [crmName] : [] }} /></div></div>;
  }

  if (person.role === 'coe') {
    return (
      <div>
        {shadowBar}
        <div className="flex justify-end border-b border-gray-200 bg-white px-6 py-2">
          <button
            onClick={() => setCoeShowServiceMgr((v) => !v)}
            className="rounded-md bg-purple-50 px-3 py-1.5 text-[12.5px] font-extrabold text-purple-700 cursor-pointer"
          >
            {coeShowServiceMgr ? '← My dashboard' : 'Service Manager dashboard →'}
          </button>
        </div>
        {coeShowServiceMgr
          ? renderServiceMgrDashboard()
          : <div className="p-4 sm:p-6"><SiteAuditCoeView city={city} who={person.name} whoEmail={person.email} /></div>}
      </div>
    );
  }

  if (person.role === 'branch_mgr') {
    return <div>{shadowBar}<div className="p-4 sm:p-6"><SiteAuditBranchManagerView branches={managerBranches} contact={contact} city={city} /></div></div>;
  }

  const APP_ROLES = new Set(['site_auditor', 'installer', 'auditor_installer', 'service_mgr']);
  const viewRole = permissionRole && APP_ROLES.has(permissionRole) ? permissionRole : person.role;

  if (viewRole === 'site_auditor') {
    return <div>{shadowBar}<div className="p-4 sm:p-6"><SiteAuditorApp actingAs={actingAs} /></div></div>;
  }
  if (viewRole === 'installer') {
    return <div>{shadowBar}<div className="p-4 sm:p-6"><SiteInstallerApp actingAs={actingAs} /></div></div>;
  }
  if (viewRole === 'auditor_installer') {
    return (
      <div>
        {shadowBar}
        <div className="bg-white border-b border-gray-200">
          <div className="px-6 flex gap-0">
            {([['auditor', 'Auditor view'], ['installer', 'Installer view']] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setCombinedView(k)}
                className={`px-5 py-3 text-[13px] font-semibold border-b-2 cursor-pointer bg-transparent ${combinedView === k ? 'border-[#EAB308] text-gray-800' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="p-4 sm:p-6">
          {combinedView === 'auditor' ? <SiteAuditorApp actingAs={actingAs} /> : <SiteInstallerApp actingAs={actingAs} />}
        </div>
      </div>
    );
  }
  if (viewRole === 'service_mgr') {
    return <div>{shadowBar}{renderServiceMgrDashboard()}</div>;
  }
  return (
    <div>
      {shadowBar}
      <div className="p-6 text-center text-sm text-gray-400">
          Ask an admin to grant a Site Audit sub-role under Admin &gt; Users.
      </div>
    </div>
  );
}
