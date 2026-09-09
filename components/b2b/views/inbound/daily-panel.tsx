'use client';

import { B2B_INBOUND_OWNER_LIST } from '../../../../lib/api/b2bInbound';
import { B2B_FRESH_START } from '../../../../lib/b2bLeads';
import { CLIENT_TYPES, INBOUND_LOCATIONS, INBOUND_STATUSES, LEAD_TYPES, PRIORITIES } from '../../constants/inbound';
import { NEW_KYLAS_STAGES } from '../../models/mockData';
import { InboundStatus } from '../../types/inbound';
import { inputCls } from '../../utils/kams';
import { Dispatch, SetStateAction } from 'react';

export function InboundDailyPanel({ activeFilters, clearFilters, clientType, createdAfter, createdBefore, leadType, location, newKylasStage, onlyGaps, owner, priority, search, setAppliedSearch, setClientType, setCreatedAfter, setCreatedBefore, setLeadType, setLocation, setNewKylasStage, setOnlyGaps, setOwner, setPriority, setSearch, setStatus, status }: {
  activeFilters: number;
  clearFilters: () => void;
  clientType: string;
  createdAfter: string;
  createdBefore: string;
  leadType: string;
  location: string;
  newKylasStage: number | "all";
  onlyGaps: boolean;
  owner: string;
  priority: "all" | "P1" | "P2" | "P3";
  search: string;
  setAppliedSearch: Dispatch<SetStateAction<string>>;
  setClientType: Dispatch<SetStateAction<string>>;
  setCreatedAfter: Dispatch<SetStateAction<string>>;
  setCreatedBefore: Dispatch<SetStateAction<string>>;
  setLeadType: Dispatch<SetStateAction<string>>;
  setLocation: Dispatch<SetStateAction<string>>;
  setNewKylasStage: Dispatch<SetStateAction<number | "all">>;
  setOnlyGaps: Dispatch<SetStateAction<boolean>>;
  setOwner: Dispatch<SetStateAction<string>>;
  setPriority: Dispatch<SetStateAction<"all" | "P1" | "P2" | "P3">>;
  setSearch: Dispatch<SetStateAction<string>>;
  setStatus: Dispatch<SetStateAction<InboundStatus | "all">>;
  status: InboundStatus | "all";
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 mb-4">
      <div className="flex items-end gap-2.5 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">Search</label>
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') setAppliedSearch(search.trim()); }}
                placeholder="Company, name or phone…"
                className={inputCls}
              />
              {search && (
                <button
                  onClick={() => { setSearch(''); setAppliedSearch(''); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-sm leading-none"
                >×</button>
              )}
            </div>
            <button
              onClick={() => setAppliedSearch(search.trim())}
              className="px-3 py-1.5 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white whitespace-nowrap"
            >Search</button>
          </div>
        </div>
        {([
          ['Status', 'All statuses', status, setStatus, ['all', ...INBOUND_STATUSES]],
          ['Priority', 'All priorities', priority, setPriority, ['all', ...PRIORITIES]],
          ['Assigned BM', 'All BMs', owner, setOwner, ['all', ...B2B_INBOUND_OWNER_LIST.map((o) => o.name)]],
          ['Client type', 'All client types', clientType, setClientType, ['all', ...CLIENT_TYPES]],
          ['Lead type', 'All lead types', leadType, setLeadType, ['all', ...LEAD_TYPES]],
          ['Location', 'All locations', location, setLocation, ['all', ...INBOUND_LOCATIONS]],
        ] as const).map(([label, allLabel, val, setter, opts]) => (
          <div key={label}>
            <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">{label}</label>
            <select
              value={val as string}
              onChange={(e) => (setter as (v: string) => void)(e.target.value)}
              className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white min-w-[120px]"
            >
              {opts.map((o) => <option key={o} value={o}>{o === 'all' ? allLabel : o}</option>)}
            </select>
          </div>
        ))}
        <div>
          <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">Kylas tag</label>
          <select
            value={newKylasStage}
            onChange={(e) => setNewKylasStage(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white min-w-[120px]"
          >
            <option value="all">All tags</option>
            {NEW_KYLAS_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">Lead date from</label>
          <input type="date" min={B2B_FRESH_START} value={createdAfter} onChange={(e) => setCreatedAfter(e.target.value)}
            className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white" />
        </div>
        <div>
          <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">to</label>
          <input type="date" min={B2B_FRESH_START} value={createdBefore} onChange={(e) => setCreatedBefore(e.target.value)}
            className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white" />
        </div>
        <button
          onClick={() => setOnlyGaps((v) => !v)}
          className={`px-3 py-1.5 text-[12px] font-semibold rounded-md border whitespace-nowrap ${
            onlyGaps ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-500 border-gray-200 hover:border-amber-400'
          }`}
        >
          ⚠ Needs enrichment
        </button>
        {activeFilters > 0 && (
          <button onClick={clearFilters} className="px-3 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white text-gray-500 whitespace-nowrap">
            Clear {activeFilters}
          </button>
        )}
      </div>
    </div>
  );
}
