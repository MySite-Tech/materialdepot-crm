'use client';

import { ReactNode, useState } from 'react';

import { B2B_FRESH_START } from '../../../../../lib/b2b';
import { CLIENT_TYPES, INBOUND_LOCATIONS, INBOUND_STATUSES, LEAD_TYPES, PRIORITIES } from '../../../constants/inbound';
import { NEW_KYLAS_STAGES } from '../../../models/mock-data';
import { inputCls } from '../../../constants/ui';
import { InboundFilters } from '../types';
import { activeFilterCount } from '../utils';

const label = 'block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1';
const control = 'px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white min-w-[130px]';

export function InboundFilterBar({ f, set, onClear, ownerOptions, search, setSearch, onSearch, aside }: {
  f: InboundFilters;
  set: (patch: Partial<InboundFilters>) => void;
  onClear: () => void;
  ownerOptions: string[] | null;
  search: string;
  setSearch: (v: string) => void;
  onSearch: (q: string) => void;
  aside: ReactNode;
}) {
  const active = activeFilterCount(f);
  const [open, setOpen] = useState(active > 0);
  const selects: [string, string, keyof InboundFilters, { v: string; t: string }[]][] = [
    ['Status', 'All statuses', 'status', INBOUND_STATUSES.map((s) => ({ v: s, t: s }))],
    ['Priority', 'All priorities', 'priority', PRIORITIES.map((s) => ({ v: s, t: s }))],
    ...(ownerOptions ? [['Owner', 'All owners', 'owner', ownerOptions.map((s) => ({ v: s, t: s }))] as [string, string, keyof InboundFilters, { v: string; t: string }[]]] : []),
    ['Client type', 'All client types', 'clientType', CLIENT_TYPES.map((s) => ({ v: s, t: s }))],
    ['Lead type', 'All lead types', 'leadType', LEAD_TYPES.map((s) => ({ v: s, t: s }))],
    ['Location', 'All locations', 'location', INBOUND_LOCATIONS.map((s) => ({ v: s, t: s }))],
    ['Kylas tag', 'All tags', 'kylasStage', NEW_KYLAS_STAGES.map((s) => ({ v: String(s.id), t: s.label }))],
  ];

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 flex-wrap">
        <form
          onSubmit={(e) => { e.preventDefault(); onSearch(search.trim()); }}
          className="relative w-full sm:w-[320px]"
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company, name or phone, then Enter"
            className={`${inputCls} pr-7`}
          />
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); onSearch(''); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-sm leading-none"
            >×</button>
          )}
        </form>
        <button
          onClick={() => setOpen((o) => !o)}
          className={`px-3 py-1.5 text-[12px] font-semibold rounded-md border whitespace-nowrap ${active ? 'border-[#0F766E] text-[#0F766E] bg-teal-50' : 'border-gray-200 text-gray-600 bg-white hover:border-gray-400'}`}
        >
          Filters{active ? ` · ${active}` : ''} {open ? '▴' : '▾'}
        </button>
        {active > 0 && (
          <button onClick={onClear} className="text-[11.5px] font-semibold text-gray-500 hover:text-gray-800 whitespace-nowrap">Clear</button>
        )}
        <div className="ml-auto">{aside}</div>
      </div>

      {open && (
        <div className="mt-2 bg-white rounded-lg border border-gray-200 p-3 flex items-end gap-2.5 flex-wrap">
          {selects.map(([name, all, key, opts]) => (
            <div key={key}>
              <label className={label}>{name}</label>
              <select value={f[key]} onChange={(e) => set({ [key]: e.target.value })} className={control}>
                <option value="all">{all}</option>
                {opts.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
              </select>
            </div>
          ))}
          <div>
            <label className={label}>Lead date from</label>
            <input type="date" min={B2B_FRESH_START} value={f.createdFrom} onChange={(e) => set({ createdFrom: e.target.value })} className={control} />
          </div>
          <div>
            <label className={label}>to</label>
            <input type="date" min={B2B_FRESH_START} value={f.createdTo} onChange={(e) => set({ createdTo: e.target.value })} className={control} />
          </div>
        </div>
      )}
    </div>
  );
}
