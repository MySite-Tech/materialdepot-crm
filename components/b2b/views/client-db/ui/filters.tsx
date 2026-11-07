'use client';

import { Search } from 'lucide-react';
import { fmtShortINR } from '../../../models/mock-data';
import { MultiSelect } from '../../../../crm/ui/inputs';
import { CLIENT_COLUMNS, CLIENT_LENS, FIXED_FILTER_OPTIONS, TEXT_FILTERS } from '../constants';
import { ClientColumn, ClientFilters, ClientLens, FilterKey, FilterOption } from '../types';
import { filterChips, filterColumnLabel } from '../utils';

const controlCls = (on: boolean) =>
  `w-full min-w-[90px] px-1.5 py-1 text-[11px] normal-case tracking-normal font-normal rounded border outline-none ${on ? 'border-[#0F766E] bg-teal-50 text-[#0F766E] font-semibold' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400'}`;

export function ColumnFilter({ k, value, options, disabled, onChange }: {
  k: FilterKey;
  value: string;
  options?: FilterOption[];
  disabled?: string;
  onChange: (v: string) => void;
}) {
  const placeholder = TEXT_FILTERS[k];
  if (placeholder !== undefined) {
    return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={`Filter ${filterColumnLabel(k)}`} className={controlCls(!!value.trim())} />;
  }
  const list = [...(FIXED_FILTER_OPTIONS[k] ?? []), ...(options ?? [])];
  return (
    <select value={value} disabled={!!disabled} title={disabled} onChange={(e) => onChange(e.target.value)} aria-label={`Filter ${filterColumnLabel(k)}`} className={controlCls(!!value) + ' cursor-pointer disabled:opacity-50'}>
      <option value="">{disabled ? 'Unknown' : 'All'}</option>
      {list.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
    </select>
  );
}

export function ClientFilterBar({ f, options, search, setSearch, onClear, visible, onColumns }: {
  f: ClientFilters;
  options: Partial<Record<FilterKey, FilterOption[]>>;
  search: string;
  setSearch: (v: string) => void;
  onClear: () => void;
  visible: Set<ClientColumn>;
  onColumns: (keys: ClientColumn[]) => void;
}) {
  const dirty = !!search.trim() || filterChips(f, options).length > 0;
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
      <span className="text-[11px] text-gray-400">Filter any column from the row under its heading.</span>
      {dirty && (
        <button onClick={onClear} className="text-[12px] font-semibold text-gray-500 hover:text-gray-900 px-1">Clear all</button>
      )}
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-gray-400">Columns</span>
        <MultiSelect
          options={CLIENT_COLUMNS.map((c) => c.label)}
          selected={CLIENT_COLUMNS.filter((c) => visible.has(c.key)).map((c) => c.label)}
          onChange={(labels) => onColumns(CLIENT_COLUMNS.filter((c) => labels.includes(c.label)).map((c) => c.key))}
          label="Firm only"
        />
      </div>
    </div>
  );
}

export function ListHead({ lens, shown, total, revenue, unread, f, options, search, onLens, onFilter, onSearch, onClearAll }: {
  lens: ClientLens;
  shown: number;
  total: number;
  revenue: number;
  unread: number;
  f: ClientFilters;
  options: Partial<Record<FilterKey, FilterOption[]>>;
  search: string;
  onLens: (l: ClientLens) => void;
  onFilter: (k: FilterKey) => void;
  onSearch: () => void;
  onClearAll: () => void;
}) {
  const meta = CLIENT_LENS[lens];
  const q = search.trim();
  const chips = [
    ...(lens === 'all' ? [] : [{ id: 'lens', label: meta.title, clear: () => onLens('all') }]),
    ...filterChips(f, options).map((c) => ({ id: c.key, label: c.label, clear: () => onFilter(c.key) })),
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
