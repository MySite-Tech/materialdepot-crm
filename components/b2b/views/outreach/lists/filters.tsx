'use client';

import { COMPANY_TYPES, LEAD_TYPES, OUTREACH_SOURCES, SEGMENTS } from '../../../models/outreach';
import { NO_FILTERS } from '../constants';
import { BmOption, OutreachFilters } from '../types';
import { ReactNode } from 'react';
import { FilterBar, FilterField } from '../../../ui/filter-bar';

const SELECTS: [string, keyof OutreachFilters, readonly string[], (v: string) => string][] = [
  ['Client type', 'companyType', COMPANY_TYPES, (v) => v],
  ['Segment', 'segment', SEGMENTS, (v) => `Segment ${v}`],
  ['Lead type', 'leadType', LEAD_TYPES, (v) => v],
  ['Source', 'source', [...OUTREACH_SOURCES, 'none'], (v) => (v === 'none' ? 'Source not set' : v)],
];

export function Toolbar({ f, set, onSearch, bm, period, periodNote, periodWarn, right }: {
  f: OutreachFilters;
  set: (patch: Partial<OutreachFilters>) => void;
  onSearch: (q: string) => void;
  bm?: { options: BmOption[]; value: string; onChange: (name: string) => void } | null;
  period?: ReactNode;
  periodNote?: string;
  periodWarn?: boolean;
  right?: ReactNode;
}) {
  const bmField: FilterField[] = bm
    ? [{ key: 'bm', label: 'BM', value: bm.value, any: `All (${bm.options.reduce((n, o) => n + o.leads, 0)})`,
      options: bm.options.map((o) => ({ v: o.rep.name, t: `${o.rep.name} (${o.leads})${o.onTeam ? '' : ' · not on the team'}` })) }]
    : [];
  const fields: FilterField[] = [
    ...bmField,
    ...SELECTS.map(([label, key, opts, show]) => ({ key, label, value: f[key] as string, options: opts.map((o) => ({ v: o, t: show(o) })) })),
  ];
  return (
    <FilterBar
      search={f.search}
      onSearch={onSearch}
      placeholder="Search firm, contact, phone, Enq ID or BM"
      lead={period}
      fields={fields}
      onSet={(key, v) => (key === 'bm' ? bm?.onChange(v) : set({ [key]: v } as Partial<OutreachFilters>))}
      toggles={[{ key: 'gaps', label: 'Missing details', on: f.onlyGaps, onChange: (on) => set({ onlyGaps: on }) }]}
      onClearAll={() => { set({ ...NO_FILTERS, search: f.search }); bm?.onChange('all'); }}
      right={right}
      note={periodNote && <span className={periodWarn ? 'text-amber-700' : undefined}>{periodNote}</span>}
    />
  );
}
