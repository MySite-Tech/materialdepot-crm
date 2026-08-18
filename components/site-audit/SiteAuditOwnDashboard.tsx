'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { CITIES, loadCityFilter, saveCityFilter, sbGet, type CityFilter } from './siteAuditShared';
import SiteAuditorApp from './SiteAuditorApp';
import SiteInstallerApp from './SiteInstallerApp';
import SiteAuditJobsView from './SiteAuditJobsView';
import SiteAuditPerfView from './SiteAuditPerfView';
import SiteAuditAnalyticsView from './SiteAuditAnalyticsView';
import SiteAuditInstallOpsView from './SiteAuditInstallOpsView';
import SiteAuditOpsView from './SiteAuditOpsView';
import SiteShadowerApp from './SiteShadowerApp';
import SiteAuditBmView from './SiteAuditBmView';
import SiteAuditCoeView from './SiteAuditCoeView';
import SiteAuditBranchManagerView from './SiteAuditBranchManagerView';

/* leaflet touches `window` at module-load time — see SiteAuditRail.tsx. */
const SiteAuditLiveView = dynamic(() => import('./SiteAuditLiveView'), { ssr: false });

type Person = { id: string; name: string; email: string; role: string; branch: string | null };

/* Renders the logged-in CRM user's own Site Audit dashboard, resolving their
   field-app identity by phone (profiles.contact) instead of email — the CRM
   only ever has a phone number for its own users, not an email.

   A missing field-app profile is NOT a dead end. BMs and store managers only
   ever READ here, and requiring someone to be added to the field app first is
   what made this tab show "no profile found" to every BM and store manager who
   had never been enrolled there. When the CRM already says what someone is
   (`permissionRole`, derived from their CRM permission in app/App.tsx), the
   dashboard renders off the CRM session alone. Roles that actually DO field
   work — auditor, installer, service manager — still need a real profile,
   because their own jobs are keyed to it. */
export default function SiteAuditOwnDashboard({
  contact,
  permissionRole,
  crmName = '',
  allowedBranches = null,
}: {
  contact: string;
  permissionRole: string | null;
  /* The CRM's own name for this person (f_name + l_name). Carried through as an
     order-matching alias — many field-app profiles were created from a short
     display name while order rows carry the CRM's full name. See
     SiteAuditBmView's BmProfile.aliases. */
  crmName?: string;
  /* The stores this CRM account is restricted to, for the store-manager
     rollup. Empty/null means "not restricted" — resolved from the CRM roster
     instead. */
  allowedBranches?: string[] | null;
}) {
  const [person, setPerson] = useState<Person | null>(null);
  const [loading, setLoading] = useState(true);
  const [combinedView, setCombinedView] = useState<'auditor' | 'installer'>('auditor');
  const [smTab, setSmTab] = useState<'audit' | 'install'>('audit');
  const [smAuditSubTab, setSmAuditSubTab] = useState<'ops' | 'jobs' | 'perf' | 'analytics' | 'live'>('ops');
  /* Shadowing is cross-role — anyone can be picked to observe a job — so this
     toggle sits above the role-specific dashboards rather than inside one. */
  const [shadowing, setShadowing] = useState(false);
  /* Same cross-view city context as the admin rail (shared md_city key). */
  const [city, setCity] = useState<CityFilter>('all');
  useEffect(() => { setCity(loadCityFilter()); }, []);

  useEffect(() => {
    if (!contact) { setLoading(false); return; }
    let alive = true;
    sbGet('profiles?contact=eq.' + encodeURIComponent(contact) + '&select=id,name,email,role,branch&limit=1').then((rows) => {
      if (!alive) return;
      setPerson(Array.isArray(rows) && rows[0] ? rows[0] : null);
      setLoading(false);
    }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [contact]);

  if (loading) {
    return <div className="p-6 text-center text-sm text-gray-400">Loading…</div>;
  }
  /* Stores in scope for a store manager: an explicit branch on the field-app
     profile wins, then the CRM session's own Branch Access, and `null` finally
     lets the rollup resolve it from the CRM roster by phone. */
  const managerBranches = person?.branch
    ? [person.branch]
    : (allowedBranches && allowedBranches.length ? allowedBranches : null);

  if (!person) {
    /* Read-only roles work off the CRM session alone — see the note above. */
    if (permissionRole === 'branch_mgr') {
      return <div className="p-4 sm:p-6"><SiteAuditBranchManagerView branches={managerBranches} contact={contact} city={city} /></div>;
    }
    /* No shadow bar here: shadowing is keyed to a real field-app profile
       (SiteShadowerApp acts as one), which is exactly what this person lacks. */
    if (permissionRole === 'bm') {
      return <div className="p-4 sm:p-6"><SiteAuditBmView bm={{ name: crmName, contact }} /></div>;
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

  // A BM's own dashboard is their order list, regardless of the CRM sub-role
  // permission (which only covers the auditor/installer/SM apps).
  if (person.role === 'bm') {
    return <div>{shadowBar}<div className="p-4 sm:p-6"><SiteAuditBmView bm={{ id: person.id, name: person.name, email: person.email, contact, aliases: crmName ? [crmName] : [] }} /></div></div>;
  }

  // Same pattern as BM — a COE's own dashboard is the follow-up queue,
  // regardless of the CRM sub-role permission.
  if (person.role === 'coe') {
    return <div>{shadowBar}<div className="p-4 sm:p-6"><SiteAuditCoeView city={city} who={person.name} /></div></div>;
  }

  // Same pattern again — a Branch Manager's own dashboard is their branch's
  // read-only rollup, regardless of the CRM sub-role permission.
  if (person.role === 'branch_mgr') {
    return <div>{shadowBar}<div className="p-4 sm:p-6"><SiteAuditBranchManagerView branches={managerBranches} contact={contact} city={city} /></div></div>;
  }

  if (permissionRole === 'site_auditor') {
    return <div>{shadowBar}<div className="p-4 sm:p-6"><SiteAuditorApp actingAs={actingAs} /></div></div>;
  }
  if (permissionRole === 'installer') {
    return <div>{shadowBar}<div className="p-4 sm:p-6"><SiteInstallerApp actingAs={actingAs} /></div></div>;
  }
  if (permissionRole === 'auditor_installer') {
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
  if (permissionRole === 'service_mgr') {
    return (
      <div>
        {shadowBar}
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
        </div>
      </div>
    );
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
