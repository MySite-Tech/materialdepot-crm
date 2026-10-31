import { b2bBackendGet } from '../data/backend';
import type { RevenueReport } from './types';

export type { ChannelSplit, OrderBucket, RevenueChannel, RevenueFilter, RevenueOrder, RevenueReport, RollupRow } from './types';
export { REVENUE_CHANNELS } from './constants';
export { bucketSplit, channelSplits, countedValue, isCounted, matchesFilter, rollupBy } from './utils/rollup';

export const fetchRevenueReport = (from: string, to: string, fresh: boolean): Promise<RevenueReport> =>
  b2bBackendGet<RevenueReport>(`/revenue?from=${from}&to=${to}${fresh ? '&fresh=1' : ''}`);
