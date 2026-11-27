import type { DimKey } from './types';

export const DIM_ORDER: DimKey[] = ['channel', 'branch', 'rep', 'category', 'source', 'team', 'person', 'clientType', 'size', 'firm'];

export const DIM_META: Record<DimKey, { label: string; hint: string }> = {
  channel: {
    label: 'Channel',
    hint: 'The four revenue channels on the Overview.',
  },
  source: {
    label: 'How B2B holds it',
    hint: 'Why the order counts as B2B: a B2B rep on the cart, a KAM firm, an Inbound or Outreach lead, a logged redirect, a Studio Space firm or referral, or a Client Database firm with no KAM.',
  },
  branch: {
    label: 'Branch',
    hint: 'The home branch of the rep on the cart, the same as the Overview\'s branch filter. For a store order that is the store. Django does not yet send the branch an order was booked at.',
  },
  rep: {
    label: 'Rep on the cart',
    hint: 'Whoever held the deal ticket: the store BM or EC rep for a store order, the B2B rep for their own carts.',
  },
  category: {
    label: 'Category',
    hint: 'The categories on the cart. An order with two categories counts in full under each, so the categories add up to more than the total.',
  },
  team: {
    label: 'B2B team',
    hint: 'The B2B team the order is credited to.',
  },
  person: {
    label: 'Credited to',
    hint: 'The B2B person the order is credited to, including a manager\'s credit.',
  },
  clientType: {
    label: 'Client type',
    hint: 'As recorded on the deal ticket. Most tickets leave it blank.',
  },
  size: {
    label: 'Order size',
    hint: 'Bands of order value.',
  },
  firm: {
    label: 'Firm',
    hint: 'The firm, or the client\'s name when no firm holds the number.',
  },
};

export const SIZE_BANDS: { label: string; below: number }[] = [
  { label: 'Under ₹25K', below: 25_000 },
  { label: '₹25K–1L', below: 1_00_000 },
  { label: '₹1L–3L', below: 3_00_000 },
  { label: '₹3L–10L', below: 10_00_000 },
  { label: '₹10L and above', below: Infinity },
];

export const NOT_SET = {
  team: 'No B2B team',
  person: 'Not credited',
  rep: 'Unknown rep',
  category: 'No category',
  clientType: 'Not recorded',
  firm: 'Unnamed',
};

export const TREND_SPAN = 6;

export const LOAD_PARALLEL = 3;

export const HEAT_ROWS = 12;

export const GAIN = '#0D9488';

export const DROP = '#C2410C';
