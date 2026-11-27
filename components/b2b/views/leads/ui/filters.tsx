'use client';

import { ALL, LeadFilters, PERIODS, Period, STATES } from '../constants';

const control = 'h-9 border border-gray-200 rounded-md px-2.5 text-[13px] bg-white text-gray-800 outline-none focus:border-gray-400';

export interface SelectSpec {
  key: keyof LeadFilters;
  label: string;
  all: string;
  options: { value: string; label: string; group?: string }[];
}

function Select({ spec, value, onChange }: { spec: SelectSpec; value: string; onChange: (v: string) => void }) {
  const groups = [...new Set(spec.options.map((o) => o.group || ''))];
  const opt = (o: SelectSpec['options'][number]) => <option key={o.value} value={o.value}>{o.label}</option>;
  return (
    <select aria-label={spec.label} value={value} onChange={(e) => onChange(e.target.value)} className={`${control} max-w-[200px] ${value !== ALL ? 'border-gray-500' : ''}`}>
      <option value={ALL}>{spec.all}</option>
      {groups.map((g) => (g
        ? <optgroup key={g} label={g}>{spec.options.filter((o) => o.group === g).map(opt)}</optgroup>
        : spec.options.filter((o) => !o.group).map(opt)))}
    </select>
  );
}

export function LeadFilterBar({ f, set, selects, stateCounts, showUnassigned, active, onClear }: {
  f: LeadFilters;
  set: (patch: Partial<LeadFilters>) => void;
  selects: SelectSpec[];
  stateCounts: Record<string, number>;
  showUnassigned: boolean;
  active: number;
  onClear: () => void;
}) {
  return (
    <div className="px-5 py-3 border-b border-gray-100 flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search" aria-label="Search leads"
          className={`${control} w-full sm:w-64`}
        />
        <select aria-label="Created" value={f.period} onChange={(e) => set({ period: e.target.value as Period })} className={`${control} ${f.period !== ALL ? 'border-gray-500' : ''}`}>
          {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.key === ALL ? 'Created: all time' : `Created: ${p.label.toLowerCase()}`}</option>)}
        </select>
        {f.period === 'custom' && (
          <span className="flex items-center gap-1.5 text-[13px] text-gray-500">
            <input type="date" aria-label="From" value={f.from} onChange={(e) => set({ from: e.target.value })} className={control} />
            to
            <input type="date" aria-label="To" value={f.to} onChange={(e) => set({ to: e.target.value })} className={control} />
          </span>
        )}
        {selects.map((s) => (
          <Select key={s.key} spec={s} value={String(f[s.key])} onChange={(v) => set({ [s.key]: v })} />
        ))}
        {showUnassigned && (
          <label className="h-9 px-2.5 flex items-center gap-2 text-[13px] text-gray-700 border border-gray-200 rounded-md bg-white cursor-pointer">
            <input type="checkbox" checked={f.unassigned} onChange={(e) => set({ unassigned: e.target.checked })} />
            Unassigned
          </label>
        )}
        {active > 0 && (
          <button onClick={onClear} className="h-9 px-3 text-[13px] text-gray-600 hover:text-gray-900">
            Clear filters ({active})
          </button>
        )}
      </div>
      <div role="group" aria-label="Status" className="inline-flex self-start p-0.5 rounded-lg bg-gray-100">
        {STATES.map((s) => {
          const on = f.state === s.key;
          return (
            <button
              key={s.key}
              onClick={() => set({ state: s.key })}
              className={`h-8 px-3 rounded-md flex items-center gap-1.5 text-[13px] ${on ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-800'}`}
            >
              {s.dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />}
              {s.label}
              <span className="tabular-nums text-[12px] text-gray-400">{stateCounts[s.key] ?? 0}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
