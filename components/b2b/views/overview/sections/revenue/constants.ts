import { CHANNEL_LABELS } from '@/lib/b2b/revenue';
import type { HolderKind, OrderType, RevenueChannel } from '@/lib/b2b/revenue';

export const CHANNEL_META: Record<RevenueChannel, { label: string; color: string; hint: string }> = {
  direct: {
    label: CHANNEL_LABELS.direct,
    color: '#4F46E5',
    hint: 'Booked on the B2B branch (HQ until June 2026) by someone on the B2B team that day. A store rep\'s order on the B2B branch counts as a store order, so a person who left B2B counts as their store from their last day. Referred clients are counted in Referred instead.',
  },
  redirected: {
    label: CHANNEL_LABELS.redirected,
    color: '#DB2777',
    hint: 'A client the B2B team already works with, ordering through a store: a B2B rep on a store cart, or a store rep (wherever it was booked) on a number held by a KAM, an Inbound or Outreach SPoC or lead, or a logged redirect. These orders are also in that store\'s own revenue.',
  },
  ecDirect: {
    label: CHANNEL_LABELS.ecDirect,
    color: '#0891B2',
    hint: 'A store rep\'s order (wherever it was booked) for a Client Database firm that has no KAM and no Inbound or Outreach SPoC: firms buying from the store on their own, before any B2B tie-up. Not part of Studio Sales. These orders are also in that store\'s own revenue.',
  },
  referred: {
    label: CHANNEL_LABELS.referred,
    color: '#65A30D',
    hint: 'Orders from clients a Studio Space partner referred, from the day of the referral, wherever they were booked. Always credited to KAM.',
  },
};

export const TYPE_META: Record<OrderType, { label: string; rule: string }> = {
  1: { label: 'B2B rep on cart', rule: 'A B2B rep held the cart and booked it on the B2B branch.' },
  2: { label: 'B2B rep on cart', rule: 'A B2B rep held the cart and booked it at a store.' },
  4: { label: 'B2B client', rule: 'Booked by a store rep (at a store or on the B2B branch), on a number B2B holds.' },
  5: { label: 'Referred client', rule: 'The number is a client a Studio Space partner referred, so it counts in Referred wherever it was booked.' },
  8: { label: 'No-KAM firm', rule: 'Booked by a store rep (at a store or on the B2B branch), for a Client Database firm with no KAM yet.' },
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
