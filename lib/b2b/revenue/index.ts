import { b2bBackendGet } from '../data/backend';
import type { BranchLedger, FunnelReport, LedgerBasis, RevenueReport } from './types';

export type { BranchLedger, BridgeCell, BridgeRow, ChannelSplit, FunnelBucket, FunnelCell, FunnelEnquiry, FunnelReport, FunnelRow, FunnelStage, HolderKind, LedgerBasis, OrderBucket, RevenueChannel, RevenueFilter, RevenueOrder, RevenueReport, RollupRow } from './types';
export { FUNNEL_BUCKETS, FUNNEL_STAGES, REVENUE_CHANNELS } from './constants';
export { funnelRows } from './utils/funnel';
export { bridgeRows, bridgeTotal, bucketSplit, channelSplits, countedValue, isCounted, matchesFilter, rollupBy, rollupOrders } from './utils/rollup';

export const fetchRevenueReport = (from: string, to: string, fresh: boolean): Promise<RevenueReport> =>
  b2bBackendGet<RevenueReport>(`/revenue?from=${from}&to=${to}${fresh ? '&fresh=1' : ''}`);

export const fetchBranchLedger = (from: string | undefined, to: string | undefined, basis: LedgerBasis): Promise<BranchLedger> =>
  b2bBackendGet<BranchLedger>(`/revenue/ledger?basis=${basis}${from && to ? `&from=${from}&to=${to}` : ''}`);

export const fetchFunnelReport = (from: string, to: string, fresh: boolean): Promise<FunnelReport> =>
  b2bBackendGet<FunnelReport>(`/revenue/funnel?from=${from}&to=${to}${fresh ? '&fresh=1' : ''}`);
