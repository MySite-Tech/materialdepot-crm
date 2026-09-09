'use client';

import { fetchBranchList } from '../../lib/api/branches';
import { CRMLeadsStats, fetchCRMLeads, fetchCRMLeadsStats } from '../../lib/api/crmLeads';
import { fetchUsers } from '../../lib/api/users';
import { AppUser, Lead } from '../../types/crm';
import { BACKEND_SORTABLE_COLS } from './constants/crm';
import { MainTab } from './types/crm';
import { Dispatch, SetStateAction, useEffect } from 'react';

export function useLeadsData({ bmNameToPhone, branchFilter, categoryFilter, closureDateFrom, closureDateTo, createdDateFrom, createdDateTo, currentUser, debouncedCartValueGt, debouncedSearch, effectiveTab, followUpDateFrom, followUpDateTo, mainTab, page, pageSize, personFilter, setBranches, setBranchesLoaded, setCrmUsers, setDbReady, setLeads, setLeadsLoading, setLeadsStats, setLeadsTotal, setLeadsTotalPages, setStatsLoading, sortCol, sortDir, statusFilter, taskFilter, userAllowedBranches, userAllowedBranchesLower }: {
  bmNameToPhone: Record<string, string>;
  branchFilter: string[];
  categoryFilter: string[];
  closureDateFrom: string;
  closureDateTo: string;
  createdDateFrom: string;
  createdDateTo: string;
  currentUser: AppUser | null;
  debouncedCartValueGt: string;
  debouncedSearch: string;
  effectiveTab: MainTab | null;
  followUpDateFrom: string;
  followUpDateTo: string;
  mainTab: MainTab;
  page: number;
  pageSize: number;
  personFilter: string[];
  setBranches: Dispatch<SetStateAction<string[]>>;
  setBranchesLoaded: Dispatch<SetStateAction<boolean>>;
  setCrmUsers: Dispatch<SetStateAction<AppUser[]>>;
  setDbReady: Dispatch<SetStateAction<boolean>>;
  setLeads: Dispatch<SetStateAction<Lead[]>>;
  setLeadsLoading: Dispatch<SetStateAction<boolean>>;
  setLeadsStats: Dispatch<SetStateAction<CRMLeadsStats | null>>;
  setLeadsTotal: Dispatch<SetStateAction<number>>;
  setLeadsTotalPages: Dispatch<SetStateAction<number>>;
  setStatsLoading: Dispatch<SetStateAction<boolean>>;
  sortCol: string;
  sortDir: "asc" | "desc";
  statusFilter: string[];
  taskFilter: string;
  userAllowedBranches: string[];
  userAllowedBranchesLower: Set<string>;
}) {
useEffect(() => {
  if (!currentUser) return;
  const needsBranches = ['leads', 'dashboard', 'footfall', 'weeklyFunnel', 'reportCard', 'appointmentTracker'].includes(mainTab);
  const needsUsers = effectiveTab === 'leads';
  if (!needsBranches && !needsUsers) return;
  let cancelled = false;
  Promise.all([
    needsBranches ? fetchBranchList().catch(() => []) : Promise.resolve(null),
    needsUsers ? fetchUsers().catch(() => []) : Promise.resolve(null),
  ]).then(([dbBranches, dbUsers]) => {
    if (cancelled) return;
    if (dbBranches && dbBranches.length > 0) {
      setBranches(dbBranches.map((b: { name: string }) => b.name));
      setBranchesLoaded(true);
    }
    if (dbUsers) setCrmUsers(dbUsers);
  });
  return () => { cancelled = true; };
}, [currentUser, mainTab]);

useEffect(() => {
  if (!currentUser || mainTab !== 'leads') return;

  const effectiveBranches = userAllowedBranches.length > 0
    ? (branchFilter.length > 0 ? branchFilter.filter((b) => userAllowedBranchesLower.has(b.toLowerCase())) : userAllowedBranches)
    : branchFilter;
  const branchCsv = effectiveBranches.join(',');
  const bmCsv = personFilter.map((name) => bmNameToPhone[name] || name).join(',');
  const statusCsv = statusFilter.join(',');
  const cartGt = debouncedCartValueGt ? Number(debouncedCartValueGt) : undefined;
  const ownerUserOrgId = currentUser.role === 'sales' ? currentUser.id : undefined;
  setLeadsLoading(true);
  let cancelled = false;
  fetchCRMLeads({
    page: page + 1,
    pageSize,
    branch: branchCsv || undefined,
    bm: bmCsv || undefined,
    q: debouncedSearch || undefined,
    status: statusCsv || undefined,
    createdFrom: createdDateFrom || undefined,
    createdTo: createdDateTo || undefined,
    followupFrom: followUpDateFrom || undefined,
    followupTo: followUpDateTo || undefined,
    closureFrom: closureDateFrom || undefined,
    closureTo: closureDateTo || undefined,
    cartValueGt: cartGt,
    ownerUserOrgId,
    sortBy: (BACKEND_SORTABLE_COLS.has(sortCol) ? sortCol : 'createdAt') as any,
    sortDir: BACKEND_SORTABLE_COLS.has(sortCol) ? sortDir : 'desc',
    taskFilter: taskFilter || undefined,
    category: categoryFilter.length ? categoryFilter.join(',') : undefined,
  }).then((crmLeadsPage) => {
    if (cancelled) return;
    setLeads(crmLeadsPage.results as Lead[]);
    setLeadsTotal(crmLeadsPage.count);
    setLeadsTotalPages(crmLeadsPage.totalPages);
    setDbReady(true);
    setLeadsLoading(false);
  }).catch(() => {
    if (cancelled) return;
    setDbReady(true);
    setLeadsLoading(false);
  });
  return () => { cancelled = true; };
}, [
  currentUser, mainTab, page, pageSize, debouncedSearch,
  branchFilter, personFilter, statusFilter,
  createdDateFrom, createdDateTo,
  followUpDateFrom, followUpDateTo,
  closureDateFrom, closureDateTo,
  debouncedCartValueGt,
  sortCol, sortDir,
  taskFilter,
  categoryFilter,
]);

useEffect(() => {
  if (!currentUser || mainTab !== 'leads') return;
  const effectiveBranches = userAllowedBranches.length > 0
    ? (branchFilter.length > 0 ? branchFilter.filter((b) => userAllowedBranchesLower.has(b.toLowerCase())) : userAllowedBranches)
    : branchFilter;
  const branchCsv = effectiveBranches.join(',');
  const bmCsv = personFilter.map((name) => bmNameToPhone[name] || name).join(',');
  const statusCsv = statusFilter.join(',');
  const cartGt = debouncedCartValueGt ? Number(debouncedCartValueGt) : undefined;
  const ownerUserOrgId = currentUser.role === 'sales' ? currentUser.id : undefined;
  let cancelled = false;
  setStatsLoading(true);
  fetchCRMLeadsStats({
    branch: branchCsv || undefined,
    bm: bmCsv || undefined,
    q: debouncedSearch || undefined,
    status: statusCsv || undefined,
    createdFrom: createdDateFrom || undefined,
    createdTo: createdDateTo || undefined,
    followupFrom: followUpDateFrom || undefined,
    followupTo: followUpDateTo || undefined,
    closureFrom: closureDateFrom || undefined,
    closureTo: closureDateTo || undefined,
    cartValueGt: cartGt,
    ownerUserOrgId,
    taskFilter: taskFilter || undefined,
    category: categoryFilter.length ? categoryFilter.join(',') : undefined,
  }).then((stats) => {
    if (!cancelled) { setLeadsStats(stats); setStatsLoading(false); }
  }).catch(() => { if (!cancelled) setStatsLoading(false); });
  return () => { cancelled = true; };
}, [
  currentUser, mainTab, debouncedSearch,
  branchFilter, personFilter, statusFilter,
  createdDateFrom, createdDateTo,
  followUpDateFrom, followUpDateTo,
  closureDateFrom, closureDateTo,
  debouncedCartValueGt,
  taskFilter,
  categoryFilter,
]);


  return {  };
}
