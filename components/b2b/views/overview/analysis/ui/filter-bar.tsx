'use client';

import { fmtL } from '../../../../models/mock-data';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DIM_META, DIM_ORDER } from '../constants';
import type { AnalysisFilter, DimKey, Option } from '../types';
import { filterCount } from '../utils';

const LIST_CAP = 200;

function DimPicker({ dim, options, picked, onChange }: {
  dim: DimKey;
  options: Option[];
  picked: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc); };
  }, [open]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return options.filter((o) => !needle || o.key.toLowerCase().includes(needle)).slice(0, LIST_CAP);
  }, [options, q]);
  const toggle = (key: string) => onChange(picked.includes(key) ? picked.filter((k) => k !== key) : [...picked, key]);

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-lg border cursor-pointer whitespace-nowrap ${
          picked.length ? 'border-[#0F766E] bg-teal-50 text-[#0F766E]' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
        }`}
      >
        {DIM_META[dim].label}
        {!!picked.length && <span className="tabular-nums">· {picked.length}</span>}
        <span aria-hidden className="text-[9px]">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-[280px] max-w-[calc(100vw-32px)] rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${DIM_META[dim].label.toLowerCase()}`}
              className="w-full px-2 py-1 text-[12px] border border-gray-200 rounded-md"
            />
          </div>
          <div className="max-h-[280px] overflow-y-auto py-1">
            {shown.map((o) => (
              <label key={o.key} className="flex items-center gap-2 px-3 py-1.5 text-[12px] cursor-pointer hover:bg-gray-50">
                <input type="checkbox" checked={picked.includes(o.key)} onChange={() => toggle(o.key)} className="accent-[#0F766E]" />
                <span className="truncate flex-1 text-gray-800">{o.key}</span>
                <span className="tabular-nums text-[11px] text-gray-400">{fmtL(o.value)}</span>
              </label>
            ))}
            {!shown.length && <div className="px-3 py-2 text-[12px] text-gray-400">Nothing matches</div>}
            {options.length > LIST_CAP && !q && <div className="px-3 py-1.5 text-[11px] text-gray-400">Search to see the rest of {options.length}</div>}
          </div>
          {!!picked.length && (
            <div className="border-t border-gray-100 px-3 py-1.5">
              <button onClick={() => onChange([])} className="text-[11px] font-semibold text-[#0F766E] cursor-pointer hover:underline">Clear {DIM_META[dim].label.toLowerCase()}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FilterBar({ options, filter, onChange }: {
  options: Record<DimKey, Option[]>;
  filter: AnalysisFilter;
  onChange: (f: AnalysisFilter) => void;
}) {
  const chips = DIM_ORDER.flatMap((d) => (filter[d] ?? []).map((v) => ({ dim: d, v })));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] font-semibold text-gray-400 mr-1">Filter</span>
        {DIM_ORDER.map((d) => (
          <DimPicker key={d} dim={d} options={options[d]} picked={filter[d] ?? []} onChange={(next) => onChange({ ...filter, [d]: next })} />
        ))}
      </div>
      {!!chips.length && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {chips.map(({ dim, v }) => (
            <span key={`${dim}|${v}`} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-gray-100 text-[11px] text-gray-700 max-w-[260px]">
              <span className="text-gray-400 whitespace-nowrap">{DIM_META[dim].label}:</span>
              <span className="truncate font-semibold">{v}</span>
              <button
                aria-label={`Remove ${v}`}
                onClick={() => onChange({ ...filter, [dim]: (filter[dim] ?? []).filter((x) => x !== v) })}
                className="w-4 h-4 rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-700 cursor-pointer leading-none"
              >
                ×
              </button>
            </span>
          ))}
          {filterCount(filter) > 1 && (
            <button onClick={() => onChange({})} className="text-[11px] font-semibold text-[#0F766E] cursor-pointer hover:underline ml-1">Clear all</button>
          )}
        </div>
      )}
    </div>
  );
}
