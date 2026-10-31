import type { HolderKind, OrderBucket, RevenueChannel } from '@/lib/b2b/revenue';

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

export const BUCKET_RULE: Record<OrderBucket, string> = {
  direct: 'A B2B rep on the cart',
  ec: 'A store rep on the cart, on a number B2B holds',
  referred: 'A client referred by a Studio Space partner',
  unowned: 'Not counted: store rep, firm with no KAM',
  untraced: 'Not counted: store rep, number on no B2B record',
};

export const EC_REASON: Record<HolderKind, string> = {
  firm: 'A store rep held the cart, on a number of a firm with a KAM.',
  studio: 'A store rep held the cart, on a Studio Space firm\'s own number.',
  outreach: 'A store rep held the cart, on the number of an Outreach lead raised before this cart.',
  inbound: 'A store rep held the cart, on the number of an Inbound lead raised before this cart.',
  redirect: 'A store rep held the cart, and a redirect to an EC is logged for this number.',
  referred: '',
  unowned: '',
};

export const BUCKET_REASON: Record<Exclude<OrderBucket, 'ec'>, string> = {
  direct: 'A B2B rep held the cart, so the team placed this order itself.',
  referred: 'The number is a client a Studio Space partner referred.',
  unowned: 'A store rep held the cart. The number is only on a firm with no KAM, so it is not counted.',
  untraced: 'Booked on the B2B branch with a store rep on the cart. No firm or lead holds the number, so it is not counted.',
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
