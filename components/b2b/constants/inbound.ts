import { Selection } from '../types/inbound';
import { ClientType, ClosureReason, EnrichmentInput, FieldOwner, FollowUpBucket, InboundLocation, InboundStatus, LeadType, LegacyDecomposition, LegacyStage, PlacedUnder, Priority } from '../types/inbound';
export const OWNER_LABEL: Record<FieldOwner, string> = {
  'kylas':       'From Presales',
  'kylas-write': 'Synced to Kylas',
  'crm':         'You own this',
  'deals':       'From deal tickets',
  'derived':     'Auto-filled',
};

export const OWNER_CHIP: Record<FieldOwner, string> = {
  'kylas':       'Kylas',
  'kylas-write': 'Kylas ⇄',
  'crm':         'CRM',
  'deals':       'Deals',
  'derived':     'Auto',
};

export const INBOUND_NURTURE_STATUS: InboundStatus = 'Connected - Need nurturing';

export const INBOUND_STATUSES: InboundStatus[] = [
  'New', INBOUND_NURTURE_STATUS, 'Follow up', 'PI Shared', 'Closed', 'Lost', 'Invalid',
];

export const INBOUND_STATUS_COLORS: Record<InboundStatus, string> = {
  'New':                        '#3B82F6',
  'Connected - Need nurturing': '#0EA5E9',
  'Follow up':                  '#F59E0B',
  'PI Shared':                  '#8B5CF6',
  'Closed':                     '#22C55E',
  'Lost':                       '#EF4444',
  'Invalid':                    '#6B7280',
};

export const INBOUND_STATUS_HINT: Record<InboundStatus, string> = {
  'New':                        'Synced from Kylas, not yet actioned',
  'Connected - Need nurturing': 'Spoke to them, no live requirement yet — keep warming',
  'Follow up':                  'Needs a next follow-up date',
  'PI Shared':                  'Enq ID raised; order value comes from the deal ticket',
  'Closed':                     'Order placed. KAM takes over after Outreach, not from here',
  'Lost':                       'A genuine enquiry that did not convert — needs a lost reason',
  'Invalid':                    'Not a genuine enquiry — needs a logged call, a reason and a note',
};

export const INBOUND_CLOSED_STATUSES: InboundStatus[] = ['Closed', 'Lost', 'Invalid'];

export const INBOUND_FOLLOW_UP_STATUSES: InboundStatus[] = [
  INBOUND_NURTURE_STATUS, 'Follow up', 'PI Shared',
];

export const INBOUND_OPEN_STATUSES: InboundStatus[] = [
  'New', INBOUND_NURTURE_STATUS, 'Follow up', 'PI Shared',
];

export const isFollowUpStatus = (s: InboundStatus): boolean =>
  INBOUND_FOLLOW_UP_STATUSES.includes(s);

export const isOpenStatus = (s: InboundStatus): boolean =>
  INBOUND_OPEN_STATUSES.includes(s);

export const INVALID_ENQUIRY_REASON = 'Enquiry invalid';

export const LEGACY_STAGES: Record<LegacyStage, LegacyDecomposition> = {
  'New':               { status: 'New' },
  'Hyderabad':         { status: 'Follow up', location: 'Hyderabad' },
  'RNR':               { status: 'Follow up', rnr: true },
  'Followup Required': { status: 'Follow up' },
  'Quote':             { status: 'Follow up' },
  'PI Shared':         { status: 'PI Shared' },
  'Closed':            { status: 'Closed' },
  'Lost':              { status: 'Lost' },
  'Enquiry Invalid':   { status: 'Invalid' },
};

export const INBOUND_LOCATIONS: InboundLocation[] = ['Bangalore', 'Hyderabad'];

export const SEGMENTS = ['1', '2', '3'] as const;

export const CLIENT_TYPES = [
  'Architect', 'Interior Designer', 'Contractor', 'End Consumer', 'Others',
] as const;

export const LEAD_TYPES = ['Hot', 'Warm', 'Cold'] as const;

export const LEAD_TYPE_COLORS: Record<LeadType, string> = {
  Hot:  '#EF4444',
  Warm: '#F59E0B',
  Cold: '#64748B',
};

export const PRIORITIES = ['P1', 'P2', 'P3'] as const;

export const PRIORITY_COLORS: Record<Priority, string> = {
  P1: '#DC2626',
  P2: '#EA580C',
  P3: '#64748B',
};

export const KYLAS_CLIENT_TYPE_MAP: Record<string, ClientType> = {
  'home owner': 'End Consumer',
  'contractor': 'Contractor',
};

export const SELECTIONS = [
  'Tiles', 'Plywood', 'Laminates', 'Panels', 'Wallpaper', 'Flooring', 'Others',
] as const;

