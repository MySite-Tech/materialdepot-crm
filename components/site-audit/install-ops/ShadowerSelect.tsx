'use client';

/* Searchable "Shadowed by" multiselect — React port of the shsel widget in
   material-depot-site's SM_Install_Dashboard / SM_Audit_Dashboard.

   The pool is EVERYONE registered (any role can shadow any job) minus store
   staff, whose kiosk app has no login session and therefore no personal
   shadow schedule. Kept entirely separate from the installer/auditor pickers
   so it can never touch capacity or conflict logic — a shadower only
   observes. Multiple shadowers per job are allowed; they persist comma-joined
   in the existing shadower_email / shadower_name fields. */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Shadower } from '../siteAuditShared';

const ROLE_SHORT: Record<string, string> = {
  admin: 'Admin',
  service_mgr: 'SM',
  site_auditor: 'Auditor',
  installer: 'Installer',
  auditor_installer: 'Auditor+Installer',
  bm: 'BM',
};

export type ShadowerOption = { email: string; name: string; role?: string };

export default function ShadowerSelect({
  label = 'Shadowed by (optional) — search & tick anyone observing this job',
  options,
  value,
  onChange,
}: {
  label?: string;
  options: ShadowerOption[];
  value: Shadower[];
  onChange: (next: Shadower[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [open]);

  const selected = useMemo(() => new Map(value.map((s) => [s.email, s.name])), [value]);

  /* Anyone already saved as a shadower stays listed even if they've since
     been deleted from profiles, so an existing selection is never silently
     dropped by a save. Current picks float to the top. */
  const pool = useMemo(() => {
    const out: ShadowerOption[] = options.slice();
    value.forEach((s) => { if (!out.some((p) => p.email === s.email)) out.push({ email: s.email, name: s.name }); });
    return out.sort((a, b) => (selected.has(b.email) ? 1 : 0) - (selected.has(a.email) ? 1 : 0));
  }, [options, value, selected]);

  const visible = q.trim() ? pool.filter((p) => (p.name || '').toLowerCase().includes(q.trim().toLowerCase())) : pool;
  const names = [...selected.values()];

  function toggle(opt: ShadowerOption) {
    onChange(selected.has(opt.email)
      ? value.filter((s) => s.email !== opt.email)
      : [...value, { email: opt.email, name: opt.name || opt.email }]);
  }

  return (
    <div className="mt-2">
      <label className="block text-[10.5px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{label}</label>
      <div className="relative" ref={wrapRef}>
        <div
          onClick={() => { setOpen((o) => !o); setQ(''); setTimeout(() => searchRef.current?.focus(), 30); }}
          className={`flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-md border bg-white px-2 py-1.5 ${open ? 'border-[#1F3A5F] ring-2 ring-[#1F3A5F]/10' : 'border-gray-200'}`}
        >
          <div className="flex flex-1 flex-wrap gap-1">
            {names.length ? (
              <>
                {names.slice(0, 3).map((n) => <span key={n} className="rounded bg-purple-50 px-1.5 py-0.5 text-[11px] font-bold text-purple-700">{n}</span>)}
                {names.length > 3 ? <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-bold text-gray-600">+{names.length - 3}</span> : null}
              </>
            ) : <span className="text-[12.5px] text-gray-400">Select people…</span>}
          </div>
          <span className="text-gray-400 text-[11px]">▾</span>
        </div>
        {open ? (
          <div className="absolute left-0 right-0 z-30 mt-1 rounded-md border border-gray-200 bg-white shadow-lg">
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder="Search name…"
              className="w-full border-b border-gray-100 px-2.5 py-2 text-[12.5px] outline-none"
            />
            <div className="max-h-[220px] overflow-y-auto">
              {visible.length ? visible.map((p) => (
                <label key={p.email} className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[12.5px] hover:bg-gray-50">
                  <input type="checkbox" className="accent-[#1F3A5F]" checked={selected.has(p.email)} onChange={() => toggle(p)} />
                  <span>{p.name}{p.role && ROLE_SHORT[p.role] ? <span className="text-gray-400"> · {ROLE_SHORT[p.role]}</span> : null}</span>
                </label>
              )) : <div className="px-2.5 py-2 text-[12px] text-gray-400">{pool.length ? 'No matches' : 'No people available'}</div>}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
