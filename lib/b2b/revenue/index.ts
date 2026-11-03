import { b2bBackendGet } from '../data/backend';
import type { FunnelReport, RevenueReport, RevenueTrend } from './types';

export type { BookedOn, ChannelSplit, FunnelBucket, FunnelCell, FunnelEnquiry, FunnelReport, FunnelRow, FunnelStage, HolderKind, MonthWindow, OrderType, RevenueChannel, RevenueFilter, RevenueOrder, RevenueReport, RevenueTrend, RollupRow, TrendMonth } from './types';
export { CHANNEL_TYPES, FUNNEL_BUCKETS, FUNNEL_STAGES, REVENUE_CHANNELS } from './constants';
export { funnelRows } from './utils/funnel';
export { monthWindows } from './utils/months';
export { channelSplits, matchesFilter, revenueTotal, rollupBy, rollupOrders } from './utils/rollup';

export const fetchRevenueReport = (from: string, to: string, fresh: boolean): Promise<RevenueReport> =>
  b2bBackendGet<RevenueReport>(`/revenue?from=${from}&to=${to}${fresh ? '&fresh=1' : ''}`);

export const fetchFunnelReport = (from: string, to: string, fresh: boolean): Promise<FunnelReport> =>
  b2bBackendGet<FunnelReport>(`/revenue/funnel?from=${from}&to=${to}${fresh ? '&fresh=1' : ''}`);

export const fetchRevenueTrend = (fresh: boolean): Promise<RevenueTrend> =>
  b2bBackendGet<RevenueTrend>(`/revenue/trend${fresh ? '?fresh=1' : ''}`);
