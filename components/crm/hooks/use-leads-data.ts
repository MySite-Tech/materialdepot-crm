'use client';

import { fetchBranchList } from '../../../lib/api/crm/branches';
import { CRMLeadsStats, fetchCRMLeads, fetchCRMLeadsStats } from '../../../lib/api/crm/leads';
import { fetchUsers } from '../../../lib/api/crm/users';
import { AppUser, Lead } from '../../../types/crm';
import { BACKEND_SORTABLE_COLS } from '../constants';
import { MainTab } from '../types';
import { buildLeadsQuery } from '../utils';
import { Dispatch, SetStateAction, useEffect } from 'react';

export function useLeadsData({ bmNameToPhone, branchFilter, categoryFilter, priorityFilter, closureDateFrom, closureDateTo, createdDateFrom, createdDateTo, currentUser, debouncedCartValueGt, debouncedSearch, effectiveTab, followUpDateFrom, followUpDateTo, mainTab, page, pageSize, personFilter, setBranches, setBranchesLoaded, setCrmUsers, setDbReady, setLeads, setLeadsLoading, setLeadsStats, setLeadsTotal, setLeadsTotalPages, setStatsLoading, sortCol, sortDir, statusFilter, taskFilter, userAllowedBranches, userAllowedBranchesLower }: {
  bmNameToPhone: Record<string, string>;
  branchFilter: string[];
  categoryFilter: string[];
  priorityFilter: string[];
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

  setLeadsLoading(true);
  let cancelled = false;
  fetchCRMLeads({
    ...buildLeadsQuery({ bmNameToPhone, branchFilter, categoryFilter, priorityFilter, closureDateFrom, closureDateTo, createdDateFrom, createdDateTo, currentUser, debouncedCartValueGt, debouncedSearch, followUpDateFrom, followUpDateTo, personFilter, statusFilter, taskFilter, userAllowedBranches, userAllowedBranchesLower }),
    page: page + 1,
    pageSize,
    sortBy: (BACKEND_SORTABLE_COLS.has(sortCol) ? sortCol : 'createdAt') as any,
    sortDir: BACKEND_SORTABLE_COLS.has(sortCol) ? sortDir : 'desc',
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
  priorityFilter,
]);

useEffect(() => {
  if (!currentUser || mainTab !== 'leads') return;
  let cancelled = false;
  setStatsLoading(true);
  fetchCRMLeadsStats(
    buildLeadsQuery({ bmNameToPhone, branchFilter, categoryFilter, priorityFilter, closureDateFrom, closureDateTo, createdDateFrom, createdDateTo, currentUser, debouncedCartValueGt, debouncedSearch, followUpDateFrom, followUpDateTo, personFilter, statusFilter, taskFilter, userAllowedBranches, userAllowedBranchesLower }),
  ).then((stats) => {
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
  priorityFilter,
]);
}
