import type { B2BBooking, FunnelBucket, FunnelStage, HolderKind, OrderType, RevenueChannel } from './types';

export const B2B_BRANCH = 'B2B';

export const B2B_BOOKING: B2BBooking[] = [
  { branch: 'HQ', from: '', to: '2026-06-30', shared: true },
  { branch: B2B_BRANCH, from: '2026-07-01', to: '', shared: false },
];

export const REVENUE_CHANNELS: RevenueChannel[] = ['direct', 'redirected', 'ecDirect', 'referred'];

export const CHANNEL_TYPES: Record<RevenueChannel, OrderType[]> = {
  direct: [1, 3, 6, 7],
  redirected: [2, 4],
  ecDirect: [8],
  referred: [5],
};

export const TREND_MONTHS = 6;

export const PAST_MONTH_TTL = 30 * 60_000;

export const PAST_MONTH_KEEP = 24 * 60 * 60_000;

export const HOLDER_RANK: Record<HolderKind, number> = {
  referred: 0,
  redirect: 1,
  firm: 2,
  studio: 3,
  outreach: 4,
  inbound: 5,
  unowned: 6,
};

export const FUNNEL_BUCKETS: FunnelBucket[] = ['ecDirect', 'ecReferred', 'studio'];

export const FUNNEL_STAGES: FunnelStage[] = ['enquiry', 'quoted', 'ordered', 'delivered', 'lost'];

export const FUNNEL_OF: Partial<Record<OrderType, FunnelBucket>> = {
  1: 'studio',
  2: 'studio',
  3: 'ecReferred',
  4: 'ecReferred',
  6: 'ecDirect',
  8: 'ecDirect',
};

export const QUOTED_STATUSES = new Set(['Quote Approval Pending', 'Availability Check', 'Hold Stock', 'Payment Pending']);

export const DELIVERED_STATUSES = new Set(['Partly Delivered', 'Delivered']);

export const FUNNEL_PAGES = 30;
