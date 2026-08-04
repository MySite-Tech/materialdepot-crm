'use client';

import { useEffect, useState } from 'react';
import { sbGet } from './siteAuditShared';
import SiteAuditorApp from './SiteAuditorApp';
import SiteInstallerApp from './SiteInstallerApp';

/* Role/person picker mirroring the original Admin Console's Role Viewer. The
   original embeds an iframe and swaps localStorage to impersonate a login;
   that trick only works same-origin, so instead we render the native
   Auditor/Installer apps directly, passing the selected person in as
   `actingAs`. Service Manager has no native app yet — no external site is
   linked from here either; it just shows as unavailable until one is built. */

const ROLES: Record<string, { label: string; ico: string }> = {
  service_mgr: { label: 'Service Manager', ico: '📋' },
  site_auditor: { label: 'Site Auditor', ico: '🔍' },
  installer: { label: 'Site Installer', ico: '🔧' },
  auditor_installer: { label: 'Auditor + Installer', ico: '🔍🔧' },
  store_staff: { label: 'Store Team', ico: '🏪' },
};
const ROLE_ORDER = ['service_mgr', 'site_auditor', 'installer', 'auditor_installer', 'store_staff'];

type Person = { id: string; name: string; email: string; role: string };

export default function SiteAuditRoleViewerView({ onOpenStoreTeam }: { onOpenStoreTeam: () => void }) {
  const [persons, setPersons] = useState<Record<string, Person[]>>({});
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [personEmail, setPersonEmail] = useState<string | null>(null);
  const [combinedView, setCombinedView] = useState<'auditor' | 'installer'>('auditor');

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
          // it lives in this same tab bar as "Store Booking" (native, no impersonation
          // needed), so jump straight there instead of feeding it into the picker below.
          if (k === 'store_staff') {
            return (
              <button
                key={k}
                onClick={onOpenStoreTeam}
                className="rounded-lg border border-[#EAB308] bg-white p-4 text-center cursor-pointer transition-colors hover:bg-yellow-50"
              >
                <div className="text-2xl mb-2">{ROLES[k].ico}</div>
                <div className="text-sm font-semibold text-black">{ROLES[k].label}</div>
                <div className="text-[11px] font-semibold text-[#EAB308] mt-0.5">Open Store Booking →</div>
              </button>
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
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="text-center py-6">
            <div className="text-sm font-semibold text-black">{person.name}</div>
            <div className="text-[12px] text-gray-400 mt-0.5">{person.email} · {ROLES[person.role]?.label || person.role}</div>
            <p className="text-[12px] text-gray-400 mt-3 max-w-md mx-auto">
              {ROLES[role].label} doesn't have a dashboard in the CRM yet.
            </p>
          </div>
        </div>
      )}
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
