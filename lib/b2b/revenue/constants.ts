import type { FunnelBucket, FunnelStage, HolderKind, OrderBucket, RevenueChannel } from './types';

export const B2B_BRANCH = 'B2B';

export const REVENUE_CHANNELS: RevenueChannel[] = ['direct', 'ec', 'referred'];

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

export const FUNNEL_OF: Partial<Record<OrderBucket, FunnelBucket>> = {
  direct: 'studio',
  ec: 'ecReferred',
  unowned: 'ecDirect',
};

export const QUOTED_STATUSES = new Set(['Quote Approval Pending', 'Availability Check', 'Hold Stock', 'Payment Pending']);

export const DELIVERED_STATUSES = new Set(['Partly Delivered', 'Delivered']);

export const FUNNEL_PAGES = 30;
