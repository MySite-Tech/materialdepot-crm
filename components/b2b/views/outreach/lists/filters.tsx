'use client';

import { COMPANY_TYPES, LEAD_TYPES, OUTREACH_SOURCES, SEGMENTS } from '../../../models/outreach';
import { inputCls } from '../../../constants/ui';
import { NO_FILTERS, RANGE_LABEL } from '../constants';
import { BmOption, OutreachFilters, RangeKey } from '../types';
import { activeFilterCount } from '../utils';
import { ReactNode, useState } from 'react';

const label = 'block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1';
const control = 'px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white min-w-[130px] focus:border-[#0F766E]';
const chip = 'px-2.5 py-1 rounded-full text-[11.5px] font-semibold border whitespace-nowrap';

const ADDED: RangeKey[] = ['any', 'today', 'week', 'last7', 'last30', 'month', 'last-month', 'custom'];

export function BmChips({ options, value, onChange }: {
  options: BmOption[];
  value: string;
  onChange: (name: string) => void;
}) {
  if (options.length > 7) {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={control}>
        <option value="all">All BMs</option>
        {options.map((o) => <option key={o.rep.name} value={o.rep.name}>{`${o.rep.name} (${o.leads})`}</option>)}
      </select>
    );
  }
  const btn = (key: string, text: ReactNode, title?: string) => (
    <button
      key={key}
      onClick={() => onChange(key)}
      title={title}
      className={`${chip} ${value === key ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
    >
      {text}
    </button>
  );
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {btn('all', 'All BMs')}
      {options.map((o) => btn(
        o.rep.name,
        <>{o.rep.name}<span className="tabular-nums opacity-60"> {o.leads}</span></>,
        o.onTeam ? undefined : 'Holds leads but is not on the Outreach team list',
      ))}
    </div>
  );
}

const SELECTS: [string, keyof OutreachFilters, readonly string[], (v: string) => string][] = [
  ['Client type', 'companyType', COMPANY_TYPES, (v) => v],
  ['Segment', 'segment', SEGMENTS, (v) => `Segment ${v}`],
  ['Lead type', 'leadType', LEAD_TYPES, (v) => v],
  ['Source', 'source', [...OUTREACH_SOURCES, 'none'], (v) => (v === 'none' ? 'Source not set' : v)],
];

export function Toolbar({ f, set, onSearch, right }: {
  f: OutreachFilters;
  set: (patch: Partial<OutreachFilters>) => void;
  onSearch: (q: string) => void;
  right?: ReactNode;
}) {
  const active = activeFilterCount(f);
  const [open, setOpen] = useState(false);
  const chips: { key: string; text: string; clear: Partial<OutreachFilters> }[] = [
    ...SELECTS.filter(([, k]) => f[k] !== 'all').map(([, k, , show]) => ({ key: k, text: show(f[k] as string), clear: { [k]: 'all' } })),
    ...(f.added !== 'any' ? [{
      key: 'added',
      text: `Added ${f.added === 'custom' ? `${f.addedFrom || '…'} – ${f.addedTo || '…'}` : RANGE_LABEL[f.added].toLowerCase()}`,
      clear: { added: 'any' as RangeKey, addedFrom: '', addedTo: '' },
    }] : []),
    ...(f.onlyGaps ? [{ key: 'gaps', text: 'Missing details', clear: { onlyGaps: false } }] : []),
  ];

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative w-full sm:w-[300px]">
          <input
            value={f.search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search firm, contact, phone, Enq ID or BM"
            className={`${inputCls} pr-7`}
          />
          {f.search && (
            <button onClick={() => onSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-sm leading-none">×</button>
          )}
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className={`px-3 py-1.5 text-[12px] font-semibold rounded-md border whitespace-nowrap ${active ? 'border-[#0F766E] text-[#0F766E] bg-teal-50' : 'border-gray-200 text-gray-600 bg-white hover:border-gray-400'}`}
        >
          Filters{active ? ` · ${active}` : ''} {open ? '▴' : '▾'}
        </button>
        {chips.map((c) => (
          <button key={c.key} onClick={() => set(c.clear)} title="Remove this filter"
            className={`${chip} bg-teal-50 text-[#0F766E] border-teal-200 hover:border-[#0F766E]`}>
            {c.text} <span className="opacity-60">×</span>
          </button>
        ))}
        {active > 1 && (
          <button onClick={() => set({ ...NO_FILTERS, search: f.search })} className="text-[11.5px] font-semibold text-gray-500 hover:text-gray-800 whitespace-nowrap">Clear all</button>
        )}
        <div className="ml-auto">{right}</div>
      </div>

      {open && (
        <div className="mt-2 bg-white rounded-lg border border-gray-200 p-3">
          <div className="flex items-end gap-2.5 flex-wrap">
            {SELECTS.map(([name, key, opts, show]) => (
              <div key={key}>
                <label className={label}>{name}</label>
                <select value={f[key] as string} onChange={(e) => set({ [key]: e.target.value })} className={control}>
                  <option value="all">Any</option>
                  {opts.map((o) => <option key={o} value={o}>{show(o)}</option>)}
                </select>
              </div>
            ))}
            <div>
              <label className={label}>Lead added</label>
              <select value={f.added} onChange={(e) => set({ added: e.target.value as RangeKey })} className={control}>
                {ADDED.map((k) => <option key={k} value={k}>{RANGE_LABEL[k]}</option>)}
              </select>
            </div>
            {f.added === 'custom' && (
              <>
                <div>
                  <label className={label}>From</label>
                  <input type="date" value={f.addedFrom} onChange={(e) => set({ addedFrom: e.target.value })} className={control} />
                </div>
                <div>
                  <label className={label}>To</label>
                  <input type="date" value={f.addedTo} onChange={(e) => set({ addedTo: e.target.value })} className={control} />
                </div>
              </>
            )}
            <label className="flex items-center gap-1.5 text-[12px] text-gray-600 py-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={f.onlyGaps} onChange={(e) => set({ onlyGaps: e.target.checked })} className="accent-[#0F766E]" />
              Only leads missing details
            </label>
          </div>
          <p className="mt-2 text-[10.5px] text-gray-400">These narrow the tiles and lists below. The scorecard above follows only the BM and its period; a scorecard tile&apos;s list still honours these.</p>
        </div>
      )}
    </div>
  );
}
