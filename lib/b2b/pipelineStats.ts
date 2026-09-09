import { CRMLeadsStats, CRMLeadsStatsBucket, fetchCRMLeadsStats } from '@/lib/mockApi';
// ── Pipeline value (Django /crm/leads/stats/, branch = B2B) ───────────────────
// Cart value lives on the Django estimates/tickets, not in b2b_lead — so every
// rupee on the dashboard comes from the same endpoint the Leads tab strip uses,
// scoped to the B2B branch. b2b_lead only drives stage counts and ownership.

export const B2B_BRANCH = 'B2B';

export interface B2BPipelineStats {
  total: CRMLeadsStatsBucket;
  active: CRMLeadsStatsBucket;
  won: CRMLeadsStatsBucket;
  lost: CRMLeadsStatsBucket;
  byStatus: CRMLeadsStats['byStatus'];
}

export const EMPTY_BUCKET: CRMLeadsStatsBucket = { count: 0, value: 0 };

// 'YYYY-MM-DD' for the current Indian day — the API filters on IST dates.
export function istToday(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// Created-date window, both ends inclusive and optional. Omit both for all-time.
// Same parameters the Leads tab sends, so a B2B-filtered Leads tab and this
// dashboard report identical numbers for identical windows.
export async function fetchB2BPipelineStats(
  range?: { from?: string; to?: string },
): Promise<B2BPipelineStats> {
  const stats = await fetchCRMLeadsStats({
    branch: B2B_BRANCH, createdFrom: range?.from, createdTo: range?.to,
  }).catch((e) => { console.error('[b2b] leads stats fetch failed', e); return null; });
  return {
    total: stats?.total ?? EMPTY_BUCKET,
    active: stats?.active ?? EMPTY_BUCKET,
    won: stats?.won ?? EMPTY_BUCKET,
    lost: stats?.lost ?? EMPTY_BUCKET,
    byStatus: stats?.byStatus ?? [],
  };
}

