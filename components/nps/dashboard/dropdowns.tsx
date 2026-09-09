'use client';

import { C, DATE_PRESETS, PILL } from '../constants/nps';
import { presetRange } from '../utils/nps';
import { useEffect, useState } from 'react';

export function MultiDropdown({ label, dot, accent, options, selected, onChange, searchable }: {
  label: string; dot: string; accent: string; options: string[]; selected: string[];
  onChange: (v: string[]) => void; searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const shown = searchable && q ? options.filter(o => o.toLowerCase().includes(q.toLowerCase())) : options;
  const toggle = (o: string) => onChange(selected.includes(o) ? selected.filter(x => x !== o) : [...selected, o]);
  const btnLabel = selected.length === 0 ? label : selected.length === 1 ? selected[0] : `${selected.length} selected`;
  return (
    <div className="relative">
      <button className={PILL} onClick={() => setOpen(o => !o)}>
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dot }} />
        {btnLabel}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => { setOpen(false); setQ(''); }} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] p-2 min-w-[240px]">
            {searchable && (
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…"
                className="w-full mb-2 border border-gray-300 rounded-md px-2 py-1.5 text-[12.5px] outline-none focus:border-gray-400" />
            )}
            <div className="max-h-[260px] overflow-y-auto flex flex-col">
              {shown.length === 0 && <div className="text-[12.5px] text-gray-400 px-2 py-3 text-center">No options</div>}
              {shown.map(o => {
                const on = selected.includes(o);
                return (
                  <button key={o} onClick={() => toggle(o)} className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-gray-50 text-left text-[13px] text-gray-700 cursor-pointer">
                    <span className="w-4 h-4 rounded border border-gray-300 flex items-center justify-center shrink-0" style={on ? { background: accent, borderColor: accent } : {}}>
                      {on && <span className="text-white text-[10px] leading-none">✓</span>}
                    </span>
                    {o}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-between border-t border-gray-100 mt-2 pt-2">
              <button onClick={() => onChange([])} className="text-[13px] font-semibold text-gray-500 hover:text-gray-700 cursor-pointer">Clear</button>
              <button onClick={() => { setOpen(false); setQ(''); }} className="text-[13px] font-semibold text-blue-600 cursor-pointer">Done</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function DateDropdown({ from, to, preset, onApply }: { from: string; to: string; preset: string; onApply: (f: string, t: string, p: string) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  useEffect(() => { setF(from); setT(to); }, [from, to, open]);
  const label = DATE_PRESETS.find(p => p.key === preset)?.label ?? `${from} → ${to}`;
  return (
    <div className="relative">
      <button className={PILL} onClick={() => setOpen(o => !o)}>
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: C.passive }} />
        {label}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] p-2 min-w-[280px]">
            {DATE_PRESETS.map(p => (
              <button key={p.key} onClick={() => { const r = presetRange(p.key); onApply(r.from, r.to, p.key); setOpen(false); }}
                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-[13px] hover:bg-gray-50 cursor-pointer ${preset === p.key ? 'text-gray-900 font-semibold' : 'text-gray-600'}`}>
                {p.label}{preset === p.key && <span className="text-blue-500">✓</span>}
              </button>
            ))}
            <div className="flex gap-2 border-t border-gray-100 mt-2 pt-2">
              <input type="date" value={f} onChange={e => setF(e.target.value)} className="flex-1 min-w-0 border border-gray-300 rounded-md px-2 py-1.5 text-[12.5px] outline-none" />
              <input type="date" value={t} onChange={e => setT(e.target.value)} className="flex-1 min-w-0 border border-gray-300 rounded-md px-2 py-1.5 text-[12.5px] outline-none" />
            </div>
            <button onClick={() => { if (f && t && f <= t) { onApply(f, t, 'custom'); setOpen(false); } }}
              className="w-full mt-2 py-1.5 rounded-md bg-blue-500 text-white text-[13px] font-semibold hover:bg-blue-600 cursor-pointer">Apply custom range</button>
          </div>
        </>
      )}
    </div>
  );
}
