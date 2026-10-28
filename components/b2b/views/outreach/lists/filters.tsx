'use client';

import { OutreachLead } from '../../../models/mock-data';
import { COMPANY_TYPES, LEAD_TYPES, OUTREACH_SOURCES, OUTREACH_STATUSES, OUTREACH_STATUS_LABEL, OutreachStatus, SEGMENTS } from '../../../models/outreach';
import { inputCls } from '../../../ui/inbound-chips';
import { istDay } from '../../../models/outreach/reminders';
import { gapsFor } from '../utils';

export interface OutreachFilters {
  bm: string;
  status: 'all' | OutreachStatus;
  companyType: string;
  leadType: string;
  segment: string;
  source: string;
  createdFrom: string;
  createdTo: string;
  search: string;
  onlyGaps: boolean;
}

export const NO_FILTERS: OutreachFilters = {
  bm: 'all', status: 'all', companyType: 'all', leadType: 'all', segment: 'all', source: 'all',
  createdFrom: '', createdTo: '', search: '', onlyGaps: false,
};

export const activeFilterCount = (f: OutreachFilters): number =>
  (Object.keys(NO_FILTERS) as (keyof OutreachFilters)[]).filter((k) => f[k] !== NO_FILTERS[k]).length;

export function matchesFilters(l: OutreachLead, f: OutreachFilters, bmMatches: (l: OutreachLead) => boolean): boolean {
  if (f.bm !== 'all' && !bmMatches(l)) return false;
  if (f.status !== 'all' && l.status !== f.status) return false;
  if (f.companyType !== 'all' && l.companyType !== f.companyType) return false;
  if (f.leadType !== 'all' && l.leadType !== f.leadType) return false;
  if (f.segment !== 'all' && l.segment !== f.segment) return false;
  if (f.source !== 'all' && (l.source || 'none') !== f.source) return false;
  const created = istDay(l.createdAt);
  if (f.createdFrom && (!created || created < f.createdFrom)) return false;
  if (f.createdTo && (!created || created > f.createdTo)) return false;
  if (f.onlyGaps && gapsFor(l).length === 0) return false;
  const q = f.search.trim().toLowerCase();
  if (q) {
    const hay = [l.company, l.contactPerson, l.phone, l.enqId, l.designation, l.city].filter(Boolean).join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

const label = 'block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1';
const select = 'px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white min-w-[110px]';

export function FilterBar({ f, set, bmOptions }: {
  f: OutreachFilters;
  set: (patch: Partial<OutreachFilters>) => void;
  bmOptions: string[] | null;
}) {
  const active = activeFilterCount(f);
  const selects: [string, string, keyof OutreachFilters, readonly string[], (v: string) => string][] = [
    ['Status', 'All statuses', 'status', OUTREACH_STATUSES, (v) => OUTREACH_STATUS_LABEL[v as OutreachStatus]],
    ...(bmOptions ? [['BM', 'All BMs', 'bm', bmOptions, (v: string) => v] as [string, string, keyof OutreachFilters, readonly string[], (v: string) => string]] : []),
    ['Source', 'All sources', 'source', [...OUTREACH_SOURCES, 'none'], (v) => (v === 'none' ? 'Not set' : v)],
    ['Client type', 'All types', 'companyType', COMPANY_TYPES, (v) => v],
    ['Lead type', 'All lead types', 'leadType', LEAD_TYPES, (v) => v],
    ['Segment', 'All segments', 'segment', SEGMENTS, (v) => v],
  ];
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 mb-4">
      <div className="flex items-end gap-2.5 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className={label}>Search</label>
          <input value={f.search} onChange={(e) => set({ search: e.target.value })} placeholder="Firm, contact, phone, city or Enq ID…" className={inputCls} />
        </div>
        {selects.map(([name, all, key, opts, show]) => (
          <div key={key}>
            <label className={label}>{name}</label>
            <select value={f[key] as string} onChange={(e) => set({ [key]: e.target.value } as Partial<OutreachFilters>)} className={select}>
              <option value="all">{all}</option>
              {opts.map((o) => <option key={o} value={o}>{show(o)}</option>)}
            </select>
          </div>
        ))}
        <div>
          <label className={label}>Created from</label>
          <input type="date" value={f.createdFrom} onChange={(e) => set({ createdFrom: e.target.value })} className={select} />
        </div>
        <div>
          <label className={label}>to</label>
          <input type="date" value={f.createdTo} onChange={(e) => set({ createdTo: e.target.value })} className={select} />
        </div>
        <button
          onClick={() => set({ onlyGaps: !f.onlyGaps })}
          className={`px-3 py-1.5 text-[12px] font-semibold rounded-md border whitespace-nowrap ${
            f.onlyGaps ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-500 border-gray-200 hover:border-amber-400'
          }`}
        >
          ⚠ Needs filling
        </button>
        {active > 0 && (
          <button onClick={() => set(NO_FILTERS)} className="px-3 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white text-gray-500 whitespace-nowrap">
            Clear {active}
          </button>
        )}
      </div>
    </div>
  );
}
