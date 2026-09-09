'use client';

import { fmtChipDate, fmtRangeVal } from './utils';
import { AvailableBM } from '@/lib/api';
import { useState } from 'react';

export function FilterChip({ label, options, selected, onChange, color }: {
  label: string; options: string[]; selected: string[];
  onChange: (v: string[]) => void; color: string;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  const active = selected.length > 0;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        style={active ? { background: color, borderColor: color, color: '#fff' } : {}}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border transition-all ${active ? 'shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}
      >
        {!active && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />}
        {active ? `${label}: ${selected.length === 1 ? selected[0] : selected.length}` : label}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] min-w-[190px] max-h-[240px] overflow-y-auto py-1">
            {options.length === 0 && <div className="px-3 py-2 text-[12px] text-gray-400">No options</div>}
            {options.map((opt, i) => (
              <label key={`${opt}-${i}`} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-[12px] text-gray-700">
                <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} style={{ accentColor: color }} />
                {opt}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function BMFilterChip({ selected, onChange, options, color }: {
  selected: string[]; onChange: (v: string[]) => void;
  options: AvailableBM[]; color: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const active = selected.length > 0;
  const visible = search.trim()
    ? options.filter(o => o.name.toLowerCase().includes(search.toLowerCase()) || o.contact.includes(search))
    : options;
  const toggle = (c: string) => onChange(selected.includes(c) ? selected.filter(x => x !== c) : [...selected, c]);
  const labels = selected.map(c => options.find(o => o.contact === c)?.name || c).join(', ');
  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(o => !o); setSearch(''); }}
        style={active ? { background: color, borderColor: color, color: '#fff' } : {}}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border transition-all ${active ? 'shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}
      >
        {!active && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />}
        {active ? `BM: ${selected.length === 1 ? labels : selected.length}` : 'BM'}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] min-w-[210px] flex flex-col" style={{ maxHeight: 270 }}>
            <div className="px-2 pt-2 pb-1 border-b border-gray-100 shrink-0">
              <input autoFocus type="text" placeholder="Search BM…" value={search}
                onChange={e => setSearch(e.target.value)} onClick={e => e.stopPropagation()}
                className="w-full border border-gray-200 rounded px-2 py-1 text-[12px] text-gray-700 outline-none bg-white" />
            </div>
            <div className="overflow-y-auto py-1 flex-1">
              {visible.length === 0 && <div className="px-3 py-2 text-[12px] text-gray-400">No match</div>}
              {visible.map((o, i) => (
                <label key={o.contact || i} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-[12px] text-gray-700">
                  <input type="checkbox" checked={selected.includes(o.contact)} onChange={() => toggle(o.contact)} style={{ accentColor: color }} />
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

export function CartValueRangeChip({ gt, lt, onChange, color }: {
  gt: string; lt: string; onChange: (gt: string, lt: string) => void; color: string;
}) {
  const [open, setOpen] = useState(false);
  const active = !!(gt || lt);
  const display = active
    ? `Cart Value: ${gt ? fmtRangeVal(Number(gt)) : '₹0'} – ${lt ? fmtRangeVal(Number(lt)) : '∞'}`
    : 'Cart Value';
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        style={active ? { background: color, borderColor: color, color: '#fff' } : {}}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border transition-all ${active ? 'shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}
      >
        {!active && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />}
        {display}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] p-3 space-y-2 min-w-[220px]">
            <div className="text-[10px] text-gray-500 uppercase font-semibold">Cart Value (₹)</div>
            <label className="block text-[10px] text-gray-500 uppercase font-semibold mt-1">Min (greater than)</label>
            <input type="number" inputMode="numeric" min={0} step={1000} value={gt} placeholder="0"
              onChange={e => onChange(e.target.value, lt)}
              className="border border-gray-200 bg-white text-gray-700 rounded px-2 py-1 text-[11px] outline-none w-full" />
            <label className="block text-[10px] text-gray-500 uppercase font-semibold mt-1">Max (less than)</label>
            <input type="number" inputMode="numeric" min={0} step={1000} value={lt} placeholder="No limit"
              onChange={e => onChange(gt, e.target.value)}
              className="border border-gray-200 bg-white text-gray-700 rounded px-2 py-1 text-[11px] outline-none w-full" />
            {active && (
              <button onClick={() => { onChange('', ''); setOpen(false); }}
                className="block text-[11px] text-red-500 hover:text-red-600 cursor-pointer border border-red-200 rounded px-2 py-0.5 w-full text-center hover:bg-red-50">
                Clear range
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function DaysRangeChip({ gt, lt, onChange, color }: {
  gt: string; lt: string; onChange: (gt: string, lt: string) => void; color: string;
}) {
  const [open, setOpen] = useState(false);
  const active = !!(gt || lt);
  const display = active
    ? `Days in Pipeline: ${gt || '0'} – ${lt || '∞'}`
    : 'Days in Pipeline';
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        style={active ? { background: color, borderColor: color, color: '#fff' } : {}}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border transition-all ${active ? 'shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}
      >
        {!active && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />}
        {display}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] p-3 space-y-2 min-w-[220px]">
            <div className="text-[10px] text-gray-500 uppercase font-semibold">Days in Pipeline</div>
            <label className="block text-[10px] text-gray-500 uppercase font-semibold mt-1">Min (at least)</label>
            <input type="number" inputMode="numeric" min={0} step={1} value={gt} placeholder="0"
              onChange={e => onChange(e.target.value, lt)}
              className="border border-gray-200 bg-white text-gray-700 rounded px-2 py-1 text-[11px] outline-none w-full" />
            <label className="block text-[10px] text-gray-500 uppercase font-semibold mt-1">Max (at most)</label>
            <input type="number" inputMode="numeric" min={0} step={1} value={lt} placeholder="No limit"
              onChange={e => onChange(gt, e.target.value)}
              className="border border-gray-200 bg-white text-gray-700 rounded px-2 py-1 text-[11px] outline-none w-full" />
            {active && (
              <button onClick={() => { onChange('', ''); setOpen(false); }}
                className="block text-[11px] text-red-500 hover:text-red-600 cursor-pointer border border-red-200 rounded px-2 py-0.5 w-full text-center hover:bg-red-50">
                Clear range
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function DateRangeChip({ from, to, onChange, label, color }: {
  from: string; to: string; onChange: (from: string, to: string) => void; label: string; color: string;
}) {
  const [open, setOpen] = useState(false);
  const active = !!(from && to);
  const today = new Date().toISOString().split('T')[0];
  const display = active ? `${fmtChipDate(from)} – ${fmtChipDate(to)}` : label;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        style={active ? { background: color, borderColor: color, color: '#fff' } : {}}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border transition-all ${active ? 'shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}
      >
        {!active && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />}
        📅 {display}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] p-3 space-y-2 min-w-[220px]">
            <div className="text-[10px] text-gray-500 uppercase font-semibold">{label}</div>
            <label className="block text-[10px] text-gray-500 uppercase font-semibold mt-1">From</label>
            <input type="date" value={from} max={to || today} onChange={e => onChange(e.target.value, to)}
              className="border border-gray-200 bg-white text-gray-700 rounded px-2 py-1 text-[11px] outline-none w-full" />
            <label className="block text-[10px] text-gray-500 uppercase font-semibold mt-1">To</label>
            <input type="date" value={to} min={from || undefined} max={today} onChange={e => onChange(from, e.target.value)}
              className="border border-gray-200 bg-white text-gray-700 rounded px-2 py-1 text-[11px] outline-none w-full" />
            {(from || to) && (
              <button onClick={() => { onChange('', ''); setOpen(false); }}
                className="block text-[11px] text-red-500 hover:text-red-600 cursor-pointer border border-red-200 rounded px-2 py-0.5 w-full text-center hover:bg-red-50">
                Clear range
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
