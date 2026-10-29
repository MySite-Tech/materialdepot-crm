import {
  SEGMENTS, LEAD_TYPES, LEAD_TYPE_COLORS, SELECTIONS, istToday, followUpBucket, daysUntil,
  nextKamRoundRobin,
  type Segment, type LeadType, type Selection, type FieldOwner, type FollowUpBucket,
} from '../inbound';

export type { Segment, LeadType, Selection, FollowUpBucket };
export {
  SEGMENTS, LEAD_TYPES, LEAD_TYPE_COLORS, SELECTIONS, istToday, followUpBucket, daysUntil,

  nextKamRoundRobin,
};

export type OutreachStatus =
  | 'Yet to Meet' | 'Follow up' | 'Quote Share' | 'PI Shared' | 'Closed' | 'Lost';

export const OUTREACH_STATUSES: OutreachStatus[] = [
  'Yet to Meet', 'Follow up', 'Quote Share', 'PI Shared', 'Closed', 'Lost',
];

export const OUTREACH_STATUS_COLORS: Record<OutreachStatus, string> = {
  'Yet to Meet': '#3B82F6',
  'Follow up':   '#F59E0B',
  'Quote Share': '#6366F1',
  'PI Shared':   '#8B5CF6',
  'Closed':      '#22C55E',
  'Lost':        '#EF4444',
};

export const OUTREACH_STATUS_HINT: Record<OutreachStatus, string> = {
  'Yet to Meet': 'Created in the field, first meeting not held yet',
  'Follow up':   'Needs a next follow-up date',
  'Quote Share': 'Quote logged as shared with the client',
  'PI Shared':   'Enq ID raised; order value comes from the deal ticket',
  'Closed':      'First order placed — converted, next is the KAM handover',
  'Lost':        'Needs a lost reason',
};

export const OUTREACH_STATUS_LABEL: Record<OutreachStatus, string> = {
  'Yet to Meet': 'Yet to Meet',
  'Follow up':   'Follow up',
  'Quote Share': 'Quote Share',
  'PI Shared':   'PI Shared',
  'Closed':      'Converted',
  'Lost':        'Lost',
};

export const OUTREACH_OPEN_STATUSES: OutreachStatus[] = ['Yet to Meet', 'Follow up', 'Quote Share', 'PI Shared'];

export const OUTREACH_SOURCES = ['Inbound', 'EC referral', 'Dormant form', 'Own research'] as const;
export type OutreachSource = typeof OUTREACH_SOURCES[number];

export const OUTREACH_SOURCE_HINT: Record<OutreachSource, string> = {
  'Inbound':      'Handed over by the Inbound team for an in-person meeting',
  'EC referral':  'Referred by an Experience Centre',
  'Dormant form': 'From an older lead form that is no longer worked',
  'Own research': 'Found by the BM — field visit, directory, Instagram',
};

export const COVERAGE_SOURCES: OutreachSource[] = ['Inbound', 'EC referral'];

export const TEAM_SIZES = ['1', '2-5', '6-15', '16-50', '50+'] as const;
export type TeamSize = typeof TEAM_SIZES[number];

export const CONTACT_ROLES = [
  'Owner / Principal', 'Partner', 'Designer', 'Project manager', 'Procurement', 'Site supervisor', 'Accounts',
] as const;

export interface OutreachContact {
  name: string;
  role: string;
  phone?: string;
}

export interface GeoPin {
  lat: number;
  lng: number;
  accuracy?: number;
  at: string;
}

export const pinMapUrl = (p: GeoPin): string => `https://www.google.com/maps?q=${p.lat},${p.lng}`;

export const STUDIO_WAITLIST_URL = 'https://studio.materialdepot.com/join';

export interface OutreachIntake {
  from: 'Inbound';
  inboundLeadId: string;
  inboundOwner?: string;
  inboundStage?: string;
  assignedAt: string;
  assignedBy: string;
  acceptedAt?: string;
  rejectedAt?: string;
  rejectReason?: string;
}

export type HandoverStatus = 'Pending' | 'Accepted' | 'Rejected';

