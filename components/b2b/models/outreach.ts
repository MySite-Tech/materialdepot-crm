import {
  SEGMENTS, LEAD_TYPES, LEAD_TYPE_COLORS, SELECTIONS, istToday, followUpBucket, daysUntil,
  nextKamRoundRobin,
  type Segment, type LeadType, type Selection, type FieldOwner, type FollowUpBucket,
} from './inbound';

export type { Segment, LeadType, Selection, FieldOwner, FollowUpBucket };
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
  'Closed':      'Order placed — handed to a KAM',
  'Lost':        'Needs a lost reason',
};

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

  notes?: string;
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

function completedMeetings(meetings: OutreachMeeting[] | undefined): OutreachMeeting[] {
  return (meetings || []).filter((m) => m.status === 'Completed');
}

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
  kam?: string;
}): string[] {
  const prompts: string[] = [];
  if (l.status === 'PI Shared' && !String(l.enqId || '').trim()) {
    prompts.push('Add the Enq ID to pull the order value from the deal ticket — it stays blank without one.');
  }
  if (l.status === 'Quote Share' && !l.followUpDate) {

    prompts.push('No next follow-up set. The PRD leaves this optional on Quote Share — set one if you plan to chase it.');
  }
  if (l.status === 'Closed') {
    if (!String(l.enqId || '').trim()) prompts.push('Add the Enq ID to pull the order details from the deal ticket.');
    if (!String(l.kam || '').trim()) prompts.push('Assign a KAM — a closed lead hands off on a round-robin basis (§7).');
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

export type OutreachView = 'today' | 'followups' | 'pi' | 'closed' | 'lost' | 'board' | 'list';

export const OUTREACH_PRD_VIEWS: { key: OutreachView; label: string; note: string }[] = [
  { key: 'today',     label: 'Today',      note: "Meetings scheduled for today, soonest first." },
  { key: 'followups', label: 'Follow-ups', note: 'Leads with a next follow-up date — overdue first.' },
  { key: 'pi',        label: 'PI Shared',  note: 'PIs out, awaiting a decision. Value comes from the deal ticket.' },
  { key: 'closed',    label: 'Closed',     note: 'Orders placed and handed to a KAM.' },
  { key: 'lost',      label: 'Lost',       note: 'Every lost lead with the reason recorded.' },
];

interface OutreachSummaryInput {
  status: OutreachStatus;
  meetings?: OutreachMeeting[];
  followUpDate?: string;
  orderValue?: number;
  expectedOrderValue?: number;
}

interface OutreachSummary {
  meetingsToday: number;
  followUp: { count: number; overdue: number; dueToday: number };
  quoteShared: { count: number; estimatedValue: number };
  piShared: { count: number; orderValue: number };
  closed: { count: number; orderValue: number };
  lost: number;
}

export function outreachSummary(
  leads: OutreachSummaryInput[],
  today: string = istToday(),
): OutreachSummary {
  const sum = (ns: (number | undefined)[]) => ns.reduce((a: number, b) => a + (Number(b) || 0), 0);
  const onFollowUp = leads.filter((l) => l.status === 'Follow up');
  const quote = leads.filter((l) => l.status === 'Quote Share');
  const pi = leads.filter((l) => l.status === 'PI Shared');
  const closed = leads.filter((l) => l.status === 'Closed');
  const day = (d: string | undefined) => String(d || '').slice(0, 10);
  return {
    meetingsToday: leads.filter((l) => hasMeetingOn(l.meetings, today)).length,
    followUp: {
      count: onFollowUp.length,
      overdue: onFollowUp.filter((l) => !!day(l.followUpDate) && day(l.followUpDate) < today).length,
      dueToday: onFollowUp.filter((l) => day(l.followUpDate) === today).length,
    },
    quoteShared: { count: quote.length, estimatedValue: sum(quote.map((l) => l.expectedOrderValue)) },
    piShared: { count: pi.length, orderValue: sum(pi.map((l) => l.orderValue)) },
    closed: { count: closed.length, orderValue: sum(closed.map((l) => l.orderValue)) },
    lost: leads.filter((l) => l.status === 'Lost').length,
  };
}
