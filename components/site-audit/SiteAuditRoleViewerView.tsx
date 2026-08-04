'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { sbGet } from './siteAuditShared';
import SiteAuditorApp from './SiteAuditorApp';
import SiteInstallerApp from './SiteInstallerApp';
import SiteAuditJobsView from './SiteAuditJobsView';
import SiteAuditPerfView from './SiteAuditPerfView';
import SiteAuditAnalyticsView from './SiteAuditAnalyticsView';
import SiteAuditInstallOpsView from './SiteAuditInstallOpsView';

/* leaflet touches `window` at module-load time — see SiteAuditRail.tsx. */
const SiteAuditLiveView = dynamic(() => import('./SiteAuditLiveView'), { ssr: false });

/* Role/person picker mirroring the original Admin Console's Role Viewer. The
   original embeds an iframe and swaps localStorage to impersonate a login;
   that trick only works same-origin, so instead we render the native
   Auditor/Installer apps directly, passing the selected person in as
   `actingAs`. Service Manager isn't a per-person view (same ops dashboard for
   whoever's on shift) — it renders the Audit Dashboard (the same Job
   Overview/Performance/Analytics/Live views as the top-level rail) plus the
   Install Dashboard ops center, exactly like the original's two-tab layout. */

const ROLES: Record<string, { label: string; ico: string }> = {
  service_mgr: { label: 'Service Manager', ico: '📋' },
  site_auditor: { label: 'Site Auditor', ico: '🔍' },
  installer: { label: 'Site Installer', ico: '🔧' },
  auditor_installer: { label: 'Auditor + Installer', ico: '🔍🔧' },
  store_staff: { label: 'Store Team', ico: '🏪' },
};
const ROLE_ORDER = ['service_mgr', 'site_auditor', 'installer', 'auditor_installer', 'store_staff'];

type Person = { id: string; name: string; email: string; role: string };

export default function SiteAuditRoleViewerView() {
  const [persons, setPersons] = useState<Record<string, Person[]>>({});
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [personEmail, setPersonEmail] = useState<string | null>(null);
  const [combinedView, setCombinedView] = useState<'auditor' | 'installer'>('auditor');
  const [smTab, setSmTab] = useState<'audit' | 'install'>('audit');
  const [smAuditSubTab, setSmAuditSubTab] = useState<'jobs' | 'perf' | 'analytics' | 'live'>('jobs');

  useEffect(() => {
    let alive = true;
    (async () => {
      const rows = await sbGet('profiles?role=neq.admin&select=id,name,email,role&order=name.asc');
      if (!alive) return;
      const map: Record<string, Person[]> = {};
      if (Array.isArray(rows)) rows.forEach((p: Person) => { if (!map[p.role]) map[p.role] = []; map[p.role].push(p); });
      setPersons(map);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const list = role ? (persons[role] || []) : [];
  const person = role && personEmail ? list.find((p) => p.email === personEmail) : null;

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-bold text-black">Role Viewer</h1>
        <p className="text-[13px] text-gray-400 mt-0.5">Pick a role and person to preview their dashboard, viewed as them.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
        {ROLE_ORDER.map((k) => {
          // Store Team is a shared per-store kiosk tool, not a per-person login —
          // it's the public /store-booking route (no CRM auth), same as the
          // original's public link, so this just opens it instead of feeding
          // it into the role/person picker below.
          if (k === 'store_staff') {
            return (
              <a
                key={k}
                href="/store-booking"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-[#EAB308] bg-white p-4 text-center cursor-pointer transition-colors hover:bg-yellow-50 block"
              >
                <div className="text-2xl mb-2">{ROLES[k].ico}</div>
                <div className="text-sm font-semibold text-black">{ROLES[k].label}</div>
                <div className="text-[11px] font-semibold text-[#EAB308] mt-0.5">Open Store Booking ↗</div>
              </a>
            );
          }
          const cnt = (persons[k] || []).length;
          const active = role === k;
          return (
            <button
              key={k}
              onClick={() => { setRole(k); setPersonEmail(null); }}
              className={`rounded-lg border bg-white p-4 text-center cursor-pointer transition-colors ${
                active ? 'border-[#EAB308] ring-1 ring-[#EAB308]' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="text-2xl mb-2">{ROLES[k].ico}</div>
              <div className="text-sm font-semibold text-black">{ROLES[k].label}</div>
              <div className="text-[11px] text-gray-400 mt-0.5">{cnt} {cnt === 1 ? 'member' : 'members'}</div>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="text-gray-400 text-[13px] text-center py-8">Loading…</div>
      ) : role && list.length ? (
        <div className="flex flex-wrap gap-2 mb-4">
          {list.map((p) => (
            <button
              key={p.email}
              onClick={() => setPersonEmail(p.email)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                personEmail === p.email ? 'bg-[#1A1A1A] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      ) : null}

      {!role ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="text-center text-gray-400 text-[13px] py-8">👆 Select a role above to preview their dashboard</div>
        </div>
      ) : !list.length ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="text-center text-gray-400 text-[13px] py-8">No {ROLES[role].label}s found.</div>
        </div>
      ) : !person ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="text-center text-gray-400 text-[13px] py-8">👆 Select a person above to view their dashboard</div>
        </div>
      ) : role === 'site_auditor' ? (
        <div className="rounded-lg border border-gray-200 bg-white">
          <PersonBanner person={person} roleLabel={ROLES[person.role]?.label || person.role} />
          <div className="p-4 sm:p-6">
            <SiteAuditorApp actingAs={{ id: person.id, name: person.name, email: person.email }} />
          </div>
        </div>
      ) : role === 'installer' ? (
        <div className="rounded-lg border border-gray-200 bg-white">
          <PersonBanner person={person} roleLabel={ROLES[person.role]?.label || person.role} />
          <div className="p-4 sm:p-6">
            <SiteInstallerApp actingAs={{ id: person.id, name: person.name, email: person.email }} />
          </div>
        </div>
      ) : role === 'auditor_installer' ? (
        <div className="rounded-lg border border-gray-200 bg-white">
          <PersonBanner person={person} roleLabel={ROLES[person.role]?.label || person.role} />
          <div className="px-4 sm:px-6 pt-4 flex gap-2">
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
          <div className="p-4 sm:p-6">
            {combinedView === 'auditor' ? (
              <SiteAuditorApp actingAs={{ id: person.id, name: person.name, email: person.email }} />
            ) : (
              <SiteInstallerApp actingAs={{ id: person.id, name: person.name, email: person.email }} />
            )}
          </div>
        </div>
      ) : role === 'service_mgr' ? (
        <div className="rounded-lg border border-gray-200 bg-white">
          <PersonBanner person={person} roleLabel={ROLES[person.role]?.label || person.role} />
          <div className="px-4 sm:px-6 pt-4 flex gap-2">
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
            <div className="px-4 sm:px-6 pt-3 flex gap-2 flex-wrap">
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
          <div className="p-4 sm:p-6">
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
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PersonBanner({ person, roleLabel }: { person: Person; roleLabel: string }) {
  return (
    <div className="px-4 sm:px-6 pt-4 pb-2 border-b border-gray-100 flex items-center justify-between">
      <div>
        <div className="text-sm font-semibold text-black">{person.name}</div>
        <div className="text-[12px] text-gray-400">{person.email} · {roleLabel}</div>
      </div>
      <div className="text-[11px] font-semibold text-[#EAB308] bg-yellow-50 border border-[#EAB308]/40 rounded-full px-2.5 py-1">Viewing as</div>
    </div>
  );
}