export interface OutreachHandover {
  kam: string;
  kamPhone?: string;
  whatsappGroupLink: string;
  sentAt: string;
  sentBy: string;
  status: HandoverStatus;
  respondedAt?: string;
  respondedBy?: string;
  rejectReason?: string;
  note?: string;
}

export type JourneyKind =
  | 'created' | 'imported' | 'intake' | 'intake-accepted' | 'intake-rejected'
  | 'status' | 'meeting-scheduled' | 'meeting-held' | 'meeting-postponed'
  | 'order-verified' | 'handover-sent' | 'handover-accepted' | 'handover-rejected' | 'bm-changed'
  | 'follow-up-set' | 'note-added' | 'contact-added';

export interface JourneyEvent {
  at: string;
  by: string;
  kind: JourneyKind;
  text: string;
}

export interface WaitlistSignup {
  phone: string;
  firmName: string;
  contactName: string;
  city?: string;
  firmType?: string;
  teamSize?: string;
  status: string;
  createdAt: string;
}

type LegacyOutreachStage = 'In Progress' | 'Samples/Catalogues Shared';

const LEGACY_OUTREACH: Record<LegacyOutreachStage, OutreachStatus> = {

  'In Progress': 'Follow up',

  'Samples/Catalogues Shared': 'Quote Share',
};

export function normalizeOutreachStatus(stage: string | undefined): OutreachStatus {
  if (!stage) return 'Yet to Meet';
  if ((OUTREACH_STATUSES as string[]).includes(stage)) return stage as OutreachStatus;
  return LEGACY_OUTREACH[stage as LegacyOutreachStage] ?? 'Yet to Meet';
}

export const COMPANY_TYPES = [
  'Architect', 'Interior Designer', 'Contractor', 'Builder', 'Other',
] as const;
export type CompanyType = typeof COMPANY_TYPES[number];

export function companyTypeLabel(
  type: CompanyType | undefined,
  other: string | undefined,
): string {
  if (!type) return '';
  if (type !== 'Other') return type;
  const specified = String(other || '').trim();
  return specified ? `Other — ${specified}` : 'Other';
}

export const MAX_MEETINGS = 4;

export type MeetingStatus = 'Scheduled' | 'Completed' | 'Postponed';
export const MEETING_STATUSES: MeetingStatus[] = ['Scheduled', 'Completed', 'Postponed'];

export const MEETING_STATUS_COLORS: Record<MeetingStatus, string> = {
  Scheduled: '#3B82F6',
  Completed: '#22C55E',
  Postponed: '#F59E0B',
};

export interface OutreachMeeting {

  n: number;

  date?: string;

  time?: string;

  area?: string;
  officeLocation?: string;
  status: MeetingStatus;

  metWith?: string;
  notes?: string;
  pin?: GeoPin;
  loggedBy?: string;
  updatedAt?: string;
}

export function nextMeetingNumber(meetings: OutreachMeeting[] | undefined): number {
  return (meetings?.length || 0) + 1;
}

export function canScheduleMeeting(meetings: OutreachMeeting[] | undefined): boolean {
  return (meetings?.length || 0) < MAX_MEETINGS;
}

export function openMeeting(meetings: OutreachMeeting[] | undefined): OutreachMeeting | undefined {
  return (meetings || []).find((m) => m.status === 'Scheduled');
}

export function completedMeetings(meetings: OutreachMeeting[] | undefined): OutreachMeeting[] {
  return (meetings || [])
    .filter((m) => m.status === 'Completed')
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || a.n - b.n);
}

export function followUpMeetings(meetings: OutreachMeeting[] | undefined): OutreachMeeting[] {
  return completedMeetings(meetings).slice(1);
}

export const FOLLOW_UPS_REQUIRED = 2;

export function hasMet(meetings: OutreachMeeting[] | undefined): boolean {
  return completedMeetings(meetings).length > 0;
}

export function meetingsExhausted(meetings: OutreachMeeting[] | undefined): boolean {
  const m = meetings || [];
  return m.length >= MAX_MEETINGS && !hasMet(m) && !openMeeting(m);
}

