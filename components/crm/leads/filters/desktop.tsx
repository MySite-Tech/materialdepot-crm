'use client';

import { RefObject } from 'react';

import { Download, FileSpreadsheet, FileText, FileType2 } from 'lucide-react';

import { CategoryOption } from '../../../../lib/api/dashboards/weekly-funnel';
import { Lead } from '../../../../types/crm';
import { LEAD_PRIORITIES, STATUSES } from '../../constants';
import { DateRangePicker, MultiSelect } from '../../ui/inputs';
import { ChangeEvent, Dispatch, SetStateAction } from 'react';

export function LeadsFiltersDesktop({ ALL_COLUMNS, availableBMs, branchFilter, branches, cartValueGt, categoryFilter, priorityFilter, setPriorityFilter, categoryOptions, closureDateFrom, closureDateTo, createdDateFrom, createdDateTo, csvFileRef, exportMenuOpen, exportScope, exporting, followUpDateFrom, followUpDateTo, handleCsvFile, isColVisible, leads, leadsTotal, personFilter, runLeadsExport, search, setBranchFilter, setCartValueGt, setCategoryFilter, setClosureDateFrom, setClosureDateTo, setCreatedDateFrom, setCreatedDateTo, setExportMenuOpen, setExportScope, setFollowUpDateFrom, setFollowUpDateTo, setKylasModalInput, setKylasModalResult, setPersonFilter, setSearch, setShowKylasModal, setStatusFilter, setTaskFilter, setVisibleCols, statusFilter, taskFilter, userAllowedBranches }: {
  ALL_COLUMNS: { key: string; label: string; }[];
  availableBMs: string[];
  branchFilter: string[];
  branches: string[];
  cartValueGt: string;
  categoryFilter: string[];
  priorityFilter: string[];
  setPriorityFilter: Dispatch<SetStateAction<string[]>>;
  categoryOptions: CategoryOption[];
  closureDateFrom: string;
  closureDateTo: string;
  createdDateFrom: string;
  createdDateTo: string;
  csvFileRef: RefObject<HTMLInputElement | null>;
  exportMenuOpen: boolean;
  exportScope: "all" | "page";
  exporting: boolean;
  followUpDateFrom: string;
  followUpDateTo: string;
  handleCsvFile: (e: ChangeEvent<HTMLInputElement, Element>) => void;
  isColVisible: (key: string) => boolean;
  leads: Lead[];
  leadsTotal: number;
  personFilter: string[];
  runLeadsExport: (format: "csv" | "excel" | "pdf", scope: "all" | "page") => Promise<void>;
  search: string;
  setBranchFilter: Dispatch<SetStateAction<string[]>>;
  setCartValueGt: Dispatch<SetStateAction<string>>;
  setCategoryFilter: Dispatch<SetStateAction<string[]>>;
  setClosureDateFrom: Dispatch<SetStateAction<string>>;
  setClosureDateTo: Dispatch<SetStateAction<string>>;
  setCreatedDateFrom: Dispatch<SetStateAction<string>>;
  setCreatedDateTo: Dispatch<SetStateAction<string>>;
  setExportMenuOpen: Dispatch<SetStateAction<boolean>>;
  setExportScope: Dispatch<SetStateAction<"all" | "page">>;
  setFollowUpDateFrom: Dispatch<SetStateAction<string>>;
  setFollowUpDateTo: Dispatch<SetStateAction<string>>;
  setKylasModalInput: Dispatch<SetStateAction<string>>;
  setKylasModalResult: Dispatch<SetStateAction<{ loading?: boolean | undefined; ok?: boolean | undefined; msg?: string | undefined; link?: string | undefined; } | null>>;
  setPersonFilter: Dispatch<SetStateAction<string[]>>;
  setSearch: Dispatch<SetStateAction<string>>;
  setShowKylasModal: Dispatch<SetStateAction<boolean>>;
  setStatusFilter: Dispatch<SetStateAction<string[]>>;
  setTaskFilter: Dispatch<SetStateAction<string>>;
  setVisibleCols: Dispatch<SetStateAction<string[]>>;
  statusFilter: string[];
  taskFilter: string;
  userAllowedBranches: string[];
}) {
  return (
    <div className="hidden sm:flex flex-col gap-2 py-3">
    
      <div className="flex items-center gap-2">
        <input
          className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-[380px]"
          placeholder="Search leads..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-2 items-center ml-auto">
          <MultiSelect options={ALL_COLUMNS.map((c) => c.label)} selected={ALL_COLUMNS.filter((c) => isColVisible(c.key)).map((c) => c.label)} onChange={(labels) => { const keys = ALL_COLUMNS.filter((c) => labels.includes(c.label)).map((c) => c.key); setVisibleCols(keys); localStorage.setItem('materialdepot_cols', JSON.stringify(keys)); }} label="Columns" />
          <div className="relative">
            <button className="inline-flex items-center gap-1.5 bg-white text-gray-700 border border-gray-200 px-4 py-2 rounded-md text-[13px] font-medium cursor-pointer whitespace-nowrap hover:bg-gray-50 disabled:opacity-50 disabled:cursor-default" disabled={exporting} onClick={() => setExportMenuOpen((o) => !o)}>
              <Download size={15} strokeWidth={2} className={exporting ? 'animate-pulse' : ''} />
              {exporting ? 'Exporting…' : 'Download'}
              <svg width="10" height="10" viewBox="0 0 10 10" className={`ml-0.5 text-gray-400 transition-transform ${exportMenuOpen ? 'rotate-180' : ''}`}><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            {exportMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setExportMenuOpen(false)} />
                <div className="absolute right-0 mt-1.5 w-64 bg-white border border-gray-200 rounded-lg shadow-xl ring-1 ring-black/5 z-50 overflow-hidden">
                  <div className="px-3.5 pt-3 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Export leads</div>
    
                  <div className="px-3 pb-2.5 pt-1">
                    <div className="flex p-0.5 bg-gray-100 rounded-md text-[12px] font-medium">
                      <button className={`flex-1 px-2 py-1.5 rounded transition-colors cursor-pointer ${exportScope === 'all' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`} onClick={() => setExportScope('all')}>
                        All <span className="opacity-60">({leadsTotal})</span>
                      </button>
                      <button className={`flex-1 px-2 py-1.5 rounded transition-colors cursor-pointer ${exportScope === 'page' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`} onClick={() => setExportScope('page')}>
                        This page <span className="opacity-60">({leads.length})</span>
                      </button>
                    </div>
                    <p className="mt-1.5 text-[11px] text-gray-400 leading-tight px-0.5">
                      {exportScope === 'all' ? 'Every lead matching your current filters.' : 'Only the leads on the current page.'}
                    </p>
                  </div>
                  <div className="border-t border-gray-100" />
    
                  <div className="py-1">
                    {([
                      { fmt: 'csv' as const, label: 'CSV', ext: '.csv', Icon: FileText, color: 'text-sky-600', bg: 'bg-sky-50' },
                      { fmt: 'excel' as const, label: 'Excel', ext: '.xlsx', Icon: FileSpreadsheet, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                      { fmt: 'pdf' as const, label: 'PDF', ext: '.pdf', Icon: FileType2, color: 'text-rose-600', bg: 'bg-rose-50' },
                    ]).map(({ fmt, label, ext, Icon, color, bg }) => (
                      <button key={fmt} className="group w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer text-left" onClick={() => runLeadsExport(fmt, exportScope)}>
                        <span className={`flex items-center justify-center w-7 h-7 rounded-md ${bg} ${color}`}><Icon size={15} strokeWidth={2} /></span>
                        <span className="text-[13px] font-medium text-gray-700">{label}</span>
                        <span className="ml-auto text-[11px] text-gray-400 font-mono group-hover:text-gray-500">{ext}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <button className="bg-white text-gray-700 border border-gray-200 px-4 py-2 rounded-md text-[13px] font-medium cursor-pointer" onClick={() => csvFileRef.current?.click()}>Upload CSV</button>
          <input ref={csvFileRef} type="file" accept=".csv" className="hidden" onChange={handleCsvFile} />
          <button className="bg-white text-gray-700 border border-gray-200 px-4 py-2 rounded-md text-[13px] font-medium cursor-pointer whitespace-nowrap" onClick={() => { setShowKylasModal(true); setKylasModalInput(''); setKylasModalResult(null); }}>Kylas Sync</button>
    
        </div>
      </div>
    
      <div className="flex gap-1.5 items-center [&>*]:shrink">
        <MultiSelect options={STATUSES} selected={statusFilter} onChange={setStatusFilter} label="Status" />
        <MultiSelect options={availableBMs} selected={personFilter.filter((p) => availableBMs.includes(p))} onChange={setPersonFilter} label="Salesperson" searchable />
        {userAllowedBranches.length === 1 ? (
          <span className="px-2 py-1.5 text-[12px] border border-gray-200 rounded-md bg-gray-50 text-gray-500 whitespace-nowrap">{userAllowedBranches[0]}</span>
        ) : userAllowedBranches.length > 1 ? (
          <MultiSelect options={userAllowedBranches} selected={branchFilter} onChange={setBranchFilter} label="Branch" />
        ) : (
          <MultiSelect options={branches} selected={branchFilter} onChange={setBranchFilter} label="Branch" />
        )}
        <DateRangePicker label="Created" dateFrom={createdDateFrom} dateTo={createdDateTo} onChange={(from, to) => { setCreatedDateFrom(from); setCreatedDateTo(to); }} />
        <DateRangePicker label="Follow-up" dateFrom={followUpDateFrom} dateTo={followUpDateTo} onChange={(from, to) => { setFollowUpDateFrom(from); setFollowUpDateTo(to); }} />
        <DateRangePicker label="Closure" dateFrom={closureDateFrom} dateTo={closureDateTo} onChange={(from, to) => { setClosureDateFrom(from); setClosureDateTo(to); }} />
        <MultiSelect options={categoryOptions.map((c) => c.name)} selected={categoryFilter} onChange={setCategoryFilter} label="Category" searchable />
        <MultiSelect options={LEAD_PRIORITIES.map((lp) => lp.charAt(0).toUpperCase() + lp.slice(1))} selected={priorityFilter.map((lp) => lp.charAt(0).toUpperCase() + lp.slice(1))} onChange={(labels) => setPriorityFilter(labels.map((l) => l.toLowerCase()))} label="Priority" />
        <div className="flex items-center gap-1 border border-gray-200 rounded-md px-2 bg-white shrink-0">
          <span className="text-[11px] font-semibold text-gray-400">₹&gt;</span>
          <input
            className="py-1.5 text-[12px] outline-none font-sans w-[60px] font-mono bg-transparent"
            type="text"
            inputMode="numeric"
            placeholder="0"
            value={cartValueGt ? Number(cartValueGt).toLocaleString('en-IN') : ''}
            onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setCartValueGt(v); }}
          />
          {cartValueGt !== '' && (
            <button className="text-gray-400 hover:text-gray-600 cursor-pointer bg-transparent border-none text-[12px] leading-none" onClick={() => setCartValueGt('')}>✕</button>
          )}
        </div>
        <select
          className="px-2 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none font-sans bg-white cursor-pointer shrink-0"
          value={taskFilter}
          onChange={(e) => setTaskFilter(e.target.value)}
        >
          <option value="">Tasks</option>
          <option value="followup_pending">Follow-up Pending</option>
          <option value="closure_pending">Closure Pending</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>
    </div>
  );
}
