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
    hint: 'A client the B2B team already worked with on the order\'s day, ordering through a store: a B2B rep on a store cart, or a store rep (wherever it was booked) for a firm whose B2B tie-up had started by then. It starts on the earliest of: a B2B person taking one of its orders, its first KAM assignment, an Inbound or Outreach lead or SPoC, a logged redirect, or its Studio Space onboarding. These orders are also in that store\'s own revenue.',
  },
  ecDirect: {
    label: CHANNEL_LABELS.ecDirect,
    color: '#0891B2',
    hint: 'A store rep\'s order (wherever it was booked) for a firm B2B knows (Client Database, KAM or Studio Space) from before its B2B tie-up started: firms buying from the store on their own. Not part of Studio Sales. These orders are also in that store\'s own revenue.',
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
  4: { label: 'B2B client', rule: 'Booked by a store rep (at a store or on the B2B branch), for a firm B2B was already working with on the order\'s day.' },
  5: { label: 'Referred client', rule: 'The number is a client a Studio Space partner referred, so it counts in Referred wherever it was booked.' },
  8: { label: 'Before B2B', rule: 'Booked by a store rep (at a store or on the B2B branch), for a firm B2B knows, before its B2B tie-up started.' },
};

export const HELD_BY: Record<HolderKind, string> = {
  firm: 'The firm had a KAM by then.',
  studio: 'The firm was on Studio Space by then.',
  outreach: 'The number is on an Outreach lead or SPoC from before this cart.',
  inbound: 'The number is on an Inbound lead or SPoC from before this cart.',
  redirect: 'A redirect to an EC was logged for this firm before this cart.',
  b2bOrder: 'A B2B person had already taken an order for this firm.',
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
