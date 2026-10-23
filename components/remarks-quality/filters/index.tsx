'use client';

import { useState } from 'react';

import { emptyFilters } from '../constants';
import type { Dataset, Filters, Thresholds } from '../types';
import { DATE_DEFS, MULTI_DEFS, optionLabel } from '../utils/filtering';
import { DateRangeFilter } from './date-range';
import { MultiSelect } from './multi-select';

const TOGGLES: Array<{ k: 'auto' | 'lost' | 'walk' | 'copyNothing'; label: string; title: string }> = [
  { k: 'auto', label: 'Include system stamps', title: 'Auto-written remarks like "order_placed", "Deal marked lost: …", "order_lost: …" — excluded by default' },
  { k: 'lost', label: 'Include Order Lost leads', title: 'Leads already marked Order Lost are excluded from scoring by default (picking Order Lost in the Status filter also shows them)' },
  { k: 'walk', label: 'Walk-in leads only', title: 'Only remarks on leads whose client visited a store (footfall) in the selected period. Report cards: visited that day. Footfall data covers the last 35 days' },
  { k: 'copyNothing', label: 'Count copy-pastes as Nothing', title: 'When on, a remark pasted on 2+ leads the same day counts as Nothing, whatever its length' },
];

function ThresholdInputs({ value, onChange }: { value: Thresholds; onChange: (t: Thresholds) => void }) {
  const [draft, setDraft] = useState(value.map(String));
  const commit = (next: string[]) => {
    setDraft(next);
    const [a, b, c] = next.map(x => parseInt(x, 10));
    if (a > 0 && b > a && c > b) onChange([a, b, c]);
  };
  const box = (i: number) => (
    <input value={draft[i]} inputMode="numeric" aria-label={`${['Nothing', 'Minimal', 'Sufficient'][i]} up to (chars)`} onChange={e => commit(draft.map((x, j) => (j === i ? e.target.value : x)))}
      className="w-11 text-center border border-gray-200 rounded-md px-1 py-0.5" />
  );
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5 text-[12px] text-gray-500">
      Nothing ≤ {box(0)} chars · Minimal ≤ {box(1)} · Sufficient ≤ {box(2)} · Detailed above
    </div>
  );
}

export function FilterBar({ ds, filters, setFilters, thresholds, setThresholds, hideDate }: {
  ds: Dataset;
  filters: Filters;
  setFilters: (f: Filters) => void;
  thresholds: Thresholds;
  setThresholds: (t: Thresholds) => void;
  hideDate: boolean;
}) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters({ ...filters, [k]: v });
  const chips = MULTI_DEFS.filter(d => filters[d.k].length);
  const dirty = chips.length > 0 || !!filters.minVal || TOGGLES.some(t => filters[t.k])
    || DATE_DEFS.some(d => filters[d.k][0] || filters[d.k][1]);

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-2 items-center">
        {!hideDate && <DateRangeFilter label="Remark date" value={filters.date} onChange={v => set('date', v)} presetDays={ds.days} />}
        {MULTI_DEFS.slice(0, 5).map(d => <MultiSelect key={d.k} ds={ds} filters={filters} def={d} onChange={v => set(d.k, v as never)} />)}
        {DATE_DEFS.map(d => <DateRangeFilter key={d.k} label={d.label} value={filters[d.k]} onChange={v => set(d.k, v)} />)}
        {MULTI_DEFS.slice(5).map(d => <MultiSelect key={d.k} ds={ds} filters={filters} def={d} onChange={v => set(d.k, v as never)} />)}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
        <input type="number" min={0} placeholder="₹ > 0" aria-label="Minimum cart value (₹)" title="Only leads with a cart value above this" value={filters.minVal} onChange={e => set('minVal', e.target.value)}
          className={`w-[110px] border rounded-lg px-3 py-1.5 text-[12px] ${filters.minVal ? 'border-gray-900 bg-amber-50' : 'border-gray-200 bg-white'}`} />
        {TOGGLES.map(t => (
          <label key={t.k} title={t.title} className="flex items-center gap-1.5 text-[12px] text-gray-600 cursor-pointer select-none">
            <input type="checkbox" checked={filters[t.k]} onChange={e => set(t.k, e.target.checked)} className="accent-amber-500" /> {t.label}
          </label>
        ))}
        {dirty && (
          <button onClick={() => setFilters(emptyFilters(filters.date))}
            className="text-[12px] font-medium text-gray-500 hover:text-gray-900 underline underline-offset-2 cursor-pointer">Reset filters</button>
        )}
      </div>
      <ThresholdInputs value={thresholds} onChange={setThresholds} />
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map(d => {
            const names = (filters[d.k] as Array<number | string>).map(v => optionLabel(ds, d, v));
            return (
              <span key={d.k} className="bg-white border border-gray-200 rounded-full pl-2.5 pr-1.5 py-0.5 text-[12px]">
                <b className="font-semibold">{d.label}:</b>{' '}{names.slice(0, 3).join(', ')}{names.length > 3 ? ` +${names.length - 3}` : ''}
                <button onClick={() => set(d.k, [] as never)} aria-label={`Clear ${d.label} filter`} className="ml-1.5 px-1 text-gray-400 hover:text-gray-900 cursor-pointer">×</button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
