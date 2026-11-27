import { b2bBackendGet } from '../data/backend';
import type { ClientFlowReport } from './clients/types';
import type { EcSpocReport, FunnelReport, RevenueReport, RevenueTrend } from './types';

export type { BookedOn, ChannelSplit, CreditEntry, EcSpocReport, EcSpocSeen, FunnelBucket, FunnelCell, FunnelEnquiry, FunnelReport, FunnelRow, FunnelStage, HolderKind, MonthWindow, OrderCredit, OrderType, RevenueChannel, RevenueFilter, RevenueOrder, RevenueReport, RevenueTrend, RollupRow, TrendMonth } from './types';
export { applyCredits, clearOrderCredit, creditKey, fetchOrderCredits, saveOrderCredit } from './credits';
export type { CreditInput } from './credits';
export type { ChurnedClient, ClientFlowReport, FlowClient, FlowFrom, FlowMonth, FlowSide } from './clients/types';
export { CHANNEL_LABELS, CHANNEL_TYPES, CHURN_GAP, FLOW_LOOKBACK, FLOW_MONTHS, FUNNEL_BUCKETS, FUNNEL_STAGES, REVENUE_CHANNELS, STUDIO_CHANNELS } from './constants';
export { funnelRows } from './utils/funnel';
export { monthWindows } from './utils/months';
export { channelSplits, isStudioChannel, matchesFilter, revenueTotal, rollupBy, rollupOrders, studioTotal } from './utils/rollup';

export const fetchRevenueReport = (from: string, to: string, fresh: boolean): Promise<RevenueReport> =>
  b2bBackendGet<RevenueReport>(`/revenue?from=${from}&to=${to}${fresh ? '&fresh=1' : ''}`);

export const fetchFunnelReport = (from: string, to: string, fresh: boolean): Promise<FunnelReport> =>
  b2bBackendGet<FunnelReport>(`/revenue/funnel?from=${from}&to=${to}${fresh ? '&fresh=1' : ''}`);

export const fetchRevenueTrend = (fresh: boolean): Promise<RevenueTrend> =>
  b2bBackendGet<RevenueTrend>(`/revenue/trend${fresh ? '?fresh=1' : ''}`);

export const fetchEcSpocs = (): Promise<EcSpocReport> =>
  b2bBackendGet<EcSpocReport>('/revenue/ec-spocs');

export const fetchClientFlow = (fresh: boolean): Promise<ClientFlowReport> =>
  b2bBackendGet<ClientFlowReport>(`/revenue/clients${fresh ? '?fresh=1' : ''}`);
