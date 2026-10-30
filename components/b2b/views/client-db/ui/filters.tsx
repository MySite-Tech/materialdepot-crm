'use client';

import { Search } from 'lucide-react';
import { CLIENT_ENTITY_TYPES, SEGMENTS } from '../../../models/client';
import { fmtShortINR } from '../../../models/mock-data';
import { CLIENT_LENS } from '../constants';
import { ClientFilters, ClientLens } from '../types';
import { filterChips } from '../utils';

const selectCls = (on: boolean) =>
  `pl-2.5 pr-7 py-1.5 text-[12px] rounded-md border cursor-pointer outline-none ${on ? 'border-[#0F766E] bg-teal-50 text-[#0F766E] font-semibold' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'}`;

export function ClientFilterBar({ f, set, search, setSearch, kamOptions, onClear }: {
  f: ClientFilters;
  set: (patch: Partial<ClientFilters>) => void;
  search: string;
  setSearch: (v: string) => void;
  kamOptions: string[];
  onClear: () => void;
}) {
  const dirty = !!search.trim() || filterChips(f).length > 0;
  return (
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      <div className="relative w-full sm:w-[300px]">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search firm, contact, number or GSTIN"
          className={`w-full pl-7 pr-7 py-1.5 text-[12px] border rounded-md bg-white outline-none focus:border-[#0F766E] ${search ? 'border-[#0F766E]' : 'border-gray-200'}`}
        />
        {search && (
          <button onClick={() => setSearch('')} title="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-sm leading-none">×</button>
        )}
      </div>
      <select value={f.segment} onChange={(e) => set({ segment: e.target.value })} className={selectCls(f.segment !== 'all')}>
        <option value="all">Any segment</option>
        {SEGMENTS.map((s) => <option key={s} value={s}>Segment {s}</option>)}
      </select>
      <select value={f.type} onChange={(e) => set({ type: e.target.value })} className={selectCls(f.type !== 'all')}>
        <option value="all">Any client type</option>
        {CLIENT_ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <select value={f.kam} onChange={(e) => set({ kam: e.target.value })} className={selectCls(f.kam !== 'all')}>
        <option value="all">Any KAM</option>
        {kamOptions.map((k) => <option key={k} value={k}>{k}</option>)}
      </select>
      {dirty && (
        <button onClick={onClear} className="text-[12px] font-semibold text-gray-500 hover:text-gray-900 px-1">Clear all</button>
      )}
    </div>
  );
}

export function ListHead({ lens, shown, total, revenue, unread, f, search, onLens, onFilter, onSearch, onClearAll }: {
  lens: ClientLens;
  shown: number;
  total: number;
  revenue: number;
  unread: number;
  f: ClientFilters;
  search: string;
  onLens: (l: ClientLens) => void;
  onFilter: (k: keyof ClientFilters) => void;
  onSearch: () => void;
  onClearAll: () => void;
}) {
  const meta = CLIENT_LENS[lens];
  const q = search.trim();
  const chips = [
    ...(lens === 'all' ? [] : [{ id: 'lens', label: meta.title, clear: () => onLens('all') }]),
    ...filterChips(f).map((c) => ({ id: c.key, label: c.label, clear: () => onFilter(c.key) })),
    ...(q ? [{ id: 'q', label: `“${q}”`, clear: onSearch }] : []),
  ];
  return (
    <div className="px-4 py-3 border-b border-gray-200 flex items-start justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.accent }} />
          <h2 className="text-[14px] font-bold text-gray-900">{meta.heading}</h2>
          <span className="text-[12px] text-gray-500 tabular-nums">
            {shown}{shown !== total && ` of ${total}`} firm{total === 1 ? '' : 's'}
            {revenue > 0 && <> · <span className="font-semibold text-gray-700">{fmtShortINR(revenue)}</span> lifetime</>}
            {unread > 0 && <span className="text-blue-500"> · {unread} status unknown</span>}
          </span>
        </div>
        <p className="text-[11px] text-gray-400 mt-0.5">{meta.rule}</p>
      </div>
      {!!chips.length && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {chips.map((c) => (
            <button
              key={c.id}
              onClick={c.clear}
              title="Remove"
              className="inline-flex items-center gap-1 pl-2 pr-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[11px] font-semibold hover:bg-gray-200"
            >
              {c.label}<span className="text-gray-400 text-[13px] leading-none">×</span>
            </button>
          ))}
          {chips.length > 1 && (
            <button
              onClick={onClearAll}
              className="text-[11px] font-semibold text-gray-500 hover:text-gray-900 px-1"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
