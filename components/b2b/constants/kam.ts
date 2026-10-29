import { ACTIVE_DAYS, INACTIVE_DAYS } from './client';
import { KamFirmLens, KamLens, KamLensMeta, KamOrderStatus, LegacyKamStage } from '../types/kam';
export const KAM_ORDER_STATUSES: KamOrderStatus[] = [
  'Requirement Logged', 'Quote Shared', 'PI Shared', 'Closed', 'Lost',
];

export const KAM_ORDER_STATUS_COLORS: Record<KamOrderStatus, string> = {
  'Requirement Logged': '#9CA3AF',
  'Quote Shared':       '#6366F1',
  'PI Shared':          '#8B5CF6',
  'Closed':             '#22C55E',
  'Lost':               '#EF4444',
};

export const KAM_ORDER_STATUS_HINT: Record<KamOrderStatus, string> = {
  'Requirement Logged': 'Requirement captured, no quote out yet — not a PRD status, see kamModel.ts',
  'Quote Shared':       'Quote logged as shared with the client; no Enquiry ID yet',
  'PI Shared':          'Enquiry ID raised; order value comes from the deal ticket',
  'Closed':             'Order placed — value and closure details come from the deal ticket',
  'Lost':               'Needs a lost reason',
};

export const KAM_OPEN_STATUSES: KamOrderStatus[] = ['Requirement Logged', 'Quote Shared', 'PI Shared'];

export const KAM_PIPELINE_STATUSES: KamOrderStatus[] = ['Quote Shared', 'PI Shared'];

export const LEGACY_KAM_STAGE: Record<LegacyKamStage, KamOrderStatus> = {
  'No Active Enquiry':      'Requirement Logged',
  'Quote Approval Pending': 'Quote Shared',
  'Awaiting Payment':       'PI Shared',
  'Order Placed':           'Closed',
};

export const KAM_ORDER_LOST_REASONS = [
  'Selection Not Liked',
  'Price Issue',
  'Timeline/Delivery Delay',
  'Client deferred the project',
  'Lost to a competitor',
] as const;

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
  signoff:  { title: 'Waiting for sign-off', rule: 'Firms an admin assigned to a KAM, waiting for that KAM to accept or reject, oldest first. The tile flags those past the sign-off window. A rejected firm goes back to the Client Database with no KAM.', empty: 'No firm is waiting for a KAM to sign off.', accent: '#7C3AED' },
  assigned: { title: 'Assigned', rule: 'Every firm in scope, with lifetime order metrics from the deal tickets (§2).', empty: 'No firm is assigned.', accent: '#6B7280' },
  overdue:  { title: 'Overdue', rule: 'The follow-up date on the latest interaction is before today. Oldest first (§4.3). A firm leaves the moment you log the call.', empty: 'No follow-up is overdue.', accent: '#DC2626' },
  due:      { title: 'Due today', rule: 'The follow-up date on the latest interaction is today (§4.2).', empty: 'No follow-up is due today.', accent: '#EA580C' },
  nofollow: { title: 'No follow-up', rule: 'The latest interaction set no next follow-up date, or nothing is logged at all, so the firm never comes up as due.', empty: 'Every firm has a follow-up booked.', accent: '#9CA3AF' },
  called:   { title: 'Called today', rule: 'Firms with a Call logged today. Counted once per firm per day, against the §4.1 target, which is reported and not enforced.', empty: 'No call logged today yet.', accent: '#0F766E' },
  upcoming: { title: 'Upcoming', rule: 'Follow-up booked after today.', empty: 'No follow-up is booked ahead.', accent: '#0EA5E9' },
  active:   { title: 'Active', rule: `Last order placed within the last ${ACTIVE_DAYS} days.`, empty: `No firm has ordered in the last ${ACTIVE_DAYS} days.`, accent: '#22C55E' },
  lapsing:  { title: 'Inactive 1 month', rule: `No order in the last ${ACTIVE_DAYS} days, but one ${ACTIVE_DAYS + 1}–${INACTIVE_DAYS} days ago. Closest to going fully inactive first.`, empty: 'No firm is in its first month without an order.', accent: '#F59E0B' },
  inactive: { title: 'Inactive', rule: `Last order more than ${INACTIVE_DAYS} days ago, or none on record.`, empty: 'No inactive firm.', accent: '#9CA3AF' },
  open:     { title: 'Open orders', rule: 'Orders at Requirement Logged, Quote Shared or PI Shared.', empty: 'No open order.', accent: '#6366F1' },
  pipeline: { title: 'Pipeline', rule: 'Orders at Quote Shared or PI Shared. Ticket value and the KAM estimate are kept apart, never summed.', empty: 'No order is at Quote or PI.', accent: '#8B5CF6' },
  orders:   { title: 'Order board', rule: 'Every order on the board, by status, with the procurement sync.', empty: 'No orders.', accent: '#1A1A1A' },
};

export const KAM_LENS_GROUPS: { title: string; lenses: KamLens[] }[] = [
  { title: 'Handovers', lenses: ['signoff'] },
  { title: 'Follow-ups', lenses: ['overdue', 'due', 'nofollow', 'called'] },
  { title: 'Accounts', lenses: ['assigned', 'active', 'lapsing', 'inactive'] },
  { title: 'Orders', lenses: ['open', 'pipeline'] },
];

export const KAM_SIDE_LENSES: KamLens[] = ['upcoming', 'orders'];

export const KAM_FIRM_LENSES: KamFirmLens[] = ['signoff', 'assigned', 'overdue', 'due', 'nofollow', 'called', 'upcoming', 'active', 'lapsing', 'inactive'];

export const KAM_LIST_PAGE_SIZE = 25;
