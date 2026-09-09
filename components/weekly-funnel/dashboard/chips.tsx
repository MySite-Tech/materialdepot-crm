'use client';

import { useState } from 'react';

import { fmtDateChip } from '../utils/weekly-funnel';

export function FilterChip({
  label, options, selected, onChange, color,
}: {
  label: string; options: string[]; selected: string[];
  onChange: (v: string[]) => void; color?: { active: string };
}) {
  const [open, setOpen] = useState(false);
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  const active = selected.length > 0;
  const c = color || { active: '#3B82F6' };
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        style={active ? { background: c.active, borderColor: c.active, color: '#fff' } : {}}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border transition-all ${
          active ? 'shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
        }`}
      >
        {!active && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.active }} />}
        {active ? `${label}: ${selected.join(', ')}` : label}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] min-w-[170px] max-h-[220px] overflow-y-auto py-1">
            {options.map((opt, i) => (
              <label key={i} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-[12px] text-gray-700">
                <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} style={{ accentColor: c.active }} />
                {opt}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function BMFilterChip({
  selected, onChange, options, color,
}: {
  selected: string[]; onChange: (v: string[]) => void;
  options: { name: string; contact: string }[]; color?: { active: string };
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const c = color || { active: '#8B5CF6' };
  const active = selected.length > 0;

  const visible = search.trim()
    ? options.filter(o =>
        o.name.toLowerCase().includes(search.toLowerCase()) ||
        o.contact.includes(search)
      )
    : options;

  const toggle = (contact: string) =>
    onChange(selected.includes(contact) ? selected.filter(x => x !== contact) : [...selected, contact]);

  const selectedLabels = selected
    .map(c => options.find(o => o.contact === c)?.name || c)
    .join(', ');

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(o => !o); setSearch(''); }}
        style={active ? { background: c.active, borderColor: c.active, color: '#fff' } : {}}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border transition-all ${
          active ? 'shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
        }`}
      >
        {!active && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.active }} />}
        {active ? `BM: ${selectedLabels}` : 'BM'}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] min-w-[200px] flex flex-col" style={{ maxHeight: 260 }}>
            <div className="px-2 pt-2 pb-1 border-b border-gray-100 shrink-0">
              <input
                autoFocus
                type="text"
                placeholder="Search BM…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onClick={e => e.stopPropagation()}
                className="w-full border border-gray-200 rounded px-2 py-1 text-[12px] text-gray-700 placeholder-gray-400 outline-none bg-white"
              />
            </div>
            <div className="overflow-y-auto py-1 flex-1">
              {visible.length === 0 && (
                <div className="px-3 py-2 text-[12px] text-gray-400">No match</div>
              )}
              {visible.map((o, i) => (
                <label key={o.contact || i} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-[12px] text-gray-700">
                  <input
                    type="checkbox"
                    checked={selected.includes(o.contact)}
                    onChange={() => toggle(o.contact)}
                    style={{ accentColor: c.active }}
                  />
                  <span>{o.name}</span>
                  {o.contact && <span className="text-gray-400 font-normal ml-auto">{o.contact}</span>}
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function DateRangeChip({
  from, to, onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = !!(from && to);
  const today = new Date().toISOString().split('T')[0];

  const label = active
    ? `${fmtDateChip(from)} → ${fmtDateChip(to)}`
    : (from || to)
      ? `${from ? fmtDateChip(from) : '…'} → ${to ? fmtDateChip(to) : '…'}`
      : 'Date';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        style={active ? { background: '#F59E0B', borderColor: '#F59E0B', color: '#fff' } : {}}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border transition-all ${
          active ? 'shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
        }`}
      >
        {!active && <span className="w-2 h-2 rounded-full shrink-0 bg-amber-400" />}
        {label}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] p-3 space-y-2 min-w-[220px]">
            <div className="text-[10px] text-gray-500 uppercase font-semibold">Date range</div>
            <div className="text-[10px] text-gray-400 leading-snug">
              W-0 is the 7 days ending on <span className="font-semibold">To</span>. Earlier weeks shift back 7 days each.
            </div>
            <label className="block text-[10px] text-gray-500 uppercase font-semibold mt-1">From</label>
            <input
              type="date"
              value={from}
              max={to || today}
              onChange={e => onChange(e.target.value, to)}
              className="border border-gray-200 bg-white text-gray-700 rounded px-2 py-1 text-[11px] outline-none w-full"
            />
            <label className="block text-[10px] text-gray-500 uppercase font-semibold mt-1">To (anchor)</label>
            <input
              type="date"
              value={to}
              min={from || undefined}
              max={today}
              onChange={e => onChange(from, e.target.value)}
              className="border border-gray-200 bg-white text-gray-700 rounded px-2 py-1 text-[11px] outline-none w-full"
            />
            {(from || to) && (
              <button
                onClick={() => { onChange('', ''); setOpen(false); }}
                className="block text-[11px] text-red-500 hover:text-red-600 cursor-pointer border border-red-200 rounded px-2 py-0.5 w-full text-center hover:bg-red-50"
              >
                Clear range
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
