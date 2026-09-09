'use client';

import { useEffect, useState } from 'react';
import {
  CATEGORY_ORDER, CATEGORY_TONE, CAT_UNSET, DATE_PRESETS, fmtRangeLabel, presetRange,
  type DatePresetKey, type DateRange,
} from './shared';

export function FrozenBar({ top, setRef, children }: { top: number; setRef: (el: HTMLDivElement | null) => void; children: React.ReactNode }) {
  return (
    <div
      ref={setRef}
      style={{ top }}

      className="sticky z-[40] -mx-1 mb-3 border-b border-gray-200 bg-[#FAFAFA] px-1 pb-2 pt-1 shadow-[0_6px_10px_-8px_rgba(0,0,0,0.25)]"
    >
      {children}
    </div>
  );
}

export function BucketTiles<K extends string>({ buckets, counts, active, onPick }: {
  buckets: Array<{ k: K; l: string }>;
  counts: Record<string, number>;
  active: K;
  onPick: (k: K) => void;
}) {
  const tone = (k: string) =>
    k === 'overdue' ? 'text-red-600'
      : k === 'today' ? 'text-amber-600'
        : k === 'converted' || k === 'done' ? 'text-green-700'
          : 'text-[#1F3A5F]';
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
      {buckets.map((b) => (
        <button
          key={b.k}
          onClick={() => onPick(b.k)}
          className={`rounded-md border px-2 py-1.5 text-left ${active === b.k ? 'border-[#1F3A5F] bg-[#eef3f9]' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
        >
          <div className={`text-[15px] font-extrabold leading-none ${tone(b.k)}`}>{counts[b.k] || 0}</div>
          <div className="mt-0.5 truncate text-[10px] font-semibold leading-tight text-gray-500">{b.l}</div>
        </button>
      ))}
    </div>
  );
}

const PILL = 'flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[12.5px] font-semibold text-gray-700 hover:border-gray-400';

export function DateRangeFilter({ label, preset, range, onChange }: {
  label: string;
  preset: DatePresetKey;
  range: DateRange;
  onChange: (preset: DatePresetKey, range: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  useEffect(() => { setFrom(range.from); setTo(range.to); }, [range.from, range.to, open]);

  const active = preset !== 'all';
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className={active ? PILL + ' !border-[#1F3A5F] !bg-[#eef3f9] !text-[#1F3A5F]' : PILL}>
        <span>📅</span>
        {fmtRangeLabel(preset, range)}
        <span className="text-[9px] opacity-60">▾</span>
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-[61] mt-1.5 min-w-[268px] rounded-lg border border-gray-200 bg-white p-2 shadow-xl">
            <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
            {DATE_PRESETS.map((p) => (
              <button
                key={p.k}
                onClick={() => { onChange(p.k, presetRange(p.k)); setOpen(false); }}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-gray-50 ${preset === p.k ? 'font-semibold text-gray-900' : 'text-gray-600'}`}
              >
                {p.l}{preset === p.k ? <span className="text-blue-500">✓</span> : null}
              </button>
            ))}
            <div className="mt-2 flex gap-2 border-t border-gray-100 pt-2">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="min-w-0 flex-1 rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px] outline-none" />
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="min-w-0 flex-1 rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px] outline-none" />
            </div>
            <button
              onClick={() => { if (from && to && from <= to) { onChange('custom', { from, to }); setOpen(false); } }}
              disabled={!from || !to || from > to}
              className="mt-2 w-full rounded-md bg-[#1F3A5F] py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-40"
            >
              Apply custom range
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function CategoryFilter({ selected, counts, onChange }: {
  selected: string[];
  counts: Record<string, number>;
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const options = [...CATEGORY_ORDER, CAT_UNSET];
  const toggle = (c: string) => onChange(selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c]);
  const label = selected.length === 0 ? 'All categories' : selected.length === 1 ? selected[0] : selected.length + ' categories';
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className={selected.length ? PILL + ' !border-[#1F3A5F] !bg-[#eef3f9] !text-[#1F3A5F]' : PILL}>
        <span>🏷️</span>
        {label}
        <span className="text-[9px] opacity-60">▾</span>
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-[61] mt-1.5 min-w-[240px] rounded-lg border border-gray-200 bg-white p-2 shadow-xl">
            {options.map((c) => {
              const on = selected.includes(c);
              return (
                <button key={c} onClick={() => toggle(c)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-gray-700 hover:bg-gray-50">
                  <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${on ? 'border-[#1F3A5F] bg-[#1F3A5F]' : 'border-gray-300'}`}>
                    {on ? <span className="text-[9px] leading-none text-white">✓</span> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{c}</span>
                  <span className="shrink-0 text-[11.5px] tabular-nums text-gray-400">{counts[c] || 0}</span>
                </button>
              );
            })}
            <div className="mt-2 flex justify-between border-t border-gray-100 pt-2">
              <button onClick={() => onChange([])} className="text-[12.5px] font-semibold text-gray-500 hover:text-gray-700">Clear</button>
              <button onClick={() => setOpen(false)} className="text-[12.5px] font-semibold text-blue-600">Done</button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function CategoryPills({ cats }: { cats: string[] }) {
  if (!cats.length) return <span className="text-gray-400">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {cats.map((c) => {
        const t = CATEGORY_TONE[c] ?? '';
        const style = t === 'wp' ? { background: '#efeaf8', color: '#5b3aa6' }
          : t === 'cwp' ? { background: '#e0f4f4', color: '#0f6e74' }
            : t === 'wpl' ? { background: '#e8f0e2', color: '#40632c' }
              : t === 'cnc' ? { background: '#fbe6ea', color: '#8a2540' }
                : { background: '#fff4d6', color: '#7a5800' };
        return <span key={c} className="inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10.5px] font-bold" style={style}>{c}</span>;
      })}
    </span>
  );
}