export const SELECTION_KYLAS_LABEL: Partial<Record<Selection, string>> = {
  'Tiles':     'Tiles',
  'Laminates': 'Laminates',
  'Panels':    'Panels',
  'Wallpaper': 'Wallpapers',
  'Flooring':  'Wooden Flooring',
  'Others':    'Others',
  // 'Plywood' intentionally absent — no Kylas picklist option exists.
};

export const READY_RNR_COUNT = 5;

export const READY_WINDOW_DAYS = 7;

export const MIN_ATTEMPTS_BEFORE_CLOSE = 5;

export const INBOUND_DAY_CUTOFF_HOUR = 17;

export const NON_WORKING_WEEKDAYS = [0];

export const DISCUSSION_NOTE_MIN = 10;

export const PLACED_UNDER_FIELDS: { key: keyof PlacedUnder; label: string; owner: FieldOwner; hint?: string }[] = [
  { key: 'bmName',   label: 'BM name',    owner: 'deals', hint: 'Assignee on the matched deal ticket' },
  { key: 'spok',     label: 'Spok',       owner: 'crm',   hint: 'Whoever actually called and closed this lead' },
  { key: 'ecName',   label: 'EC name',    owner: 'crm',   hint: 'Only if the order closed at an End Consumer' },
  { key: 'ecBmName', label: 'EC BM name', owner: 'deals', hint: 'Only if the order closed at an End Consumer' },
];

export const PLACED_UNDER_TITLE: Partial<Record<InboundStatus, string>> = {
  'PI Shared': 'Assisted by',
  'Closed':    'Placed under',
};

export const PLACED_UNDER_SUBTITLE: Partial<Record<InboundStatus, string>> = {
  'PI Shared': '§3.5 — who is working the PI; carried forward when it closes',
  'Closed':    '§3.5 — captured on order won',
};

export const ENRICHMENT_CHECKS: { key: keyof EnrichmentInput; label: string; filled: (l: EnrichmentInput) => boolean }[] = [
  { key: 'companyName',        label: 'Company name',   filled: (l) => !!String(l.companyName || '').trim() },
  { key: 'primaryContactName', label: 'Primary person', filled: (l) => !!String(l.primaryContactName || '').trim() && !!String(l.primaryContactPhone || '').trim() },
  { key: 'gstNumber',          label: 'GST number',     filled: (l) => !!String(l.gstNumber || '').trim() },
  { key: 'segment',            label: 'Segment',        filled: (l) => !!l.segment },
  { key: 'clientType',         label: 'Client type',    filled: (l) => !!l.clientType },
  { key: 'leadType',           label: 'Lead type',      filled: (l) => !!l.leadType },
  { key: 'priority',           label: 'Priority',       filled: (l) => !!l.priority },
  { key: 'selections',         label: 'Selection',      filled: (l) => !!(l.selections || []).length },
  { key: 'expectedOrderValue', label: 'Expected value', filled: (l) => Number(l.expectedOrderValue || 0) > 0 },
  { key: 'location',           label: 'City',           filled: (l) => !!l.location },
];

export const ENRICHMENT_FIELD_COUNT = ENRICHMENT_CHECKS.length;

export const FOLLOW_UP_LABEL: Record<FollowUpBucket, string> = {
  overdue:  'Overdue',
  today:    'Due today',
  upcoming: 'Upcoming',
  none:     'No follow-up set',
};

export const FOLLOW_UP_COLORS: Record<FollowUpBucket, string> = {
  overdue:  '#DC2626',
  today:    '#EA580C',
  upcoming: '#0F766E',
  none:     '#9CA3AF',
};

export const LOST_UNREACHABLE = 'Unreachable — 5 RNRs in 7 days';

export const LOST_STALLED = 'No progress in 7 days';

export const LOST_REASON_NEEDS: Record<string, ClosureReason> = {
  [LOST_UNREACHABLE]: 'unreachable',
  [LOST_STALLED]: 'stalled',
};

export const INBOUND_ADD_SOURCES = ['WhatsApp', 'Referral', 'Walk-in', 'Phone call', 'Email', 'Event', 'Website form', 'Other'] as const;

export const INBOUND_LOST_REASONS = [
  LOST_UNREACHABLE,
  LOST_STALLED,
  'Price Issue',
  'Selection Not Liked',
  'Timeline/Delivery Delay',
  'Bought from another supplier',
  'Project on hold or cancelled',
  'Requirement too small',
  'Product not in our range',
  'Outside our delivery area',
] as const;

export const INBOUND_INVALID_REASONS = [
  'Wrong or not-in-service number',
  'Not a B2B buyer (retail / one-off)',
  'Homeowner, not a professional',
  'Spam or test enquiry',
  'Duplicate of another lead',
  'Existing client already with a KAM',
  'Outside our service area',
  'Vendor or job seeker',
  'Other',
] as const;

export const INVALID_NOTE_MIN = 15;

export const DEAL_ORDER_STATUSES = [
  'Order Placed', 'Order Confirmed', 'Partly Shipped', 'Shipped', 'Partly Delivered', 'Delivered',
];
