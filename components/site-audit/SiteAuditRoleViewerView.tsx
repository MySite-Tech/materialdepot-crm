'use client';

import { useEffect, useState } from 'react';
import { encodePerson, sbGet } from './siteAuditShared';

/* Role/person picker mirroring the original Admin Console's Role Viewer. The
   original embeds an iframe and swaps localStorage to impersonate a login;
   that trick only works same-origin, so instead each person links out to
   /site-audit-view (see app/site-audit-view/page.tsx), a chrome-free route
   that renders just their native Auditor/Installer/Service Manager app with
   the CRM header/nav/picker stripped out — a real dashboard-only preview
   rather than an embedded one. */

const ROLES: Record<string, { label: string; ico: string }> = {
  service_mgr: { label: 'Service Manager', ico: '📋' },
  site_auditor: { label: 'Site Auditor', ico: '🔍' },
  installer: { label: 'Site Installer', ico: '🔧' },
  auditor_installer: { label: 'Auditor + Installer', ico: '🔍🔧' },
  store_staff: { label: 'Store Team', ico: '🏪' },
  bm: { label: 'Business Manager', ico: '💼' },
};
const ROLE_ORDER = ['service_mgr', 'site_auditor', 'installer', 'auditor_installer', 'bm', 'store_staff'];

const AVATAR_COLORS = ['#EAB308', '#1F3A5F', '#0EA5E9', '#16A34A', '#DB2777', '#7C3AED', '#EA580C'];
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

type Person = { id: string; name: string; email: string; role: string };

export default function SiteAuditRoleViewerView() {
  const [persons, setPersons] = useState<Record<string, Person[]>>({});
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);

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

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-lg font-bold text-black">Role Viewer</h1>
        <p className="text-[13px] text-gray-400 mt-0.5">Pick a role, then a person, to open their dashboard in a new tab. 👁 opens their shadowing schedule instead.</p>
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
                className="group flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 transition-all hover:border-[#EAB308] hover:shadow-sm"
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
                  title="Open their shadowing schedule"
                  className="shrink-0 rounded-md bg-purple-50 px-1.5 py-1 text-[12px] text-purple-700 hover:bg-purple-100"
                  onClick={(e) => { e.preventDefault(); window.open(`/site-audit-view?p=${encodePerson(p.email)}&view=shadowing`, '_blank', 'noopener'); }}
                >
                  👁
                </span>
                <span className="shrink-0 text-gray-300 text-sm group-hover:text-[#EAB308]">↗</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
