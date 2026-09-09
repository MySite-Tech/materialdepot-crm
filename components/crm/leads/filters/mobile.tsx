'use client';

import { CategoryOption } from '../../../../lib/api/dashboards/weekly-funnel';
import { STATUSES } from '../../constants/crm';
import { DateRangePicker, MultiSelect } from '../../ui/inputs';
import { Dispatch, SetStateAction } from 'react';

export function LeadsFiltersMobile({ availableBMs, branchFilter, branches, cartValueGt, categoryFilter, categoryOptions, closureDateFrom, closureDateTo, createdDateFrom, createdDateTo, followUpDateFrom, followUpDateTo, personFilter, search, setBranchFilter, setCartValueGt, setCategoryFilter, setClosureDateFrom, setClosureDateTo, setCreatedDateFrom, setCreatedDateTo, setFollowUpDateFrom, setFollowUpDateTo, setPersonFilter, setSearch, setShowMobileFilters, setStatusFilter, setTaskFilter, showMobileFilters, statusFilter, taskFilter, userAllowedBranches }: {
  availableBMs: string[];
  branchFilter: string[];
  branches: string[];
  cartValueGt: string;
  categoryFilter: string[];
  categoryOptions: CategoryOption[];
  closureDateFrom: string;
  closureDateTo: string;
  createdDateFrom: string;
  createdDateTo: string;
  followUpDateFrom: string;
  followUpDateTo: string;
  personFilter: string[];
  search: string;
  setBranchFilter: Dispatch<SetStateAction<string[]>>;
  setCartValueGt: Dispatch<SetStateAction<string>>;
  setCategoryFilter: Dispatch<SetStateAction<string[]>>;
  setClosureDateFrom: Dispatch<SetStateAction<string>>;
  setClosureDateTo: Dispatch<SetStateAction<string>>;
  setCreatedDateFrom: Dispatch<SetStateAction<string>>;
  setCreatedDateTo: Dispatch<SetStateAction<string>>;
  setFollowUpDateFrom: Dispatch<SetStateAction<string>>;
  setFollowUpDateTo: Dispatch<SetStateAction<string>>;
  setPersonFilter: Dispatch<SetStateAction<string[]>>;
  setSearch: Dispatch<SetStateAction<string>>;
  setShowMobileFilters: Dispatch<SetStateAction<boolean>>;
  setStatusFilter: Dispatch<SetStateAction<string[]>>;
  setTaskFilter: Dispatch<SetStateAction<string>>;
  showMobileFilters: boolean;
  statusFilter: string[];
  taskFilter: string;
  userAllowedBranches: string[];
}) {
  return (
    <div className="sm:hidden py-3 flex flex-col gap-2">
      <div className="flex gap-2 items-center">
        <input
          className="flex-1 min-w-0 px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans"
          placeholder="Search leads..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          onClick={() => setShowMobileFilters(f => !f)}
          className={`relative flex items-center justify-center w-9 h-9 rounded-md border cursor-pointer shrink-0 ${showMobileFilters ? 'bg-[#EAB308] border-[#EAB308] text-white' : 'bg-white border-gray-200 text-gray-600'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/>
          </svg>
          {[statusFilter.length > 0, personFilter.filter(p => availableBMs.includes(p)).length > 0, branchFilter.length > 0, !!(createdDateFrom || createdDateTo), !!(followUpDateFrom || followUpDateTo), !!(closureDateFrom || closureDateTo), cartValueGt !== '', taskFilter !== '', categoryFilter.length > 0].filter(Boolean).length > 0 && !showMobileFilters && (
            <span className="absolute -top-1 -right-1 bg-[#EAB308] text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
              {[statusFilter.length > 0, personFilter.filter(p => availableBMs.includes(p)).length > 0, branchFilter.length > 0, !!(createdDateFrom || createdDateTo), !!(followUpDateFrom || followUpDateTo), !!(closureDateFrom || closureDateTo), cartValueGt !== '', taskFilter !== '', categoryFilter.length > 0].filter(Boolean).length}
            </span>
          )}
        </button>
    
      </div>
      {showMobileFilters && (
        <div className="grid grid-cols-2 gap-2">
          <MultiSelect className="w-full" options={STATUSES} selected={statusFilter} onChange={setStatusFilter} label="Status" />
          <MultiSelect className="w-full" options={availableBMs} selected={personFilter.filter((p) => availableBMs.includes(p))} onChange={setPersonFilter} label="Salesperson" searchable />
          {userAllowedBranches.length === 1 ? (
            <span className="px-2 py-2 text-[12px] border border-gray-200 rounded-md bg-gray-50 text-gray-500 truncate">{userAllowedBranches[0]}</span>
          ) : userAllowedBranches.length > 1 ? (
            <MultiSelect className="w-full" options={userAllowedBranches} selected={branchFilter} onChange={setBranchFilter} label="My Branches" />
          ) : (
            <MultiSelect className="w-full" options={branches} selected={branchFilter} onChange={setBranchFilter} label="Branch" />
          )}
          <DateRangePicker className="w-full" label="Created" dateFrom={createdDateFrom} dateTo={createdDateTo} onChange={(from, to) => { setCreatedDateFrom(from); setCreatedDateTo(to); }} />
          <DateRangePicker className="w-full" label="Follow-up" dateFrom={followUpDateFrom} dateTo={followUpDateTo} onChange={(from, to) => { setFollowUpDateFrom(from); setFollowUpDateTo(to); }} />
          <DateRangePicker className="w-full" label="Closure" dateFrom={closureDateFrom} dateTo={closureDateTo} onChange={(from, to) => { setClosureDateFrom(from); setClosureDateTo(to); }} />
          <MultiSelect className="w-full" options={categoryOptions.map((c) => c.name)} selected={categoryFilter} onChange={setCategoryFilter} label="Category" searchable />
          <input
            className="px-2 py-2 text-[12px] border border-gray-200 rounded-md outline-none font-mono w-full"
            type="text"
            inputMode="numeric"
            placeholder="₹ Min value"
            value={cartValueGt ? Number(cartValueGt).toLocaleString('en-IN') : ''}
            onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setCartValueGt(v); }}
          />
          <select
            className="px-2 py-2 text-[12px] border border-gray-200 rounded-md outline-none font-sans bg-white cursor-pointer w-full"
            value={taskFilter}
            onChange={(e) => setTaskFilter(e.target.value)}
          >
            <option value="">All Tasks</option>
            <option value="followup_pending">Follow-up Pending</option>
            <option value="closure_pending">Closure Pending</option>
            <option value="overdue">Overdue</option>
          </select>
    
        </div>
      )}
    </div>
  );
}
