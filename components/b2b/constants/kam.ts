import { KamFieldSpec, KamOrderStatus, KamPipelineSplit, KamView, LegacyKamStage } from '../types/kam';
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

export const DAILY_CALL_TARGET = 10;

export const QUEUE_AGE_BANDS = [
  { key: 'fresh',  label: '≤ 7 days',   max: 7,        color: '#F59E0B' },
  { key: 'stale',  label: '8–30 days',  max: 30,       color: '#EA580C' },
  { key: 'rotten', label: '> 30 days',  max: Infinity, color: '#DC2626' },
] as const;

export const TEMPERATURE_SILENCE_DAYS = 45;

export const AT_RISK_WINDOW_DAYS = 30;

export const EMPTY_SPLIT: KamPipelineSplit = { pipeline: 0, estimatedPipeline: 0, count: 0 };

export const STATUS_RANK: Record<KamOrderStatus, number> = {
  'Requirement Logged': 0, 'Quote Shared': 1, 'PI Shared': 2, 'Closed': 3, 'Lost': 3,
};

export const KAM_VIEWS: { key: KamView; label: string; section: string; note: string }[] = [
  { key: 'clients',   label: 'Assigned Clients', section: '§2', note: 'Every client assigned to you, with lifetime order metrics from the deal tickets.' },
  { key: 'today',     label: "Today's Calls",    section: '§4.2', note: 'Clients whose next follow-up date is today.' },
  { key: 'queue',     label: 'Follow-up Queue',  section: '§4.3', note: 'Overdue follow-ups, oldest first. A row clears when you log the call.' },
  { key: 'orders',    label: 'Active Orders',    section: '§5', note: 'Repeat and upsell orders you have raised against an existing client.' },
  { key: 'dashboard', label: 'KAM Dashboard',    section: '§6', note: 'Pipeline, funnel, cohort and call compliance for the KAM book.' },
];

export const KAM_ORDER_FIELDS: KamFieldSpec[] = [
  { key: 'company',        label: 'Company name',        section: '5.1', owner: 'crm',   input: 'select', onCreate: true, hint: 'Your assigned clients only — an order cannot be raised against an account you do not hold' },
  { key: 'requirement',    label: 'Requirement details', section: '5.1', owner: 'crm',   input: 'textarea', onCreate: true },
  { key: 'estimatedValue', label: 'Order value',         section: '5.1', owner: 'crm',   input: 'number', onCreate: true, hint: 'Your estimate at creation — never reported as revenue' },
  { key: 'status',         label: 'Status',              section: '5.1', owner: 'crm',   input: 'select', options: KAM_ORDER_STATUSES, onCreate: true },
  { key: 'enqId',          label: 'Enquiry ID',          section: '5.1', owner: 'crm',   input: 'text', hint: 'Required at PI Shared (§5.2)' },
  { key: 'orderValue',     label: 'Order value (Procurement)', section: '5.1', owner: 'deals', input: 'readonly', hint: 'Read from the deal ticket matching the Enquiry ID. This is the only figure counted as revenue.' },
  { key: 'expectedClosure',label: 'Expected date of closure', section: '5.1', owner: 'crm', input: 'date', onCreate: true },
  { key: 'lostReason',     label: 'Lost reason',         section: '5.1', owner: 'crm',   input: 'select', options: KAM_ORDER_LOST_REASONS, hint: 'Required at Lost (§5.2)' },
];

export const KAM_INTERACTION_FIELDS: KamFieldSpec[] = [
  { key: 'type',             label: 'Interaction type',        section: '3.1', owner: 'crm', input: 'select', options: ['Call', 'Meeting'], onCreate: true },
  { key: 'date',             label: 'Date',                    section: '3.1', owner: 'crm', input: 'date', onCreate: true },
  { key: 'summary',          label: 'Summary',                 section: '3.1', owner: 'crm', input: 'textarea', onCreate: true },
  { key: 'temperature',      label: 'Account temperature',     section: '3.1', owner: 'crm', input: 'number', onCreate: true, hint: '0–10. 0 is very bad, 10 is very good (§3.2).' },
  { key: 'upcomingProject',  label: 'Upcoming project details',section: '3.1', owner: 'crm', input: 'textarea', onCreate: true },
  { key: 'nextFollowUpDate', label: 'Next follow-up date',     section: '3.1', owner: 'crm', input: 'date', onCreate: true, hint: 'Required on a call (§4.1) — it is what fills Today\'s Calls and the Follow-up Queue' },
];
