'use client';

import { CategoryOption } from '../../../lib/api/dashboards/weekly-funnel';
import { Lead } from '../../../types/crm';
import { STATUS_COLORS } from '../constants';
import { LeadsFiltersDesktop } from './filters/desktop';
import { LeadsFiltersMobile } from './filters/mobile';
import { LeadsCardList } from './table/cards';
import { LeadsStats } from './table/stats';
import { LeadsTable } from './table';
import { DateEditState } from '../types';
import { fmtINR } from '../utils';
import { ChangeEvent, Dispatch, RefObject, SetStateAction } from 'react';

export function LeadsPanel({ ALL_COLUMNS, COL_COUNT, activeCount, availableBMs, branchFilter, branches, cartValueGt, categoryFilter, priorityFilter, setPriorityFilter, categoryOptions, closureDateFrom, closureDateTo, createdDateFrom, createdDateTo, csvFileRef, exportMenuOpen, exportScope, exporting, filtered, filteredTotal, followUpDateFrom, followUpDateTo, handleCsvFile, handleKylasSync, handleSort, isClosureOverdue, isColVisible, isOverdue, kylasSync, leads, leadsLoading, leadsTotal, lostCount, pageSize, paginatedRows, pctActive, pctLost, pctWon, personFilter, pipelineActive, pipelineLost, pipelineTotal, pipelineWon, runLeadsExport, safePage, search, setBranchFilter, setCartValueGt, setCategoryFilter, setClosureDateFrom, setClosureDateTo, setCreatedDateFrom, setCreatedDateTo, setDateEditPopup, setDrawerLead, setExportMenuOpen, setExportScope, setFollowUpDateFrom, setFollowUpDateTo, setKylasModalInput, setKylasModalResult, setPage, setPageSize, setPersonFilter, setSearch, setShowKylasModal, setShowMobileFilters, setStatusFilter, setTaskFilter, setVisibleCols, showMobileFilters, sortCol, sortDir, sorted, stageSummary, statsLoading, statusFilter, taskFilter, totalPages, userAllowedBranches, wonCount }: {
  ALL_COLUMNS: { key: string; label: string; }[];
  COL_COUNT: number;
  activeCount: number;
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
  filtered: Lead[];
  filteredTotal: number;
  followUpDateFrom: string;
  followUpDateTo: string;
  handleCsvFile: (e: ChangeEvent<HTMLInputElement, Element>) => void;
  handleKylasSync: (leadId: string) => Promise<void>;
  handleSort: (col: string) => void;
  isClosureOverdue: (l: Lead) => boolean;
  isColVisible: (key: string) => boolean;
  isOverdue: (l: Lead) => boolean;
  kylasSync: Record<string, { loading?: boolean | undefined; ok?: boolean | undefined; msg?: string | undefined; }>;
  leads: Lead[];
  leadsLoading: boolean;
  leadsTotal: number;
  lostCount: number;
  pageSize: number;
  paginatedRows: Lead[];
  pctActive: number;
  pctLost: number;
  pctWon: number;
  personFilter: string[];
  pipelineActive: number;
  pipelineLost: number;
  pipelineTotal: number;
  pipelineWon: number;
  runLeadsExport: (format: "csv" | "excel" | "pdf", scope: "all" | "page") => Promise<void>;
  safePage: number;
  search: string;
  setBranchFilter: Dispatch<SetStateAction<string[]>>;
  setCartValueGt: Dispatch<SetStateAction<string>>;
  setCategoryFilter: Dispatch<SetStateAction<string[]>>;
  setClosureDateFrom: Dispatch<SetStateAction<string>>;
  setClosureDateTo: Dispatch<SetStateAction<string>>;
  setCreatedDateFrom: Dispatch<SetStateAction<string>>;
  setCreatedDateTo: Dispatch<SetStateAction<string>>;
  setDateEditPopup: Dispatch<SetStateAction<DateEditState | null>>;
  setDrawerLead: Dispatch<SetStateAction<Lead | null>>;
  setExportMenuOpen: Dispatch<SetStateAction<boolean>>;
  setExportScope: Dispatch<SetStateAction<"all" | "page">>;
  setFollowUpDateFrom: Dispatch<SetStateAction<string>>;
  setFollowUpDateTo: Dispatch<SetStateAction<string>>;
  setKylasModalInput: Dispatch<SetStateAction<string>>;
  setKylasModalResult: Dispatch<SetStateAction<{ loading?: boolean | undefined; ok?: boolean | undefined; msg?: string | undefined; link?: string | undefined; } | null>>;
  setPage: Dispatch<SetStateAction<number>>;
  setPageSize: Dispatch<SetStateAction<number>>;
  setPersonFilter: Dispatch<SetStateAction<string[]>>;
  setSearch: Dispatch<SetStateAction<string>>;
  setShowKylasModal: Dispatch<SetStateAction<boolean>>;
  setShowMobileFilters: Dispatch<SetStateAction<boolean>>;
  setStatusFilter: Dispatch<SetStateAction<string[]>>;
  setTaskFilter: Dispatch<SetStateAction<string>>;
  setVisibleCols: Dispatch<SetStateAction<string[]>>;
  showMobileFilters: boolean;
  sortCol: string;
  sortDir: "asc" | "desc";
  sorted: Lead[];
  stageSummary: { status: string; count: number; value: number; }[];
  statsLoading: boolean;
  statusFilter: string[];
  taskFilter: string;
  totalPages: number;
  userAllowedBranches: string[];
  wonCount: number;
}) {
  return (
    <div className="px-3 py-3 sm:px-6 sm:py-4">
      <LeadsStats
      activeCount={activeCount}
      filtered={filtered}
      lostCount={lostCount}
      pctActive={pctActive}
      pctLost={pctLost}
      pctWon={pctWon}
      pipelineActive={pipelineActive}
      pipelineLost={pipelineLost}
      pipelineTotal={pipelineTotal}
      pipelineWon={pipelineWon}
      statsLoading={statsLoading}
      wonCount={wonCount}
    />
    
      <div className="flex gap-3 mt-3 overflow-x-auto pb-1">
        {stageSummary.map((ss) => {
          return (
            <div
              key={ss.status}
              className="bg-white rounded-lg px-4 py-3 border-[1.5px] text-center min-w-[130px] flex-[1_0_140px] border-gray-200"
            >
              {statsLoading
                ? <div className="h-7 w-10 bg-gray-200 rounded animate-pulse mx-auto" />
                : <div className="text-2xl font-bold text-gray-700">{ss.count}</div>
              }
              <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 mt-0.5">{ss.status}</div>
              <div className="font-mono text-[11px] font-semibold mt-1 min-h-[16px]" style={{ color: STATUS_COLORS[ss.status] }}>
                {!statsLoading && ss.value > 0 ? fmtINR(ss.value) : ''}
              </div>
            </div>
          );
        })}
      </div>
    
      <LeadsFiltersMobile
      availableBMs={availableBMs}
      branchFilter={branchFilter}
      branches={branches}
      cartValueGt={cartValueGt}
      categoryFilter={categoryFilter}
      priorityFilter={priorityFilter}
      setPriorityFilter={setPriorityFilter}
      categoryOptions={categoryOptions}
      closureDateFrom={closureDateFrom}
      closureDateTo={closureDateTo}
      createdDateFrom={createdDateFrom}
      createdDateTo={createdDateTo}
      followUpDateFrom={followUpDateFrom}
      followUpDateTo={followUpDateTo}
      personFilter={personFilter}
      search={search}
      setBranchFilter={setBranchFilter}
      setCartValueGt={setCartValueGt}
      setCategoryFilter={setCategoryFilter}
      setClosureDateFrom={setClosureDateFrom}
      setClosureDateTo={setClosureDateTo}
      setCreatedDateFrom={setCreatedDateFrom}
      setCreatedDateTo={setCreatedDateTo}
      setFollowUpDateFrom={setFollowUpDateFrom}
      setFollowUpDateTo={setFollowUpDateTo}
      setPersonFilter={setPersonFilter}
      setSearch={setSearch}
      setShowMobileFilters={setShowMobileFilters}
      setStatusFilter={setStatusFilter}
      setTaskFilter={setTaskFilter}
      showMobileFilters={showMobileFilters}
      statusFilter={statusFilter}
      taskFilter={taskFilter}
      userAllowedBranches={userAllowedBranches}
    />
    
      <LeadsFiltersDesktop
      ALL_COLUMNS={ALL_COLUMNS}
      availableBMs={availableBMs}
      branchFilter={branchFilter}
      branches={branches}
      cartValueGt={cartValueGt}
      categoryFilter={categoryFilter}
      priorityFilter={priorityFilter}
      setPriorityFilter={setPriorityFilter}
      categoryOptions={categoryOptions}
      closureDateFrom={closureDateFrom}
      closureDateTo={closureDateTo}
      createdDateFrom={createdDateFrom}
      createdDateTo={createdDateTo}
      csvFileRef={csvFileRef}
      exportMenuOpen={exportMenuOpen}
      exportScope={exportScope}
      exporting={exporting}
      followUpDateFrom={followUpDateFrom}
      followUpDateTo={followUpDateTo}
      handleCsvFile={handleCsvFile}
      isColVisible={isColVisible}
      leads={leads}
      leadsTotal={leadsTotal}
      personFilter={personFilter}
      runLeadsExport={runLeadsExport}
      search={search}
      setBranchFilter={setBranchFilter}
      setCartValueGt={setCartValueGt}
      setCategoryFilter={setCategoryFilter}
      setClosureDateFrom={setClosureDateFrom}
      setClosureDateTo={setClosureDateTo}
      setCreatedDateFrom={setCreatedDateFrom}
      setCreatedDateTo={setCreatedDateTo}
      setExportMenuOpen={setExportMenuOpen}
      setExportScope={setExportScope}
      setFollowUpDateFrom={setFollowUpDateFrom}
      setFollowUpDateTo={setFollowUpDateTo}
      setKylasModalInput={setKylasModalInput}
      setKylasModalResult={setKylasModalResult}
      setPersonFilter={setPersonFilter}
      setSearch={setSearch}
      setShowKylasModal={setShowKylasModal}
      setStatusFilter={setStatusFilter}
      setTaskFilter={setTaskFilter}
      setVisibleCols={setVisibleCols}
      statusFilter={statusFilter}
      taskFilter={taskFilter}
      userAllowedBranches={userAllowedBranches}
    />
    
      <LeadsCardList
      isOverdue={isOverdue}
      leadsLoading={leadsLoading}
      paginatedRows={paginatedRows}
      setDrawerLead={setDrawerLead}
    />
    
      <LeadsTable
      COL_COUNT={COL_COUNT}
      filtered={filtered}
      filteredTotal={filteredTotal}
      handleKylasSync={handleKylasSync}
      handleSort={handleSort}
      isClosureOverdue={isClosureOverdue}
      isColVisible={isColVisible}
      isOverdue={isOverdue}
      kylasSync={kylasSync}
      leadsLoading={leadsLoading}
      paginatedRows={paginatedRows}
      setDateEditPopup={setDateEditPopup}
      setDrawerLead={setDrawerLead}
      sortCol={sortCol}
      sortDir={sortDir}
    />
    
      {totalPages > 1 && (
        <div className="flex flex-col  sm:flex-row items-center sm:justify-between mt-3 px-1 gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 hidden sm:inline">Rows per page:</span>
            <select className="px-2 py-1 text-xs border border-gray-200 rounded outline-none" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={75}>75</option>
              <option value={100}>100</option>
            </select>
            <span className="text-xs text-gray-400">
              {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, leadsTotal || sorted.length)} of {leadsTotal || sorted.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button className="px-2.5 py-1 text-xs border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40 disabled:cursor-default hover:bg-gray-50 hidden sm:block" disabled={safePage === 0} onClick={() => setPage(0)}>First</button>
            <button className="px-2.5 py-1 text-xs border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40 disabled:cursor-default hover:bg-gray-50" disabled={safePage === 0} onClick={() => setPage((p) => p - 1)}>Prev</button>
            <span className="text-xs text-gray-600 px-2">Page {safePage + 1} of {totalPages}</span>
            <button className="px-2.5 py-1 text-xs border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40 disabled:cursor-default hover:bg-gray-50" disabled={safePage >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
            <button className="px-2.5 py-1 text-xs border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40 disabled:cursor-default hover:bg-gray-50 hidden sm:block" disabled={safePage >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>Last</button>
          </div>
        </div>
      )}
    </div>
  );
}
