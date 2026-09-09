'use client';

import { ROLES } from '../../../shared';
import { useState } from 'react';

export function RoleBadge({ role }: { role: string }) {
  const meta = ROLES[role];
  return (
    <span className="inline-block rounded-md px-2 py-0.5 text-[10.5px] font-bold text-white" style={{ background: meta?.color || '#999' }}>
      {meta?.label || role}
    </span>
  );
}

export function BmSearchSelect({ options, disabled, suggested, onPick }: {
  options: Array<{ id: string; name: string; email: string; contact: string | null }>;
  disabled: boolean;
  suggested: string | null;
  onPick: (email: string) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const needle = q.trim().toLowerCase();
  const shown = needle ? options.filter((o) => o.name.toLowerCase().includes(needle)) : options;
  return (
    <div className="relative min-w-[220px]">
      <input
        value={q}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        placeholder={suggested ? 'Suggested: ' + suggested : 'Search a BM…'}
        className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white focus:border-[#0F766E] disabled:opacity-50"
      />
      {open && !disabled ? (
        <div className="absolute z-20 mt-1 max-h-[220px] w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {shown.length ? shown.slice(0, 60).map((o) => (
            <button
              key={o.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setOpen(false); setQ(''); onPick(o.email); }}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] text-gray-800 hover:bg-gray-50"
            >
              <span className="font-semibold">{o.name}</span>

              <span className="ml-auto shrink-0 text-[11px] text-gray-400">{o.contact || 'no phone'}</span>
            </button>
          )) : <div className="px-2.5 py-2 text-[12px] text-gray-400">No BM matches “{q}”.</div>}
        </div>
      ) : null}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[950] flex items-center justify-center bg-black/30 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
          <button className="text-xl text-gray-400" onClick={onClose}>×</button>
        </div>
        <div className="flex flex-col gap-3.5 px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-gray-500">{label}</label>
      {children}
    </div>
  );
}

export function Foot({ children }: { children: React.ReactNode }) {
  return <div className="-mx-5 -mb-4 mt-1 flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3.5">{children}</div>;
}
