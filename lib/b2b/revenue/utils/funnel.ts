import { LOST_SET, ORDER_SET } from '../../../../components/b2b/constants/client';
import { DELIVERED_STATUSES, FUNNEL_BUCKETS, FUNNEL_OF, FUNNEL_STAGES, QUOTED_STATUSES } from '../constants';
import type { FunnelBucket, FunnelCell, FunnelEnquiry, FunnelRow, FunnelStage, RevenueOrder } from '../types';

export const funnelBucketOf = (o: RevenueOrder): FunnelBucket | null => FUNNEL_OF[o.bucket] ?? null;

export function reachedStage(status: string, stage: FunnelStage): boolean {
  if (stage === 'enquiry') return true;
  if (stage === 'lost') return LOST_SET.has(status);
  if (stage === 'delivered') return DELIVERED_STATUSES.has(status);
  if (stage === 'ordered') return ORDER_SET.has(status);
  return ORDER_SET.has(status) || QUOTED_STATUSES.has(status);
}

const cellOf = (enquiries: FunnelEnquiry[]): FunnelCell => ({
  count: enquiries.length,
  value: enquiries.reduce((s, e) => s + e.value, 0),
  firms: new Set(enquiries.map((e) => e.firm)).size,
  enquiries,
});

const rowOf = (enquiries: FunnelEnquiry[]): FunnelRow =>
  Object.fromEntries(FUNNEL_STAGES.map((s) => [s, cellOf(enquiries.filter((e) => reachedStage(e.status, s)))])) as FunnelRow;

export function funnelRows(enquiries: FunnelEnquiry[]): Record<FunnelBucket | 'all', FunnelRow> {
  const out = { all: rowOf(enquiries) } as Record<FunnelBucket | 'all', FunnelRow>;
  for (const b of FUNNEL_BUCKETS) out[b] = rowOf(enquiries.filter((e) => e.funnel === b));
  return out;
}
