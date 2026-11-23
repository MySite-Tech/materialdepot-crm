'use client';

import { fetchBranchList } from '../../../lib/api/crm/branches';
import { CRMLeadsStats, fetchCRMLeads, fetchCRMLeadsStats } from '../../../lib/api/crm/leads';
import { fetchUsers } from '../../../lib/api/crm/users';
import { AppUser, Lead } from '../../../types/crm';
import { BACKEND_SORTABLE_COLS } from '../constants';
import { MainTab } from '../types';
import { cachedLeadsStats, rememberLeadsStats } from '../utils';
import { Dispatch, SetStateAction, useEffect } from 'react';

export function useLeadsData({ currentUser, effectiveTab, mainTab, page, pageSize, queryKey, setBranches, setBranchesLoaded, setCrmUsers, setDbReady, setLeads, setLeadsLoading, setLeadsStats, setLeadsTotal, setLeadsTotalPages, setStatsLoading, sortCol, sortDir }: {
  currentUser: AppUser | null;
  effectiveTab: MainTab | null;
  mainTab: MainTab;
  page: number;
  pageSize: number;
  queryKey: string;
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
}) {
useEffect(() => {
  if (!currentUser) return;
  const needsBranches = ['leads', 'dashboard', 'footfall', 'weeklyFunnel', 'reportCard', 'appointmentTracker', 'ecB2bReferral'].includes(mainTab);
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
  const controller = new AbortController();
  setLeadsLoading(true);
  fetchCRMLeads({
    ...JSON.parse(queryKey),
    page: page + 1,
    pageSize,
    sortBy: (BACKEND_SORTABLE_COLS.has(sortCol) ? sortCol : 'createdAt') as any,
    sortDir: BACKEND_SORTABLE_COLS.has(sortCol) ? sortDir : 'desc',
  }, controller.signal).then((crmLeadsPage) => {
    if (controller.signal.aborted) return;
    setLeads(crmLeadsPage.results as Lead[]);
    setLeadsTotal(crmLeadsPage.count);
    setLeadsTotalPages(crmLeadsPage.totalPages);
    setDbReady(true);
    setLeadsLoading(false);
  }).catch(() => {
    if (controller.signal.aborted) return;
    setDbReady(true);
    setLeadsLoading(false);
  });
  return () => controller.abort();
}, [currentUser, mainTab, queryKey, page, pageSize, sortCol, sortDir]);

useEffect(() => {
  if (!currentUser || mainTab !== 'leads') return;
  const controller = new AbortController();
  const cacheKey = `${currentUser.id}:${queryKey}`;
  const cached = cachedLeadsStats(cacheKey);
  if (cached) { setLeadsStats(cached); setStatsLoading(false); } else setStatsLoading(true);
  fetchCRMLeadsStats(JSON.parse(queryKey), controller.signal).then((stats) => {
    rememberLeadsStats(cacheKey, stats);
    if (!controller.signal.aborted) { setLeadsStats(stats); setStatsLoading(false); }
  }).catch(() => { if (!controller.signal.aborted) setStatsLoading(false); });
  return () => controller.abort();
}, [currentUser, mainTab, queryKey]);
}
