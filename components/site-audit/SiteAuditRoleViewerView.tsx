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

/* Profiles the CRM sync created carry `crm.<phone>@site-audit.internal` (see
   syntheticSiteAuditEmail) — an addressable-looking string that is not an
   address and tells a human nothing. Show the phone it encodes instead, which
   is what someone scanning this list actually recognises. Real emails are
   shown as-is. */
const SYNTHETIC_DOMAIN = '@site-audit.internal';
function subtitleFor(p: Person): string {
  if (!p.email.endsWith(SYNTHETIC_DOMAIN)) return p.email;
  return p.contact || p.email.slice(0, -SYNTHETIC_DOMAIN.length).replace(/^crm\./, '');
}

/* Name, phone and email all match — someone looking for a person has whichever
   of the three is to hand, and the phone is often the only one they know. */
function matchesQuery(p: Person, q: string): boolean {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return p.name.toLowerCase().includes(needle)
    || p.email.toLowerCase().includes(needle)
    || (p.contact || '').includes(needle)
    || subtitleFor(p).toLowerCase().includes(needle);
}

export default function SiteAuditRoleViewerView() {
  const [persons, setPersons] = useState<Record<string, Person[]>>({});
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<{ person: Person; shadowing: boolean } | null>(null);
  const [query, setQuery] = useState('');

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

  /* A query searches EVERY role, not just the selected one: the whole point of
     looking someone up is that you do not know which bucket they are in.
     Selecting a role still narrows, so the two compose. store_staff is excluded
     because it is a shared kiosk, not a person with a dashboard to preview. */
  const searching = query.trim().length > 0;
  const list = searching
    ? ROLE_ORDER
        .filter((k) => k !== 'store_staff' && (!role || k === role))
        .flatMap((k) => (persons[k] || []).filter((p) => matchesQuery(p, query)))
    : role ? (persons[role] || []) : [];

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-lg font-bold text-black">Role Viewer</h1>
        <p className="text-[13px] text-gray-400 mt-0.5">Pick a role, then a person. 👁 previews their dashboard right here; ↗ opens it in a new tab instead.</p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1 max-w-[420px]">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-gray-400">⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search anyone by name, phone or email…"
            className="w-full rounded-md border border-gray-200 bg-white py-2 pl-7 pr-8 text-[13px] outline-none focus:border-[#0F766E]"
          />
          {query ? (
            <button
              onClick={() => setQuery('')}
              title="Clear"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-1.5 text-[13px] text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              ×
            </button>
          ) : null}
        </div>
        {role ? (
          <button
            onClick={() => setRole(null)}
            className="rounded-md border border-gray-200 bg-white px-2.5 py-2 text-[12px] font-semibold text-gray-600 hover:border-gray-300"
          >
            {ROLES[role]?.label} ×
          </button>
        ) : null}
        {searching ? (
          <span className="text-[12px] text-gray-400">
            {list.length} {list.length === 1 ? 'match' : 'matches'}{role ? ' in ' + ROLES[role]?.label : ' across all roles'}
          </span>
        ) : null}
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
      ) : !role && !searching ? (
        <div className="text-center text-gray-400 text-[13px] py-10 border border-dashed border-gray-200 rounded-lg">
          👆 Select a role above, or search for someone by name or phone
        </div>
      ) : !list.length ? (
        <div className="text-center text-gray-400 text-[13px] py-10 border border-dashed border-gray-200 rounded-lg">
          {searching ? <>Nobody matches “{query}”{role ? ' in ' + ROLES[role].label : ''}.</> : <>No {ROLES[role!].label}s found.</>}
        </div>
      ) : (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2.5">
            {searching ? 'Results' : ROLES[role!].label} · {list.length} {list.length === 1 ? 'member' : 'members'}
          </div>
          {/* 87 Business Managers in a full-height grid pushed everything below
              it (including the inline preview) off-screen. Cap it and let the
              list scroll inside its own box instead of the page. */}
          <div className="max-h-[560px] overflow-y-auto rounded-lg pr-0.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
            {list.map((p) => (
              <a
                key={p.email}
                href={`/site-audit-view?p=${encodePerson(p.email)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`group flex items-center gap-2.5 rounded-lg border bg-white px-3 py-2.5 transition-all hover:border-[#EAB308] hover:shadow-sm ${
                  previewing?.person.email === p.email ? 'border-[#EAB308] ring-1 ring-[#EAB308]' : 'border-gray-200'
                }`}
              >
                <div
                  className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-bold"
                  style={{ background: avatarColor(p.name) }}
                >
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-black truncate">{p.name}</div>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[11px] text-gray-400 truncate">{subtitleFor(p)}</span>
                    {/* Only when results span roles — inside a single role it
                        would repeat the heading on all 87 cards. */}
                    {searching && !role ? (
                      <span className="shrink-0 rounded-full bg-gray-100 px-1.5 text-[9.5px] font-semibold uppercase tracking-wide text-gray-500">
                        {ROLES[p.role]?.label || p.role}
                      </span>
                    ) : null}
                  </div>
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
  /* Same read-only switcher SiteAuditOwnDashboard gives a COE — this preview
     shouldn't be the one place a COE's Service Manager visibility doesn't
     reach. */
  const [coeShowServiceMgr, setCoeShowServiceMgr] = useState(false);
  /* Attribution fallback if the previewed profile has no name on file — the
     CRM viewer's own session name, same pattern as SiteAuditOwnDashboard's
     crmName / site-audit-view's page-level fallback. */
  const [crmName, setCrmName] = useState('');
  useEffect(() => {
    try {
      const stored = localStorage.getItem('materialdepot_user');
      setCrmName(stored ? JSON.parse(stored)?.name || '' : '');
    } catch { setCrmName(''); }
  }, []);

  const actingAs = { id: person.id, name: person.name, email: person.email };

  const renderServiceMgrDashboard = () => (
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
        <SiteAuditInstallOpsView city={city} attribution={person.name || crmName} />
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
            <SiteAuditOpsView city={city} attribution={person.name || crmName} />
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

  if (shadowing) return <SiteShadowerApp actingAs={actingAs} />;
  if (person.role === 'bm') return <SiteAuditBmView bm={{ id: person.id, name: person.name, email: person.email, contact: person.contact || undefined }} />;
  if (person.role === 'coe') {
    return (
      <div>
        <div className="mb-4 flex justify-end">
          <button
            onClick={() => setCoeShowServiceMgr((v) => !v)}
            className="rounded-md bg-purple-50 px-3 py-1.5 text-[12.5px] font-extrabold text-purple-700 cursor-pointer"
          >
            {coeShowServiceMgr ? '← Their dashboard' : 'Service Manager dashboard →'}
          </button>
        </div>
        {coeShowServiceMgr ? renderServiceMgrDashboard() : <SiteAuditCoeView city={city} who={person.name} whoEmail={person.email} />}
      </div>
    );
  }
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

  if (person.role === 'service_mgr') return renderServiceMgrDashboard();

  return <div className="py-6 text-center text-[13px] text-gray-400">No dashboard for this role.</div>;
}
