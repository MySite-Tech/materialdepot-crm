import { Selection } from '../types/inbound';
import { ClientType, EnrichmentInput, FieldOwner, FollowUpBucket, InboundLocation, InboundStatus, LeadType, LegacyDecomposition, LegacyStage, PlacedUnder, Priority } from '../types/inbound';
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

export const INBOUND_STATUSES: InboundStatus[] = ['New', 'Follow up', 'PI Shared', 'Closed', 'Lost'];

export const INBOUND_STATUS_COLORS: Record<InboundStatus, string> = {
  'New':       '#3B82F6',
  'Follow up': '#F59E0B',
  'PI Shared': '#8B5CF6',
  'Closed':    '#22C55E',
  'Lost':      '#EF4444',
};

export const INBOUND_STATUS_HINT: Record<InboundStatus, string> = {
  'New':       'Synced from Kylas, not yet actioned',
  'Follow up': 'Needs a next follow-up date',
  'PI Shared': 'Enq ID raised; order value comes from the deal ticket',
  'Closed':    'Order placed — handed to a KAM',
  'Lost':      'Needs a lost reason',
};

const INVALID_ENQUIRY_REASON = 'Enquiry invalid';

export const LEGACY_STAGES: Record<LegacyStage, LegacyDecomposition> = {
  'New':               { status: 'New' },
  'Hyderabad':         { status: 'Follow up', location: 'Hyderabad' },
  'RNR':               { status: 'Follow up', rnr: true },
  'Followup Required': { status: 'Follow up' },
  'Quote':             { status: 'Follow up' },
  'PI Shared':         { status: 'PI Shared' },
  'Closed':            { status: 'Closed' },
  'Lost':              { status: 'Lost' },
  'Enquiry Invalid':   { status: 'Lost', lostReason: INVALID_ENQUIRY_REASON },
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

export const MAX_CALL_ATTEMPTS = 4;

export const PLACED_UNDER_FIELDS: { key: keyof PlacedUnder; label: string; owner: FieldOwner; hint?: string }[] = [
  { key: 'bmName',   label: 'BM name',    owner: 'deals', hint: 'Assignee on the matched deal ticket' },
  { key: 'spok',     label: 'Spok',       owner: 'crm',   hint: 'Whoever actually called and closed this lead' },
  { key: 'ecName',   label: 'EC name',    owner: 'crm',   hint: 'Only if the order closed at an End Consumer' },
  { key: 'ecBmName', label: 'EC BM name', owner: 'deals', hint: 'Only if the order closed at an End Consumer' },
];

export const ENRICHMENT_CHECKS: { key: keyof EnrichmentInput; label: string; filled: (l: EnrichmentInput) => boolean }[] = [
  { key: 'companyName',        label: 'Company name',   filled: (l) => !!String(l.companyName || '').trim() },
  { key: 'gstNumber',          label: 'GST number',     filled: (l) => !!String(l.gstNumber || '').trim() },
  { key: 'segment',            label: 'Segment',        filled: (l) => !!l.segment },
  { key: 'clientType',         label: 'Client type',    filled: (l) => !!l.clientType },
  { key: 'leadType',           label: 'Lead type',      filled: (l) => !!l.leadType },
  { key: 'priority',           label: 'Priority',       filled: (l) => !!l.priority },
  { key: 'selections',         label: 'Selection',      filled: (l) => !!(l.selections || []).length },
  { key: 'expectedOrderValue', label: 'Expected value', filled: (l) => Number(l.expectedOrderValue || 0) > 0 },
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

export const INBOUND_LOST_REASONS = [
  'Selection Not Liked',
  'Price Issue',
  'Timeline/Delivery Delay',
  'Unreachable (4 attempts)',
  INVALID_ENQUIRY_REASON,
] as const;
