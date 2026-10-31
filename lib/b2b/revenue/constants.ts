import type { HolderKind, RevenueChannel } from './types';

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

export const FALLBACK_STUDIO_FIRM = 'Studio Space firm';
