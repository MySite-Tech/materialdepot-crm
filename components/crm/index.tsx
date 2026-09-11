'use client';

import { useLeadsView } from './hooks/use-leads-view';

import { CrmModals } from './shell/modals';

import { LeadsPanel } from './leads/panel';
import { CrmToasts } from './shell/toasts';

import { useRestoreSession } from './hooks/use-restore-session';


import { useLeadsData } from './hooks/use-leads-data';

import { makeLeadActions } from './leads/actions';

import { makeLeadsCsv } from './leads/csv/actions';

import { CrmTabPanels } from './shell/tab-panels';
import { CrmHeader } from './shell/header';
import { CrmTabBar } from './shell/tab-bar';

import { CRMLeadsStats, CategoryOption, fetchCategoryOptions, fetchLeadRemarks, fetchLeadVisits } from '../../lib/api';
import { AppUser, Lead } from '../../types/crm';
import { DEFAULT_BRANCHES } from './constants';
import { useDebouncedValue } from './hooks/use-debounced-value';
import { LoginScreen } from './login';
import { CsvRow, DateEditState, MainTab } from './types';
import { resolveAllowedTabs } from './utils';
import { isSiteAuditOversightRole, siteAuditRoleFromPermissions } from '@/components/site-audit/shared';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export default function App() {
  const searchParams = useSearchParams();
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [userLoaded, setUserLoaded] = useState(false);
  const [permsLoaded, setPermsLoaded] = useState(false);
  const VALID_MAIN_TABS: MainTab[] = ['leads', 'dashboard', 'footfall', 'weeklyFunnel', 'reportCard', 'storeVisit', 'storeChecklist', 'sales', 'b2bSales', 'admin', 'nps', 'appointmentTracker', 'siteAudit', 'storeDisplay'];
  const tabFromUrl = searchParams.get('tab') as MainTab | null;
  const initialTab: MainTab = tabFromUrl && VALID_MAIN_TABS.includes(tabFromUrl) ? tabFromUrl : 'leads';
  const [mainTab, setMainTab] = useState<MainTab>(initialTab);

  const allowedTabs = resolveAllowedTabs(currentUser);
  const canSeeAppointmentTracker = allowedTabs.includes('appointmentTracker');

  const effectiveTab: MainTab | null = allowedTabs.includes(mainTab)
    ? mainTab
    : (allowedTabs[0] ?? null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!effectiveTab) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('tab') !== effectiveTab) {
      url.searchParams.set('tab', effectiveTab);
      window.history.replaceState({}, '', url.toString());
    }
  }, [effectiveTab]);

  const siteAuditRole = siteAuditRoleFromPermissions(currentUser?.individualPermissions);
  const siteAuditIsOversight = isSiteAuditOversightRole(siteAuditRole);

  useRestoreSession({ setCurrentUser, setPermsLoaded, setUserLoaded });


  const handleLogin = (user: AppUser) => {
    const userData: AppUser = { id: user.id, name: user.name, phone: user.phone, role: user.role, allowedBranches: user.allowedBranches || [], individualPermissions: user.individualPermissions || [] };
    setCurrentUser(userData);
    setPermsLoaded(true);
    localStorage.setItem('materialdepot_user', JSON.stringify(userData));

    setSearch('');
    setStatusFilter([]);
    setPersonFilter([]);
    setBranchFilter([]);
    setCreatedDateFrom('');
    setCreatedDateTo('');
    setFollowUpDateFrom('');
    setFollowUpDateTo('');
    setClosureDateFrom('');
    setClosureDateTo('');
    setCartValueGt('');
    setTaskFilter('');
    setCategoryFilter([]);
    setPage(0);

    const firstTab = resolveAllowedTabs(userData)[0];
    if (firstTab && firstTab !== 'sales') setMainTab(firstTab);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('materialdepot_user');
  };

  const [leads, setLeads] = useState<Lead[]>([]);
  const [kylasSync, setKylasSync] = useState<Record<string, { loading?: boolean; ok?: boolean; msg?: string }>>({});
  const [showKylasModal, setShowKylasModal] = useState(false);
  const [kylasModalInput, setKylasModalInput] = useState('');
  const [kylasModalResult, setKylasModalResult] = useState<{ loading?: boolean; ok?: boolean; msg?: string; link?: string } | null>(null);
  const [branches, setBranches] = useState<string[]>(DEFAULT_BRANCHES);

  const [branchesLoaded, setBranchesLoaded] = useState(false);
  const [crmUsers, setCrmUsers] = useState<AppUser[]>([]);
  const [, setDbReady] = useState(false);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsTotal, setLeadsTotal] = useState(0);
  const [leadsTotalPages, setLeadsTotalPages] = useState(1);
  const [leadsStats, setLeadsStats] = useState<CRMLeadsStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [personFilter, setPersonFilter] = useState<string[]>([]);
  const [branchFilter, setBranchFilter] = useState<string[]>([]);
  const [createdDateFrom, setCreatedDateFrom] = useState('');
  const [createdDateTo, setCreatedDateTo] = useState('');
  const [followUpDateFrom, setFollowUpDateFrom] = useState('');
  const [followUpDateTo, setFollowUpDateTo] = useState('');
  const [closureDateFrom, setClosureDateFrom] = useState('');
  const [closureDateTo, setClosureDateTo] = useState('');
  const [cartValueGt, setCartValueGt] = useState('');
  const [taskFilter, setTaskFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);



  useEffect(() => {
    if (mainTab !== 'leads') return;
    if (categoryOptions.length > 0) return;
    fetchCategoryOptions().then(setCategoryOptions).catch(() => setCategoryOptions([]));
  }, [mainTab, categoryOptions.length]);
  const [sortCol, setSortCol] = useState('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [drawerLead, setDrawerLead] = useState<Lead | null>(null);
  const [visitsLoading, setVisitsLoading] = useState(false);

  useEffect(() => {
    if (!drawerLead?.clientPhone) return;
    if (drawerLead.ticketId) fetchLeadRemarks(drawerLead.ticketId).then(remarks => {
      if (remarks.length) {
        setLeads(prev => prev.map(l =>
          l.id === drawerLead.id && l.ticketId === drawerLead.ticketId ? { ...l, remarks } : l
        ));
      }
    }).catch(() => {});
    setVisitsLoading(true);
    fetchLeadVisits(drawerLead.clientPhone).then(visits => {
      setLeads(prev => prev.map(l =>
        l.id === drawerLead.id && l.clientPhone === drawerLead.clientPhone ? { ...l, visits } : l
      ));
    }).catch(() => {}).finally(() => setVisitsLoading(false));
  }, [drawerLead?.id, drawerLead?.clientPhone]);

  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [, setDeleteLeadState] = useState<Lead | null>(null);
  const [dateEditPopup, setDateEditPopup] = useState<DateEditState | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const debouncedSearch = useDebouncedValue(search.trim(), 600);
  const debouncedCartValueGt = useDebouncedValue(cartValueGt.trim(), 400);

  useEffect(() => {
    setPage(0);
  }, [
    debouncedSearch, branchFilter, personFilter, statusFilter, priorityFilter,
    createdDateFrom, createdDateTo,
    followUpDateFrom, followUpDateTo,
    closureDateFrom, closureDateTo,
    debouncedCartValueGt,
    categoryFilter,
  ]);


  const [csvPreview, setCsvPreview] = useState<CsvRow[] | null>(null);
  const [csvErrors, setCsvErrors] = useState<string[] | null>(null);
  const [csvSelected, setCsvSelected] = useState<Set<number>>(new Set());
  const [csvImportCount, setCsvImportCount] = useState<number | null>(null);
  const csvFileRef = useRef<HTMLInputElement>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportScope, setExportScope] = useState<'all' | 'page'>('all');

  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);
  const showSaveError = (msg: string = 'Failed to save. Please log out and log back in, then try again.') => {
    setSaveErrorMsg(msg);
    setTimeout(() => setSaveErrorMsg(null), 8000);
  };
  const [toast, setToast] = useState<{ msg: string; ok: boolean; link?: string } | null>(null);
  const showToast = (msg: string, ok: boolean, link?: string) => {
    setToast({ msg, ok, link });
    setTimeout(() => setToast(null), link ? 10000 : 5000);
  };

  const ALL_COLUMNS = [
    { key: 'id', label: 'Lead ID' },
    { key: 'clientName', label: 'Client Name' },
    { key: 'clientPhone', label: 'Client Phone' },
    { key: 'createdAt', label: 'Created' },
    { key: 'assignedTo', label: 'Assigned To' },
    { key: 'branch', label: 'Branch' },
    { key: 'clientType', label: 'Client Type' },
    { key: 'propertyType', label: 'Property Type' },
    { key: 'architectInvolved', label: 'Architect/Designer' },
    { key: 'projectPhase', label: 'Project Phase' },
    { key: 'leadPriority', label: 'Priority' },
    { key: 'status', label: 'Status' },
    { key: 'cartItems', label: 'Cart Items' },
    { key: 'followUpDate', label: 'Follow-up' },
    { key: 'closureDate', label: 'Closure Date' },
    { key: 'cartValue', label: 'Cart Value' },
  ];
  const [visibleCols, setVisibleCols] = useState<string[]>(() => {
    if (typeof window === 'undefined') return ALL_COLUMNS.map((c) => c.key);
    try {
      const stored = localStorage.getItem('materialdepot_cols');
      if (stored) return JSON.parse(stored);
    } catch {}
    return ALL_COLUMNS.map((c) => c.key);
  });
  const isColVisible = (key: string) => visibleCols.includes(key);

  const { activeCount, availableBMs, bmNameToPhone, filtered, lostCount, pctActive, pctLost, pctWon, pipelineActive, pipelineLost, pipelineTotal, pipelineWon, sorted, stageSummary, userAllowedBranches, userAllowedBranchesLower, wonCount } = useLeadsView({ crmUsers, currentUser, leads, leadsStats, leadsTotal, sortCol, sortDir });

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
    setPage(0);
  };

  useEffect(() => { setPage(0); }, [search, statusFilter, personFilter, branchFilter, createdDateFrom, createdDateTo, followUpDateFrom, followUpDateTo, closureDateFrom, closureDateTo, cartValueGt, taskFilter]);

  const totalPages = leadsTotalPages || (Math.ceil(sorted.length / pageSize) || 1);
  const safePage = Math.min(page, totalPages - 1);
  const paginatedRows = sorted;

  const { addRemark, filteredTotal, handleDateEditSave, handleKylasModalSync, handleKylasSync, saveLead } = makeLeadActions({ bmNameToPhone, currentUser, dateEditPopup, filtered, kylasModalInput, leads, setDateEditPopup, setDeleteLeadState, setDrawerLead, setKylasModalResult, setKylasSync, setLeads, setShowAddDrawer, showSaveError, showToast });

  const CSV_HEADERS = ['Lead ID','Client Name','Client Phone','Created Date','Assigned To','Branch','Status','Lost Reason','Cart Items','Cart Value','Follow-up Date','Closure Date','Remarks','Visits','Client Type','Property Type','Architect/Designer Involved','Project Phase','Priority'];

  const { handleCsvFile, importCsvLeads, runLeadsExport, today } = makeLeadsCsv({ CSV_HEADERS, bmNameToPhone, branchFilter, branches, categoryFilter, priorityFilter, closureDateFrom, closureDateTo, createdDateFrom, createdDateTo, csvFileRef, csvPreview, csvSelected, currentUser, debouncedCartValueGt, debouncedSearch, exporting, followUpDateFrom, followUpDateTo, leads, personFilter, setCsvErrors, setCsvImportCount, setCsvPreview, setCsvSelected, setExportMenuOpen, setExporting, setLeads, sortCol, sortDir, statusFilter, taskFilter, userAllowedBranches, userAllowedBranchesLower });

  const isOverdue = (l: Lead): boolean => !!(l.followUpDate && l.followUpDate < today && !['Order Placed', 'Order Confirmed', 'Partly Shipped', 'Shipped', 'Partly Delivered', 'Delivered', 'Refunded', 'Order Lost', 'Order Cancelled'].includes(l.status));
  const isClosureOverdue = (l: Lead): boolean => !!(l.closureDate && l.closureDate < today && !['Order Placed', 'Order Confirmed', 'Partly Shipped', 'Shipped', 'Partly Delivered', 'Delivered', 'Refunded', 'Order Lost', 'Order Cancelled'].includes(l.status));


  const COL_COUNT = visibleCols.length + 1;

  useLeadsData({ bmNameToPhone, branchFilter, categoryFilter, priorityFilter, closureDateFrom, closureDateTo, createdDateFrom, createdDateTo, currentUser, debouncedCartValueGt, debouncedSearch, effectiveTab, followUpDateFrom, followUpDateTo, mainTab, page, pageSize, personFilter, setBranches, setBranchesLoaded, setCrmUsers, setDbReady, setLeads, setLeadsLoading, setLeadsStats, setLeadsTotal, setLeadsTotalPages, setStatsLoading, sortCol, sortDir, statusFilter, taskFilter, userAllowedBranches, userAllowedBranchesLower });

  if (!userLoaded) return null;
  if (!currentUser) return <LoginScreen onLogin={handleLogin} />;

  if (!permsLoaded) return (
    <div className="flex items-center justify-center h-screen text-sm text-gray-400">Loading…</div>
  );

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <CrmHeader
        currentUser={currentUser}
        handleLogout={handleLogout}
      />

      <CrmTabBar
        allowedTabs={allowedTabs}
        canSeeAppointmentTracker={canSeeAppointmentTracker}
        effectiveTab={effectiveTab}
        setMainTab={setMainTab}
      />

