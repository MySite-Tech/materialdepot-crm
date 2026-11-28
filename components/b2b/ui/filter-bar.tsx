'use client';

import { ReactNode } from 'react';

export interface FilterField {
  key: string;
  label: string;
  value: string;
  options: { v: string; t: string }[];
  any?: string;
}

export interface FilterDates {
  label: string;
  from: string;
  to: string;
  min?: string;
  onChange: (from: string, to: string) => void;
}

export interface FilterToggle {
  key: string;
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}

const ANY = 'all';

const chipBase = 'inline-flex items-center rounded-full border text-[12px] whitespace-nowrap transition-colors';
const chipOff = 'border-gray-200 bg-white text-gray-600 hover:border-gray-400';
const chipOn = 'border-[#0F766E] bg-teal-50 text-[#0F766E]';

function Chip({ f, onSet }: { f: FilterField; onSet: (key: string, v: string) => void }) {
  const on = f.value !== ANY;
  return (
    <span className={`${chipBase} ${on ? chipOn : chipOff}`}>
      <label className="flex items-center gap-1 pl-2.5 pr-1 py-1 cursor-pointer">
        <span className={on ? 'font-medium' : ''}>{f.label}</span>
        <select
          value={f.value}
          onChange={(e) => onSet(f.key, e.target.value)}
          aria-label={f.label}
          className={`bg-transparent outline-none cursor-pointer max-w-[190px] [field-sizing:content] ${on ? 'font-medium' : 'text-gray-400'}`}
        >
          <option value={ANY}>{f.any ?? 'Any'}</option>
          {f.options.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
        </select>
      </label>
      {on && (
        <button onClick={() => onSet(f.key, ANY)} aria-label={`Clear ${f.label}`} className="pr-2.5 pl-0.5 py-1 opacity-60 hover:opacity-100">×</button>
      )}
    </span>
  );
}

function Dates({ d }: { d: FilterDates }) {
  const on = !!(d.from || d.to);
  const input = 'bg-transparent outline-none text-[12px] w-[118px]';
  return (
    <span className={`${chipBase} ${on ? chipOn : chipOff} gap-1 pl-2.5 py-0.5 ${on ? 'pr-0' : 'pr-2.5'}`}>
      <span className={on ? 'font-medium' : ''}>{d.label}</span>
      <input type="date" aria-label={`${d.label} from`} min={d.min} max={d.to || undefined} value={d.from} onChange={(e) => d.onChange(e.target.value, d.to)} className={input} />
      <span className="text-gray-400">to</span>
      <input type="date" aria-label={`${d.label} to`} min={d.from || d.min} value={d.to} onChange={(e) => d.onChange(d.from, e.target.value)} className={input} />
      {on && <button onClick={() => d.onChange('', '')} aria-label={`Clear ${d.label}`} className="pr-2.5 pl-0.5 opacity-60 hover:opacity-100">×</button>}
    </span>
  );
}

export function FilterBar({ search, onSearch, onSubmitSearch, placeholder, lead, fields, onSet, dates, toggles = [], onClearAll, right, note }: {
  search: string;
  onSearch: (q: string) => void;
  onSubmitSearch?: (q: string) => void;
  placeholder: string;
  lead?: ReactNode;
  fields: FilterField[];
  onSet: (key: string, v: string) => void;
  dates?: FilterDates;
  toggles?: FilterToggle[];
  onClearAll: () => void;
  right?: ReactNode;
  note?: ReactNode;
}) {
  const active = fields.filter((f) => f.value !== ANY).length + (dates && (dates.from || dates.to) ? 1 : 0) + toggles.filter((t) => t.on).length;
  return (
    <div className="mb-3 flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <form onSubmit={(e) => { e.preventDefault(); onSubmitSearch?.(search.trim()); }} className="relative w-full sm:w-[300px]">
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={placeholder}
            aria-label="Search"
            className="w-full pl-2.5 pr-7 py-1.5 text-[12.5px] border border-gray-200 rounded-md outline-none bg-white focus:border-[#0F766E]"
          />
          {search && (
            <button type="button" onClick={() => { onSearch(''); onSubmitSearch?.(''); }} aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-sm leading-none">×</button>
          )}
        </form>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {lead}
        {fields.map((f) => <Chip key={f.key} f={f} onSet={onSet} />)}
        {dates && <Dates d={dates} />}
        {toggles.map((t) => (
          <button key={t.key} onClick={() => t.onChange(!t.on)} aria-pressed={t.on} className={`${chipBase} ${t.on ? chipOn : chipOff} px-2.5 py-1 ${t.on ? 'font-medium' : ''}`}>
            {t.label}{t.on && <span className="ml-1 opacity-60">×</span>}
          </button>
        ))}
        {active > 0 && (
          <button onClick={onClearAll} className="ml-1 text-[12px] font-medium text-gray-500 hover:text-gray-900 whitespace-nowrap">
            Clear {active > 1 ? `all ${active}` : 'filter'}
          </button>
        )}
        {note && <span className="text-[11.5px] text-gray-400">{note}</span>}
      </div>
    </div>
  );
}
