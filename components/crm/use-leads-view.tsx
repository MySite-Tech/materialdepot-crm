'use client';

import { CRMLeadsStats } from '../../lib/api/crmLeads';
import { AppUser, Lead } from '../../types/crm';
import { STATUSES } from './constants/crm';
import { useMemo } from 'react';

export function useLeadsView({ crmUsers, currentUser, leads, leadsStats, sortCol, sortDir }: {
  crmUsers: AppUser[];
  currentUser: AppUser | null;
  leads: Lead[];
  leadsStats: CRMLeadsStats | null;
  leadsTotal: number;
  sortCol: string;
  sortDir: "asc" | "desc";
}) {
const isAdminUser = currentUser?.role === 'admin';
const userAllowedBranches = isAdminUser ? [] : (currentUser?.allowedBranches || []);

const userAllowedBranchesLower = new Set(userAllowedBranches.map((b) => b.toLowerCase()));

const availableBMs = crmUsers.length > 0
  ? crmUsers.map((u) => u.name).filter(Boolean).sort()
  : [...new Set(leads.map((l) => l.assignedTo).filter(Boolean))].sort();
const bmNameToPhone = useMemo(() => {
  const map: Record<string, string> = {};
  crmUsers.forEach((u) => { if (u.name && u.phone) map[u.name] = u.phone; });
  return map;
}, [crmUsers]);

const filtered = leads;

const pipelineTotal = leadsStats?.total.value ?? 0;
const pipelineActive = leadsStats?.active.value ?? 0;
const pipelineWon = leadsStats?.won.value ?? 0;
const pipelineLost = leadsStats?.lost.value ?? 0;
const pctWon = pipelineTotal ? (pipelineWon / pipelineTotal) * 100 : 0;
const pctActive = pipelineTotal ? (pipelineActive / pipelineTotal) * 100 : 0;
const pctLost = pipelineTotal ? (pipelineLost / pipelineTotal) * 100 : 0;

const statsByStatus = new Map<string, { count: number; value: number }>(
  (leadsStats?.byStatus || []).map((s) => [s.status, { count: s.count, value: s.value }]),
);
const stageSummary = STATUSES.map((status) => {
  const row = statsByStatus.get(status);
  return { status, count: row?.count || 0, value: row?.value || 0 };
});
const activeCount = leadsStats?.active.count ?? 0;
const wonCount = leadsStats?.won.count ?? 0;
const lostCount = leadsStats?.lost.count ?? 0;

const getFirstVisit = (l: Lead): string => { const v = l.visits || []; return v.length > 0 ? [...v].sort((a, b) => a.date.localeCompare(b.date))[0].date : l.createdAt || ''; };
const getLatestVisit = (l: Lead): string => { const v = l.visits || []; return v.length > 0 ? [...v].sort((a, b) => b.date.localeCompare(a.date))[0].date : l.createdAt || ''; };

const sorted = [...filtered].sort((a, b) => {
  let va: any, vb: any;
  if (sortCol === 'visitCount') {
    va = (a.visits || []).length;
    vb = (b.visits || []).length;
    return sortDir === 'asc' ? va - vb : vb - va;
  }
  if (sortCol === 'firstVisit') { va = getFirstVisit(a); vb = getFirstVisit(b); return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va); }
  if (sortCol === 'latestVisit') { va = getLatestVisit(a); vb = getLatestVisit(b); return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va); }
  va = (a as any)[sortCol]; vb = (b as any)[sortCol];
  if (sortCol === 'cartValue') { va = va || 0; vb = vb || 0; return sortDir === 'asc' ? va - vb : vb - va; }
  if (sortCol === 'architectInvolved') { va = va ? 1 : 0; vb = vb ? 1 : 0; return sortDir === 'asc' ? va - vb : vb - va; }
  if (va == null) va = ''; if (vb == null) vb = '';
  if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb || '').toLowerCase(); }
  if (va < vb) return sortDir === 'asc' ? -1 : 1;
  if (va > vb) return sortDir === 'asc' ? 1 : -1;
  return 0;
});


  return { activeCount, availableBMs, bmNameToPhone, filtered, lostCount, pctActive, pctLost, pctWon, pipelineActive, pipelineLost, pipelineTotal, pipelineWon, sorted, stageSummary, userAllowedBranches, userAllowedBranchesLower, wonCount };
}
