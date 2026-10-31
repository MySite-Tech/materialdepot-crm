import type { OrderBucket, RevenueChannel } from '@/lib/b2b/revenue';

export const CHANNEL_META: Record<RevenueChannel, { label: string; color: string; hint: string }> = {
  direct: {
    label: 'Direct',
    color: '#4F46E5',
    hint: 'A B2B rep held the cart, so the team placed the order itself.',
  },
  ec: {
    label: 'EC-directed',
    color: '#DB2777',
    hint: 'A store rep held the cart, on a number a KAM, Inbound or Outreach owner holds. Any logged Redirect to EC counts too. These orders are also in that store\'s own revenue.',
  },
  referred: {
    label: 'Referred clients',
    color: '#65A30D',
    hint: 'Orders on the numbers of clients a Studio Space partner referred, counted from the day of the referral. Always credited to KAM.',
  },
};

export const BUCKET_LABELS: Record<OrderBucket, string> = {
  direct: 'Direct',
  ec: 'EC-directed',
  referred: 'Referred',
  unowned: 'No KAM yet',
  untraced: 'Not traced',
};

export type BreakdownView = 'firms' | 'people' | 'orders';

export const BREAKDOWN_LABELS: Record<BreakdownView, string> = {
  firms: 'Firms',
  people: 'People',
  orders: 'Orders',
};

export const TEAM_OPTIONS = {
  all: 'All teams',
  kam: 'KAM',
  inbound: 'Inbound',
  outreach: 'Outreach',
} as const;

export const MONTHS_OFFERED = 12;

export const PAGE_SIZE = 25;
