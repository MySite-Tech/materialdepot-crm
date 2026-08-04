'use client';

import { useEffect, useState } from 'react';
import { sbGet } from './siteAuditShared';

/* Role/person picker mirroring the original Admin Console's Role Viewer. The
   original embeds an iframe and swaps localStorage to impersonate a login —
   that trick only works same-origin, so from the CRM we can only point the
   user at the real Admin Console to finish the preview there. */

const ADMIN_CONSOLE_URL = 'https://material-depot-site.vercel.app/Admin.html';
const STORE_TEAM_APP_URL = 'https://material-depot-site.vercel.app/Store_Team_App.html';

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
        <p className="text-[13px] text-gray-400 mt-0.5">Pick a role and person, then open the Admin Console to preview what they see when they log in.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
        {ROLE_ORDER.map((k) => {
          // Store Team is a shared per-store kiosk tool, not a per-person login —
          // link straight out to it, same as the Overview page's "public link" card,
          // instead of feeding it into the role/person picker below.
          if (k === 'store_staff') {
            return (
              <a
                key={k}
                href={STORE_TEAM_APP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-[#EAB308] bg-white p-4 text-center cursor-pointer transition-colors hover:bg-yellow-50"
              >
                <div className="text-2xl mb-2">{ROLES[k].ico}</div>
                <div className="text-sm font-semibold text-black">{ROLES[k].label}</div>
                <div className="text-[11px] font-semibold text-[#EAB308] mt-0.5">Open (public link) ↗</div>
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

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        {!role ? (
          <div className="text-center text-gray-400 text-[13px] py-8">👆 Select a role above to preview their dashboard</div>
        ) : !list.length ? (
          <div className="text-center text-gray-400 text-[13px] py-8">No {ROLES[role].label}s found.</div>
        ) : !person ? (
          <div className="text-center text-gray-400 text-[13px] py-8">👆 Select a person above to view their dashboard</div>
        ) : (
          <div className="text-center py-6">
            <div className="text-sm font-semibold text-black">{person.name}</div>
            <div className="text-[12px] text-gray-400 mt-0.5">{person.email} · {ROLES[person.role]?.label || person.role}</div>
            <p className="text-[12px] text-gray-400 mt-3 max-w-md mx-auto">
              Impersonated previews only work within the Admin Console itself (it swaps your session locally to load their view) —
              open it, then pick <b>{ROLES[person.role]?.label || person.role}</b> → <b>{person.name}</b> there.
            </p>
            <a
              href={ADMIN_CONSOLE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-4 bg-[#EAB308] text-white border-none px-4 py-2 rounded-md text-[13px] font-semibold cursor-pointer hover:opacity-90"
            >
              Open Admin Console ↗
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
