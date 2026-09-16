import { CRMLeadsStats, CRMLeadsStatsBucket, fetchCRMLeadsStats } from '@/lib/api';

export const B2B_STATS_BRANCH = 'B2B';

export type StatsBasis = 'created' | 'order';

export function basisQuery(basis: StatsBasis, range?: { from?: string; to?: string }) {
  return basis === 'order'
    ? { orderFrom: range?.from, orderTo: range?.to, branchBasis: 'estimate' as const }
    : { createdFrom: range?.from, createdTo: range?.to };
}

export interface B2BPipelineStats {
  total: CRMLeadsStatsBucket;
  active: CRMLeadsStatsBucket;
  won: CRMLeadsStatsBucket;
  lost: CRMLeadsStatsBucket;
  byStatus: CRMLeadsStats['byStatus'];

  ok: boolean;
}

export const EMPTY_BUCKET: CRMLeadsStatsBucket = { count: 0, value: 0 };

export function istToday(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export async function fetchB2BPipelineStats(
  range?: { from?: string; to?: string },
  basis: StatsBasis = 'created',
): Promise<B2BPipelineStats> {
  const stats = await fetchCRMLeadsStats({
    branch: B2B_STATS_BRANCH, ...basisQuery(basis, range),
  }).catch((e) => { console.error('[b2b] leads stats fetch failed', e); return null; });
  return {
    total: stats?.total ?? EMPTY_BUCKET,
    active: stats?.active ?? EMPTY_BUCKET,
    won: stats?.won ?? EMPTY_BUCKET,
    lost: stats?.lost ?? EMPTY_BUCKET,
    byStatus: stats?.byStatus ?? [],
    ok: stats !== null,
  };
}

