import { b2bBackendGet } from '../data/backend';
import type { BranchLedger, LedgerBasis, RevenueReport } from './types';

export type { BranchLedger, BridgeCell, BridgeRow, ChannelSplit, HolderKind, LedgerBasis, OrderBucket, RevenueChannel, RevenueFilter, RevenueOrder, RevenueReport, RollupRow } from './types';
export { REVENUE_CHANNELS } from './constants';
export { bridgeRows, bridgeTotal, bucketSplit, channelSplits, countedValue, isCounted, matchesFilter, rollupBy, rollupOrders } from './utils/rollup';

export const fetchRevenueReport = (from: string, to: string, fresh: boolean): Promise<RevenueReport> =>
  b2bBackendGet<RevenueReport>(`/revenue?from=${from}&to=${to}${fresh ? '&fresh=1' : ''}`);

export const fetchBranchLedger = (from: string | undefined, to: string | undefined, basis: LedgerBasis): Promise<BranchLedger> =>
  b2bBackendGet<BranchLedger>(`/revenue/ledger?basis=${basis}${from && to ? `&from=${from}&to=${to}` : ''}`);
