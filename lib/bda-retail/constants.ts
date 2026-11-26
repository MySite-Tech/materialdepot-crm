import type { CallOutcome, CohortDef, CohortKey, Phase, Priority } from './types';

export const BDA_ROLE = 'bda_retail';

export const BDA_RETAIL_ACCESS = [
  'Dhruv Gangrade',
  'Arpan Banerjee',
  'Sri Harsh Jakoo',
  'Manish Reddy',
  'Sarthak Agrawal',
];

export const COHORTS: CohortDef[] = [
  {
    key: 'cart_no_visit',
    label: 'Added to cart, no EC visit',
    group: 'Added to cart',
    priority: 'P1',
    rule: 'Cart in the last 30 days, has a phone, no Experience Centre visit in the last year, no order since.',
  },
  {
    key: 'pending_quote',
    label: 'Cart idle 7+ days, quote waiting',
    group: 'Pending carts',
    priority: 'P1',
    rule: 'Cart idle 7+ days and a quote waiting for approval.',
  },
  {
    key: 'pending_cart',
    label: 'Cart idle 7+ days, no quote',
    group: 'Pending carts',
    priority: 'P2',
    rule: 'Items sitting in the cart 7+ days, no quote raised.',
  },
  {
    key: 'upsell_carpentry',
    label: 'Carpentry bought, no decorative',
    group: 'Upsell',
    priority: 'P1',
    rule: 'Ordered carpentry 30+ days ago and no decorative order since. Pitch wallpapers, wooden flooring, wall panels.',
  },
  {
    key: 'upsell_civil',
    label: 'Civil bought, no carpentry',
    group: 'Upsell',
    priority: 'P3',
    rule: 'Ordered civil (tiles, quartz) 30+ days ago and no carpentry order since. Pitch plywood, laminates.',
  },
  {
    key: 'upsell_decorative',
    label: 'Decorative only',
    group: 'Upsell',
    priority: 'P3',
    rule: 'Ordered decorative 30+ days ago with no civil or carpentry order from us. Ask whether those were bought elsewhere.',
  },
  {
    key: 'visit_no_cart',
    label: 'EC visit, no cart',
    group: 'No cart created',
    priority: 'P3',
    rule: 'Visited an Experience Centre in the last 30 days and no cart or quote from the visit onward.',
  },
];

export const COHORT_BY_KEY: Record<CohortKey, CohortDef> = Object.fromEntries(
  COHORTS.map((c) => [c.key, c]),
) as Record<CohortKey, CohortDef>;

export const PRIORITIES: Priority[] = ['P1', 'P2', 'P3'];

export const PLAN_PRIORITIES: Array<{ from: string; priorities: Priority[] }> = [
  { from: '2027-03', priorities: ['P1', 'P2', 'P3'] },
  { from: '2027-01', priorities: ['P1', 'P2'] },
  { from: '0000-00', priorities: ['P1'] },
];

export const PLAN_LEADS: Record<string, Record<Priority, number>> = {
  '2026-12': { P1: 3419, P2: 0, P3: 0 },
  '2027-01': { P1: 3487, P2: 4500, P3: 0 },
  '2027-02': { P1: 3557, P2: 4590, P3: 0 },
  '2027-03': { P1: 3628, P2: 4682, P3: 3169 },
  '2027-04': { P1: 3701, P2: 4776, P3: 3233 },
};

export const PHASE_CATEGORIES: Record<Phase, string[]> = {
  civil: ['Tiles', 'Quartz', 'Polygranite Sheets', 'Adhesives', 'Tile and Flooring Accessories'],
  carpentry: [
    'Plywood', 'HDHMR', 'Blockboard', 'MDF', 'HDF', 'Particle Board', 'Prelam Boards', 'Laminates',
    'Liner Laminates', 'Edgebands', 'Veneers', 'Hardware Accessories', 'Doors', 'Composite Board',
  ],
  decorative: [
    'Wallpapers', 'Panels', 'Wall Cladding', 'Laminate Wood Floor', 'Solid Wood Floor', 'SPC Floor',
    'Vinyl Floor', 'Carpet Flooring', 'Wall Profile and Mouldings',
  ],
};

export const CART_WINDOW_DAYS = 30;
export const IDLE_DAYS = 7;
export const PENDING_LOOKBACK_DAYS = 90;
export const UPSELL_LAG_DAYS = 30;
export const UPSELL_WINDOW_DAYS = 30;
export const EARLIER_PHASE_LOOKBACK_DAYS = 180;
export const VISIT_WINDOW_DAYS = 30;
export const EC_VISIT_LOOKBACK_DAYS = 365;
export const ACTIVE_REMARK_DAYS = 7;
export const MAX_UNANSWERED = 3;
export const MAX_PLAUSIBLE_VALUE = 10_000_000;

export const CALL_OUTCOMES: Array<{ key: CallOutcome; label: string; connected: boolean; closes: boolean; needsDate: boolean }> = [
  { key: 'rnr', label: 'Ringing, no answer', connected: false, closes: false, needsDate: false },
  { key: 'busy', label: 'Busy / call cut', connected: false, closes: false, needsDate: false },
  { key: 'switched_off', label: 'Switched off / unreachable', connected: false, closes: false, needsDate: false },
  { key: 'invalid', label: 'Wrong or invalid number', connected: false, closes: true, needsDate: false },
  { key: 'follow_up', label: 'Interested, follow up', connected: true, closes: false, needsDate: true },
  { key: 'visit_booked', label: 'EC visit booked', connected: true, closes: false, needsDate: true },
  { key: 'call_back', label: 'Asked to call back', connected: true, closes: false, needsDate: true },
  { key: 'ordered', label: 'Ordered / will order with us', connected: true, closes: true, needsDate: false },
  { key: 'bought_elsewhere', label: 'Bought elsewhere', connected: true, closes: true, needsDate: false },
  { key: 'not_interested', label: 'Not interested', connected: true, closes: true, needsDate: false },
];

export const PAGE_SIZE = 25;

export const PLAN_DIALS_A_DAY = 110;
export const PLAN_CONNECTIVITY: Record<Priority, number> = { P1: 0.65, P2: 0.6, P3: 0.55 };
export const PLAN_CONVERSION = 0.032;