<CrmTabPanels
        branches={branches}
        branchesLoaded={branchesLoaded}
        currentUser={currentUser}
        effectiveTab={effectiveTab}
        searchParams={searchParams}
        siteAuditIsOversight={siteAuditIsOversight}
        siteAuditRole={siteAuditRole}
        userAllowedBranches={userAllowedBranches}
      />

      {effectiveTab === 'leads' && <LeadsPanel
        ALL_COLUMNS={ALL_COLUMNS}
        COL_COUNT={COL_COUNT}
        activeCount={activeCount}
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
        filtered={filtered}
        filteredTotal={filteredTotal}
        followUpDateFrom={followUpDateFrom}
        followUpDateTo={followUpDateTo}
        handleCsvFile={handleCsvFile}
        handleKylasSync={handleKylasSync}
        handleSort={handleSort}
        isClosureOverdue={isClosureOverdue}
        isColVisible={isColVisible}
        isOverdue={isOverdue}
        kylasSync={kylasSync}
        leads={leads}
        leadsLoading={leadsLoading}
        leadsTotal={leadsTotal}
        lostCount={lostCount}
        pageSize={pageSize}
        paginatedRows={paginatedRows}
        pctActive={pctActive}
        pctLost={pctLost}
        pctWon={pctWon}
        personFilter={personFilter}
        pipelineActive={pipelineActive}
        pipelineLost={pipelineLost}
        pipelineTotal={pipelineTotal}
        pipelineWon={pipelineWon}
        runLeadsExport={runLeadsExport}
        safePage={safePage}
        search={search}
        setBranchFilter={setBranchFilter}
        setCartValueGt={setCartValueGt}
        setCategoryFilter={setCategoryFilter}
        setClosureDateFrom={setClosureDateFrom}
        setClosureDateTo={setClosureDateTo}
        setCreatedDateFrom={setCreatedDateFrom}
        setCreatedDateTo={setCreatedDateTo}
        setDateEditPopup={setDateEditPopup}
        setDrawerLead={setDrawerLead}
        setExportMenuOpen={setExportMenuOpen}
        setExportScope={setExportScope}
        setFollowUpDateFrom={setFollowUpDateFrom}
        setFollowUpDateTo={setFollowUpDateTo}
        setKylasModalInput={setKylasModalInput}
        setKylasModalResult={setKylasModalResult}
        setPage={setPage}
        setPageSize={setPageSize}
        setPersonFilter={setPersonFilter}
        setSearch={setSearch}
        setShowKylasModal={setShowKylasModal}
        setShowMobileFilters={setShowMobileFilters}
        setStatusFilter={setStatusFilter}
        setTaskFilter={setTaskFilter}
        setVisibleCols={setVisibleCols}
        showMobileFilters={showMobileFilters}
        sortCol={sortCol}
        sortDir={sortDir}
        sorted={sorted}
        stageSummary={stageSummary}
        statsLoading={statsLoading}
        statusFilter={statusFilter}
        taskFilter={taskFilter}
        totalPages={totalPages}
        userAllowedBranches={userAllowedBranches}
        wonCount={wonCount}
      />}

