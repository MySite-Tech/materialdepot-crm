import type { HolderKind, OrderType, RevenueChannel } from '@/lib/b2b/revenue';

export const CHANNEL_META: Record<RevenueChannel, { label: string; color: string; hint: string }> = {
  direct: {
    label: 'Direct',
    color: '#4F46E5',
    hint: 'Every order placed on the B2B branch, whoever held the cart: HQ until June 2026, the B2B branch from July. Referred clients are counted in Referred instead. At HQ, a walk-in on no B2B record is not counted, because HQ is also a store.',
  },
  redirected: {
    label: 'Studio EC Redirected',
    color: '#DB2777',
    hint: 'Booked at a store by a firm the B2B team already works with: a B2B rep on the cart, or a number held by a KAM, an Inbound or Outreach SPoC or lead, or a logged redirect. These orders are also in that store\'s own revenue.',
  },
  ecDirect: {
    label: 'EC Direct',
    color: '#0891B2',
    hint: 'Booked at a store by a Client Database firm that has no KAM and no Inbound or Outreach SPoC: firms buying from the store on their own, before any B2B tie-up. These orders are also in that store\'s own revenue.',
  },
  referred: {
    label: 'Referred clients',
    color: '#65A30D',
    hint: 'Orders from clients a Studio Space partner referred, from the day of the referral, wherever they were booked. Always credited to KAM.',
  },
};

export const TYPE_META: Record<OrderType, { label: string; rule: string }> = {
  1: { label: 'B2B rep on cart', rule: 'A B2B rep held the cart and booked it on the B2B branch.' },
  2: { label: 'B2B rep on cart', rule: 'A B2B rep held the cart and booked it at a store.' },
  3: { label: 'B2B client', rule: 'Booked on the B2B branch by a store rep, on a number B2B holds.' },
  4: { label: 'B2B client', rule: 'Booked at a store by a store rep, on a number B2B holds.' },
  5: { label: 'Referred client', rule: 'The number is a client a Studio Space partner referred, so it counts in Referred wherever it was booked.' },
  6: { label: 'No-KAM firm', rule: 'Booked on the B2B branch by a store rep, for a Client Database firm with no KAM yet.' },
  7: { label: 'No B2B record', rule: 'Booked on the B2B branch by a store rep. No firm or lead holds the number.' },
  8: { label: 'No-KAM firm', rule: 'Booked at a store by a store rep, for a Client Database firm with no KAM yet.' },
};

export const HELD_BY: Record<HolderKind, string> = {
  firm: 'The number is on a firm with a KAM.',
  studio: 'It is a Studio Space firm\'s own number.',
  outreach: 'The number is on an Outreach lead or SPoC from before this cart.',
  inbound: 'The number is on an Inbound lead or SPoC from before this cart.',
  redirect: 'A redirect to an EC is logged for this number.',
  referred: '',
  unowned: '',
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
