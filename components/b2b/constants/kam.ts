import { KamDealLens, KamFirmLens, KamLens, KamLensGroup, KamLensMeta, KamOrderStatus, KamReferralLens, LegacyKamStage } from '../types/kam';
export const KAM_ORDER_STATUSES: KamOrderStatus[] = [
  'Requirement Logged', 'Quote Shared', 'PI Shared', 'Closed', 'Lost',
];

export const KAM_OPEN_STATUSES: KamOrderStatus[] = ['Requirement Logged', 'Quote Shared', 'PI Shared'];

export const KAM_PIPELINE_STATUSES: KamOrderStatus[] = ['Quote Shared', 'PI Shared'];

export const LEGACY_KAM_STAGE: Record<LegacyKamStage, KamOrderStatus> = {
  'No Active Enquiry':      'Requirement Logged',
  'Quote Approval Pending': 'Quote Shared',
  'Awaiting Payment':       'PI Shared',
  'Order Placed':           'Closed',
};

export const KAM_MONTHLY_CALL_TARGET = 500;

export const KAM_MONTHLY_MEETING_TARGET = 35;

const WORKING_DAYS_PER_MONTH = 26;

export const DAILY_CALL_TARGET = Math.ceil(KAM_MONTHLY_CALL_TARGET / WORKING_DAYS_PER_MONTH);

export const QUEUE_AGE_BANDS = [
  { key: 'fresh',  label: '≤ 7 days',   max: 7,        color: '#F59E0B' },
  { key: 'stale',  label: '8–30 days',  max: 30,       color: '#EA580C' },
  { key: 'rotten', label: '> 30 days',  max: Infinity, color: '#DC2626' },
] as const;

export const TEMPERATURE_SILENCE_DAYS = 45;

export const STATUS_RANK: Record<KamOrderStatus, number> = {
  'Requirement Logged': 0, 'Quote Shared': 1, 'PI Shared': 2, 'Closed': 3, 'Lost': 3,
};