<CrmModals
        addRemark={addRemark}
        availableBMs={availableBMs}
        branches={branches}
        csvErrors={csvErrors}
        csvPreview={csvPreview}
        csvSelected={csvSelected}
        currentUser={currentUser}
        dateEditPopup={dateEditPopup}
        drawerLead={drawerLead}
        handleDateEditSave={handleDateEditSave}
        handleKylasModalSync={handleKylasModalSync}
        importCsvLeads={importCsvLeads}
        kylasModalInput={kylasModalInput}
        kylasModalResult={kylasModalResult}
        leads={leads}
        saveLead={saveLead}
        setCsvErrors={setCsvErrors}
        setCsvPreview={setCsvPreview}
        setCsvSelected={setCsvSelected}
        setDateEditPopup={setDateEditPopup}
        setDrawerLead={setDrawerLead}
        setKylasModalInput={setKylasModalInput}
        setKylasModalResult={setKylasModalResult}
        setLeads={setLeads}
        setShowAddDrawer={setShowAddDrawer}
        setShowKylasModal={setShowKylasModal}
        showAddDrawer={showAddDrawer}
        showKylasModal={showKylasModal}
        showSaveError={showSaveError}
        visitsLoading={visitsLoading}
      />

      <CrmToasts
        csvImportCount={csvImportCount}
        handleLogout={handleLogout}
        saveErrorMsg={saveErrorMsg}
        toast={toast}
        setToast={setToast}
      />
    </div>
  );
}
