'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { CITIES, encodePerson, loadCityFilter, saveCityFilter, sbGet, type CityFilter } from './siteAuditShared';
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

/* Role/person picker mirroring the original Admin Console's Role Viewer. The
   original embeds an iframe and swaps localStorage to impersonate a login;
   that trick only worked because Admin.html and the field apps shared an
   origin. Everything here is one Next.js app now, so 👁 renders the person's
   dashboard inline (PersonPreview below) instead of reaching for that trick
   or a same-origin iframe — a real embed, not an impersonation hack. ↗ still
   opens /site-audit-view in a new tab for anyone who wants their own tab. */

const ROLES: Record<string, { label: string; ico: string }> = {
  service_mgr: { label: 'Service Manager', ico: '📋' },
  site_auditor: { label: 'Site Auditor', ico: '🔍' },
  installer: { label: 'Site Installer', ico: '🔧' },
  auditor_installer: { label: 'Auditor + Installer', ico: '🔍🔧' },
  store_staff: { label: 'Store Team', ico: '🏪' },
  bm: { label: 'Business Manager', ico: '💼' },
  coe: { label: 'Category Ops Executive', ico: '📞' },
  branch_mgr: { label: 'Branch Manager', ico: '🏬' },
};
const ROLE_ORDER = ['service_mgr', 'site_auditor', 'installer', 'auditor_installer', 'bm', 'coe', 'branch_mgr', 'store_staff'];

const AVATAR_COLORS = ['#EAB308', '#1F3A5F', '#0EA5E9', '#16A34A', '#DB2777', '#7C3AED', '#EA580C'];
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

type Person = { id: string; name: string; email: string; role: string; branch: string | null; contact: string | null };