export const KAM_LENS: Record<KamLens, KamLensMeta> = {
  deals:      { title: 'Carts & PIs', rule: 'Every open cart and PI on these firms\' numbers, one row each, from the deal tickets. This is the KAM\'s pipeline: log a follow-up on each one until it becomes an order.', empty: 'No firm has an open cart or PI.', accent: '#7C3AED' },
  cartOpen:   { title: 'Carts open', rule: 'An open cart with no follow-up logged on it since it was raised. Newest first.', empty: 'Every open cart has a follow-up logged.', accent: '#4F46E5' },
  piOpen:     { title: 'PI open', rule: 'An open PI with no follow-up logged on it since it was raised. Newest first.', empty: 'Every open PI has a follow-up logged.', accent: '#9333EA' },
  cartFollow: { title: 'Carts follow up', rule: 'An open cart with a follow-up logged on it. Next follow-up first, overdue at the top.', empty: 'No cart is being followed up.', accent: '#6366F1' },
  piFollow:   { title: 'PI follow up', rule: 'An open PI with a follow-up logged on it. Next follow-up first, overdue at the top.', empty: 'No PI is being followed up.', accent: '#A855F7' },
  work:     { title: 'Calls & meetings', rule: 'Firms with a call or meeting to do now: overdue, a call due today or a meeting today. Follow-ups on a cart or PI are under Carts & PIs.', empty: 'Nothing is due today or overdue.', accent: '#3B82F6' },
  overdue:  { title: 'Overdue', rule: 'The firm\'s next call or meeting is before today. Oldest first (§4.3). A firm leaves the moment you log the call or meeting.', empty: 'No follow-up is overdue.', accent: '#DC2626' },
  due:      { title: 'Calls today', rule: 'The firm\'s next follow-up is a call, due today.', empty: 'No call is due today.', accent: '#EA580C' },
  meetings: { title: 'Meetings today', rule: 'A follow-up due today that was booked as a meeting.', empty: 'No meeting is booked for today.', accent: '#0EA5E9' },
  nofollow: { title: 'No follow-up', rule: 'The latest interaction set no next follow-up date, or nothing is logged at all, so the firm never comes up as due.', empty: 'Every firm has a follow-up booked.', accent: '#9CA3AF' },
  called:   { title: 'Called today', rule: 'Firms with a Call logged today. Counted once per firm per day, against the §4.1 target, which is reported and not enforced.', empty: 'No call logged today yet.', accent: '#0F766E' },
  upcoming: { title: 'Upcoming', rule: 'Follow-up booked after today.', empty: 'No follow-up is booked ahead.', accent: '#0EA5E9' },
  referred:   { title: 'Referred clients', rule: 'End clients these firms referred to Material Depot, added on the firm page or on Studio Space. Keep the firm and the client moving until they shop at an EC and order.', empty: 'None of these firms has referred a client yet.', accent: '#0D9488' },
  refNone:    { title: 'Not at an EC yet', rule: 'No deal ticket on the referred client\'s number at any EC: no cart, PI or order. A walk-in who bought nothing leaves no ticket, so ask the firm or the client. Oldest referral first.', empty: 'Every referred client has a cart or an order.', accent: '#DC2626' },
  refCart:    { title: 'Cart, no order', rule: 'The referred client has a cart, PI or other deal ticket but no order yet.', empty: 'No referred client is waiting at a cart.', accent: '#F59E0B' },
  refOrdered: { title: 'Ordered', rule: 'The referred client has placed at least one order (Django, or Studio Space\'s referral ledger).', empty: 'No referred client has ordered yet.', accent: '#16A34A' },
  signoff:  { title: 'Waiting for sign-off', rule: 'Firms an admin assigned to a KAM, waiting for that KAM to accept or reject, oldest first. A rejected firm goes back to its previous KAM, or to No KAM, for the admin to reassign. The tile flags those past the sign-off window.', empty: 'No firm is waiting for a KAM to sign off.', accent: '#7C3AED' },
  assigned: { title: 'Assigned', rule: 'Every firm in scope, with lifetime order metrics from the deal tickets (§2).', empty: 'No firm is assigned.', accent: '#6B7280' },
  active:   { title: 'Active', rule: 'Last order placed this calendar month or last (M-0 or M-1). A firm changes band only on the 1st of a month.', empty: 'No firm has ordered this month or last month.', accent: '#22C55E' },
  lapsing:  { title: 'Inactive 2–3 months', rule: 'Last order two or three calendar months back (M-2 or M-3). Closest to going fully inactive first.', empty: 'No firm last ordered two or three months back.', accent: '#F59E0B' },
  inactive: { title: 'Inactive 4+ months', rule: 'Last order four or more calendar months back (M-4 or older). Firms with no order on record are under Never ordered.', empty: 'No inactive firm.', accent: '#9CA3AF' },
  never:    { title: 'Never ordered', rule: 'No order on record for any of the firm’s numbers.', empty: 'Every firm has ordered at least once.', accent: '#D1D5DB' },
  details:  { title: 'Details missing', rule: 'Firms missing any of: contact person, their designation, client type, segment, city, office address, GST (an End Consumer is not asked for segment, office address or GST). Open one and use Edit details. Most missing first.', empty: 'Every firm has its details filled.', accent: '#DC2626' },
};

export const KAM_LENS_GROUPS: KamLensGroup[] = [
  { title: 'Carts & PIs', head: 'deals', lenses: ['cartOpen', 'piOpen', 'cartFollow', 'piFollow'], row: 1 },
  { title: 'Calls & meetings', head: 'work', lenses: ['overdue', 'due', 'meetings', 'nofollow', 'called'], row: 1 },
  { title: 'Referred clients', head: 'referred', lenses: ['refNone', 'refCart', 'refOrdered'], row: 2 },
  { title: 'Accounts', lenses: ['assigned', 'active', 'lapsing', 'inactive', 'never'], row: 2 },
  { title: 'Handovers', lenses: ['signoff'], row: 2 },
];

export const KAM_SIDE_LENSES: KamLens[] = ['upcoming', 'details'];

export const KAM_DEAL_LENSES: KamDealLens[] = ['deals', 'cartOpen', 'piOpen', 'cartFollow', 'piFollow'];

export const KAM_REFERRAL_LENSES: KamReferralLens[] = ['referred', 'refNone', 'refCart', 'refOrdered'];

export const KAM_FIRM_LENSES: KamFirmLens[] = ['signoff', 'assigned', 'work', 'overdue', 'due', 'meetings', 'nofollow', 'called', 'upcoming', 'active', 'lapsing', 'inactive', 'never', 'details'];

export const KAM_LIST_PAGE_SIZE = 25;
