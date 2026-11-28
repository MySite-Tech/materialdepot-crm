'use client';

import { ReactNode } from 'react';

import { CLIENT_TYPES, INBOUND_LOCATIONS, INBOUND_STATUSES, INBOUND_WINDOW_START, LEAD_TYPES, PRIORITIES } from '../../../constants/inbound';
import { NEW_KYLAS_STAGES } from '../../../models/mock-data';
import { FilterBar, FilterField } from '../../../ui/filter-bar';
import { InboundFilters } from '../types';

const opts = (xs: readonly string[]) => xs.map((x) => ({ v: x, t: x }));

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
  const fields: FilterField[] = [
    ...(ownerOptions ? [{ key: 'owner', label: 'Owner', value: f.owner, options: opts(ownerOptions) }] : []),
    { key: 'status', label: 'Status', value: f.status, options: opts(INBOUND_STATUSES) },
    { key: 'priority', label: 'Priority', value: f.priority, options: opts(PRIORITIES) },
    { key: 'clientType', label: 'Client type', value: f.clientType, options: opts(CLIENT_TYPES) },
    { key: 'leadType', label: 'Lead type', value: f.leadType, options: opts(LEAD_TYPES) },
    { key: 'location', label: 'City', value: f.location, options: opts(INBOUND_LOCATIONS) },
    { key: 'kylasStage', label: 'Kylas tag', value: f.kylasStage, options: NEW_KYLAS_STAGES.map((s) => ({ v: String(s.id), t: s.label })) },
  ];
  return (
    <FilterBar
      search={search}
      onSearch={setSearch}
      onSubmitSearch={onSearch}
      placeholder="Search company, name or phone"
      fields={fields}
      onSet={(key, v) => set({ [key]: v } as Partial<InboundFilters>)}
      dates={{
        label: 'Lead date',
        from: f.createdFrom,
        to: f.createdTo,
        min: INBOUND_WINDOW_START,
        onChange: (from, to) => set({ createdFrom: from, createdTo: to }),
      }}
      onClearAll={onClear}
      right={aside}
      note={search.trim() ? 'Press Enter to also search Kylas for leads not yet in the CRM' : undefined}
    />
  );
}