export default function SiteAuditRoleViewerView() {
  const [persons, setPersons] = useState<Record<string, Person[]>>({});
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<{ person: Person; shadowing: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const rows = await sbGet('profiles?role=neq.admin&select=id,name,email,role,branch,contact&order=name.asc');
      if (!alive) return;
      const map: Record<string, Person[]> = {};
      if (Array.isArray(rows)) rows.forEach((p: Person) => { if (!map[p.role]) map[p.role] = []; map[p.role].push(p); });
      setPersons(map);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const list = role ? (persons[role] || []) : [];

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-lg font-bold text-black">Role Viewer</h1>
        <p className="text-[13px] text-gray-400 mt-0.5">Pick a role, then a person. 👁 previews their dashboard right here; ↗ opens it in a new tab instead.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
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
              onClick={() => setRole(k)}
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
        <div className="text-center text-gray-400 text-[13px] py-10">Loading…</div>
      ) : !role ? (
        <div className="text-center text-gray-400 text-[13px] py-10 border border-dashed border-gray-200 rounded-lg">
          👆 Select a role above to see its members
        </div>
      ) : !list.length ? (
        <div className="text-center text-gray-400 text-[13px] py-10 border border-dashed border-gray-200 rounded-lg">
          No {ROLES[role].label}s found.
        </div>
      ) : (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2.5">
            {ROLES[role].label} · {list.length} {list.length === 1 ? 'member' : 'members'}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {list.map((p) => (
              <a
                key={p.email}
                href={`/site-audit-view?p=${encodePerson(p.email)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`group flex items-center gap-3 rounded-lg border bg-white px-4 py-3 transition-all hover:border-[#EAB308] hover:shadow-sm ${
                  previewing?.person.email === p.email ? 'border-[#EAB308] ring-1 ring-[#EAB308]' : 'border-gray-200'
                }`}
              >
                <div
                  className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold"
                  style={{ background: avatarColor(p.name) }}
                >
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-black truncate">{p.name}</div>
                  <div className="text-[11px] text-gray-400 truncate">{p.email}</div>
                </div>
                <span
                  title="Preview their dashboard here"
                  className="shrink-0 rounded-md bg-purple-50 px-1.5 py-1 text-[12px] text-purple-700 hover:bg-purple-100"
                  onClick={(e) => { e.preventDefault(); setPreviewing({ person: p, shadowing: false }); }}
                >
                  👁
                </span>
                <span className="shrink-0 text-gray-300 text-sm group-hover:text-[#EAB308]">↗</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {previewing ? (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white">
          <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
            <div
              className="shrink-0 grid h-8 w-8 place-items-center rounded-full text-[11px] font-bold text-white"
              style={{ background: avatarColor(previewing.person.name) }}
            >
              {previewing.person.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-black">
                {previewing.person.name} <span className="font-normal text-gray-400">· {previewing.shadowing ? 'shadowing schedule' : ROLES[previewing.person.role]?.label || previewing.person.role}</span>
              </div>
              <div className="truncate text-[11px] text-gray-400">{previewing.person.email}</div>
            </div>
            <button
              onClick={() => setPreviewing((v) => (v ? { ...v, shadowing: !v.shadowing } : v))}
              className={`shrink-0 rounded-md px-2.5 py-1.5 text-[12px] font-semibold ${previewing.shadowing ? 'bg-[#1F3A5F] text-white' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'}`}
            >
              {previewing.shadowing ? '← Their dashboard' : '👁 Their shadowing schedule'}
            </button>
            <button onClick={() => setPreviewing(null)} className="shrink-0 rounded-md border border-gray-200 px-2.5 py-1.5 text-[12px] font-semibold text-gray-600 hover:bg-gray-50">Close</button>
          </div>
          <div className="p-4 sm:p-5">
            <PersonPreviewBody person={previewing.person} shadowing={previewing.shadowing} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* The same role → dashboard switch SiteAuditOwnDashboard/site-audit-view use,
   scoped to the roles Role Viewer actually lists (no admin, no store_staff —
   that one's a public kiosk link above, not a person preview). */
function PersonPreviewBody({ person, shadowing }: { person: Person; shadowing: boolean }) {
  const [combinedView, setCombinedView] = useState<'auditor' | 'installer'>('auditor');
  const [smTab, setSmTab] = useState<'audit' | 'install'>('audit');
  const [smAuditSubTab, setSmAuditSubTab] = useState<'ops' | 'jobs' | 'perf' | 'analytics' | 'live'>('ops');
  const [city, setCity] = useState<CityFilter>('all');
  useEffect(() => { setCity(loadCityFilter()); }, []);

  const actingAs = { id: person.id, name: person.name, email: person.email };

  if (shadowing) return <SiteShadowerApp actingAs={actingAs} />;
  if (person.role === 'bm') return <SiteAuditBmView bm={{ id: person.id, name: person.name, email: person.email, contact: person.contact || undefined }} />;
  if (person.role === 'coe') return <SiteAuditCoeView city={city} who={person.name} />;
  /* `branches={null}` + contact makes the preview resolve the store the same
     way the real person's session does — from their CRM Branch Access — so an
     admin sees what they'd actually see, not a guess off the blank
     profiles.branch column. An explicit branch on the profile still wins. */
  if (person.role === 'branch_mgr') return <SiteAuditBranchManagerView branches={person.branch ? [person.branch] : null} contact={person.contact} city={city} />;
  if (person.role === 'site_auditor') return <SiteAuditorApp actingAs={actingAs} />;
  if (person.role === 'installer') return <SiteInstallerApp actingAs={actingAs} />;

  if (person.role === 'auditor_installer') {
    return (
      <div>
        <div className="mb-4 flex gap-0 border-b border-gray-200">
          {([['auditor', 'Auditor view'], ['installer', 'Installer view']] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setCombinedView(k)}
              className={`px-4 py-2 text-[13px] font-semibold border-b-2 ${combinedView === k ? 'border-[#EAB308] text-gray-800' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {combinedView === 'auditor' ? <SiteAuditorApp actingAs={actingAs} /> : <SiteInstallerApp actingAs={actingAs} />}
      </div>
    );
  }

  if (person.role === 'service_mgr') {
    return (
      <div>
        <div className="mb-4 flex flex-wrap items-center gap-0 border-b border-gray-200">
          {([['audit', 'Audit Dashboard'], ['install', 'Install Dashboard']] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setSmTab(k)}
              className={`px-4 py-2 text-[13px] font-semibold border-b-2 ${smTab === k ? 'border-[#EAB308] text-gray-800' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              {label}
            </button>
          ))}
          <div className="ml-auto flex shrink-0 items-center gap-2 pb-2">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400" htmlFor="pv-city">City</label>
            <select
              id="pv-city"
              value={city}
              onChange={(e) => { const c = e.target.value as CityFilter; setCity(c); saveCityFilter(c); }}
              className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white min-w-[140px] focus:border-[#0F766E]"
            >
              <option value="all">All Cities</option>
              {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        {smTab === 'install' ? (
          <SiteAuditInstallOpsView city={city} />
        ) : (
          <div>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {([
                ['ops', 'Audit Ops'], ['jobs', 'Job Overview'], ['perf', 'Performance'], ['analytics', 'Analytics'], ['live', 'Live'],
              ] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setSmAuditSubTab(k)}
                  className={`rounded-full px-3 py-1.5 text-[11.5px] font-semibold ${smAuditSubTab === k ? 'bg-[#1A1A1A] text-white' : 'border border-gray-200 bg-white text-gray-500 hover:border-gray-400'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {smAuditSubTab === 'ops' ? (
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
        )}
      </div>
    );
  }

  return <div className="py-6 text-center text-[13px] text-gray-400">No dashboard for this role.</div>;
}