export function hasMeetingOn(
  meetings: OutreachMeeting[] | undefined,
  day: string,
): boolean {
  return (meetings || []).some((m) => m.status === 'Scheduled' && String(m.date || '').slice(0, 10) === day);
}

export function nextScheduledMeeting(
  meetings: OutreachMeeting[] | undefined,
): OutreachMeeting | undefined {
  return (meetings || [])
    .filter((m) => m.status === 'Scheduled' && m.date)
    .sort((a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`))[0];
}

export function meetingLocation(m: OutreachMeeting | undefined): string {
  if (!m) return '';
  return [m.area, m.officeLocation].map((s) => String(s || '').trim()).filter(Boolean).join(' · ');
}

interface OutreachGateInput {
  status: OutreachStatus;
  followUpDate?: string;
  lostReason?: string;
}

export function outreachGateErrors(l: OutreachGateInput): string[] {
  const errs: string[] = [];
  if ((l.status === 'Follow up' || l.status === 'PI Shared') && !l.followUpDate) {
    errs.push(`A next follow-up date is required to set ${l.status}.`);
  }
  if (l.status === 'Lost' && !String(l.lostReason || '').trim()) {
    errs.push('A lost reason is required to set Lost.');
  }
  return errs;
}

export function outreachStatusPrompts(l: {
  status: OutreachStatus;
  enqId?: string;
  followUpDate?: string;
}): string[] {
  const prompts: string[] = [];
  if (l.status === 'PI Shared' && !String(l.enqId || '').trim()) {
    prompts.push('Add the Enq ID to pull the order value from the deal ticket — it stays blank without one.');
  }
  if (l.status === 'Quote Share' && !l.followUpDate) {

    prompts.push('No next follow-up set. The PRD leaves this optional on Quote Share — set one if you plan to chase it.');
  }
  if (l.status === 'Closed' && !String(l.enqId || '').trim()) {
    prompts.push('Add the Enq ID of the first order and fetch it — a conversion only counts once the order is fetched from the deal ticket.');
  }
  return prompts;
}

interface OutreachEnrichmentInput {
  contactPerson?: string;
  designation?: string;
  segment?: string;
  leadType?: string;
  companyType?: string;
  selections?: string[];
  requirement?: string;
  expectedOrderValue?: number;
}

export interface EnrichmentGap { key: keyof OutreachEnrichmentInput; label: string }

const OUTREACH_ENRICHMENT: {
  key: keyof OutreachEnrichmentInput; label: string; filled: (l: OutreachEnrichmentInput) => boolean;
}[] = [
  { key: 'contactPerson',      label: 'Contact person', filled: (l) => !!String(l.contactPerson || '').trim() },
  { key: 'designation',        label: 'Designation',    filled: (l) => !!String(l.designation || '').trim() },
  { key: 'segment',            label: 'Segment',        filled: (l) => !!l.segment },
  { key: 'leadType',           label: 'Lead type',      filled: (l) => !!l.leadType },
  { key: 'companyType',        label: 'Company type',   filled: (l) => !!l.companyType },
  { key: 'selections',         label: 'Selection',      filled: (l) => !!(l.selections || []).length },
  { key: 'requirement',        label: 'Requirement',    filled: (l) => !!String(l.requirement || '').trim() },
  { key: 'expectedOrderValue', label: 'Expected value', filled: (l) => Number(l.expectedOrderValue || 0) > 0 },
];

export function outreachEnrichmentGaps(l: OutreachEnrichmentInput): EnrichmentGap[] {
  return OUTREACH_ENRICHMENT.filter((c) => !c.filled(l)).map(({ key, label }) => ({ key, label }));
}

export const OUTREACH_ENRICHMENT_FIELD_COUNT = OUTREACH_ENRICHMENT.length;

export const OUTREACH_LOST_REASONS = [
  'Selection Not Liked',
  'Price Issue',
  'Timeline/Delivery Delay',
  'Unable to meet (4 meetings)',
] as const;
