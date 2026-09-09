// ── B2B Outreach Module — field registry, status machine, meeting loop ───────
//
// Implements `B2B_Outreach_Module_PRD.docx` v1.0 (KK, Business Head – B2B).
//
// Outreach is the field half of the B2B CRM: a BM meets an Architect, Interior
// Designer, Contractor or Builder in person, creates the lead on the spot,
// schedules up to four meetings, captures the requirement, and carries it to
// order placement — where it hands off to a KAM.
//
// Two systems hold pieces of an outreach lead, one fewer than Inbound:
//
//   b2b_lead     — CRM's own Supabase. Everything the BM types. There is no
//                  Kylas leg: nobody qualified this lead before the BM did.
//   Django deals — /crm/leads/. Authoritative for cart/PI/order VALUE. The PRD
//                  calls it "Procurement"; it is the same system the Inbound
//                  module fetches from, and we never type a rupee figure it owns.
//
// This module is the ONE place that answers "where does this field live?" for
// an outreach lead — the counterpart of `inboundModel.ts`, and it deliberately
// reuses that module's Segment / Lead type / Selection vocabularies rather than
// declaring a second copy: the two boards report into the same Leads tab and a
// second spelling of "Laminates" would split every rollup.

import {
  SEGMENTS, LEAD_TYPES, LEAD_TYPE_COLORS, SELECTIONS, istToday, followUpBucket, daysUntil,
  nextKamRoundRobin,
  type Segment, type LeadType, type Selection, type FieldOwner, type FollowUpBucket,
} from './inboundModel';

export type { Segment, LeadType, Selection, FieldOwner, FollowUpBucket };
export {
  SEGMENTS, LEAD_TYPES, LEAD_TYPE_COLORS, SELECTIONS, istToday, followUpBucket, daysUntil,
  // The rotation itself is shared, not re-implemented — see `fetchKamLoad`,
  // which counts closed leads across BOTH pipelines so the two boards cannot
  // each pick "the least loaded KAM" and land on the same person.
  nextKamRoundRobin,
};

// ── Status (PRD §3.4) ────────────────────────────────────────────────────────
//
// Six, exactly as the PRD's table lists them. Unlike Inbound there is no extra
// inbox status: `Yet to Meet` IS the default on creation, because a BM creates
// the lead in front of the client rather than receiving it from anyone.

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

// ── Legacy stage migration ───────────────────────────────────────────────────
//
// The board ran on a different six before this module: `In Progress` and
// `Samples/Catalogues Shared` sat where the PRD puts `Follow up` and
// `Quote Share`. There were **zero outreach rows in b2b_lead** when this
// shipped (verified 2026-09-08: 181 rows, none with pipeline='outbound'), so
// nothing needed migrating — but the decomposition is applied on READ anyway,
// the same way `normalizeStatus` is for Inbound. It costs one map lookup and it
// means a row typed by hand, restored from a backup, or written by an older
// deployed bundle still lands in a real column instead of vanishing off the
// board.

type LegacyOutreachStage = 'In Progress' | 'Samples/Catalogues Shared';

const LEGACY_OUTREACH: Record<LegacyOutreachStage, OutreachStatus> = {
  // A lead being worked but with no quote out is exactly PRD `Follow up`.
  'In Progress': 'Follow up',
  // Samples and catalogues went out with the quote on this board; the PRD's
  // nearest — and only — pre-PI status is Quote Share.
  'Samples/Catalogues Shared': 'Quote Share',
};

/** Any stored stage string — current or legacy — reduced to a live status. */
export function normalizeOutreachStatus(stage: string | undefined): OutreachStatus {
  if (!stage) return 'Yet to Meet';
  if ((OUTREACH_STATUSES as string[]).includes(stage)) return stage as OutreachStatus;
  return LEGACY_OUTREACH[stage as LegacyOutreachStage] ?? 'Yet to Meet';
}

// ── Company type (PRD §3.1) ──────────────────────────────────────────────────
//
// The PRD's five, with "Other (specify)" carrying its own free-text field. This
// is NOT the same list as Inbound's `CLIENT_TYPES` — outreach has `Builder` and
// no `End Consumer`, because a BM does not do a field visit to a homeowner.
// They are kept as separate vocabularies rather than merged into a superset:
// the Leads tab shows whichever one the source module captured, and folding
// them together would silently retype half the leads.

export const COMPANY_TYPES = [
  'Architect', 'Interior Designer', 'Contractor', 'Builder', 'Other',
] as const;
export type CompanyType = typeof COMPANY_TYPES[number];

/** Company type as it should read on a card — "Other" resolved to what was typed. */
export function companyTypeLabel(
  type: CompanyType | undefined,
  other: string | undefined,
): string {
  if (!type) return '';
  if (type !== 'Other') return type;
  const specified = String(other || '').trim();
  return specified ? `Other — ${specified}` : 'Other';
}

// ── Meetings (PRD §3.2) ──────────────────────────────────────────────────────
//
// "Meeting 1–4 Status: each logged as Completed or Postponed (up to 4
// meetings)", and the lifecycle diagram loops a postponed meeting back to a
// reschedule until the 4th, where it offers "mark Lost (unable to meet) or park
// for long-term follow-up".
//
// `Scheduled` is the third state and is unavoidable: a meeting that has been
// booked but not yet held is neither Completed nor Postponed, and storing it as
// either would report a meeting that never happened. Same reasoning as Inbound's
// `New` status — the PRD names the outcomes, not the waiting state.

export const MAX_MEETINGS = 4;

export type MeetingStatus = 'Scheduled' | 'Completed' | 'Postponed';
export const MEETING_STATUSES: MeetingStatus[] = ['Scheduled', 'Completed', 'Postponed'];

export const MEETING_STATUS_COLORS: Record<MeetingStatus, string> = {
  Scheduled: '#3B82F6',
  Completed: '#22C55E',
  Postponed: '#F59E0B',
};

export interface OutreachMeeting {
  /** 1-based, 1…4. */
  n: number;
  /** 'YYYY-MM-DD' — PRD "Meeting Date & Time". */
  date?: string;
  /** 'HH:MM'. */
  time?: string;
  /** PRD "Location: Area, plus office location" — two fields, one line. */
  area?: string;
  officeLocation?: string;
  status: MeetingStatus;
  /** PRD: "captured once a meeting is Completed". */
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

/** The meeting still awaiting an outcome, if any. */
export function openMeeting(meetings: OutreachMeeting[] | undefined): OutreachMeeting | undefined {
  return (meetings || []).find((m) => m.status === 'Scheduled');
}

export function lastMeeting(meetings: OutreachMeeting[] | undefined): OutreachMeeting | undefined {
  const m = meetings || [];
  return m.length ? m[m.length - 1] : undefined;
}

export function completedMeetings(meetings: OutreachMeeting[] | undefined): OutreachMeeting[] {
  return (meetings || []).filter((m) => m.status === 'Completed');
}

export function hasMet(meetings: OutreachMeeting[] | undefined): boolean {
  return completedMeetings(meetings).length > 0;
}

/**
 * The PRD's exhausted branch: four meetings logged, none of them completed.
 * The diagram's "Meeting 4: Postponed" edge — mark Lost (unable to meet), or
 * park for long-term follow-up.
 */
export function meetingsExhausted(meetings: OutreachMeeting[] | undefined): boolean {
  const m = meetings || [];
  return m.length >= MAX_MEETINGS && !hasMet(m) && !openMeeting(m);
}

/** True when this lead has a meeting booked for the given IST day (PRD §5/§6). */
export function hasMeetingOn(
  meetings: OutreachMeeting[] | undefined,
  day: string,
): boolean {
  return (meetings || []).some((m) => m.status === 'Scheduled' && String(m.date || '').slice(0, 10) === day);
}

/** The soonest scheduled meeting, for sorting a day list. */
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

// ── Hard gates (PRD §3.4) ────────────────────────────────────────────────────
//
// Only what the PRD's Behavior column states as a requirement blocks a save:
// a next follow-up date on `Follow up` and `PI Shared`, a lost reason on
// `Lost`. Everything else is chased through `enrichmentGaps` below.
//
// Two deliberate softenings, both recorded rather than silently applied:
//
//   Time. The PRD says "next follow-up date & time". Only the DATE blocks, so
//   this board and the Inbound board gate identically — the same two reps work
//   both, and a rule that fires on one and not the other reads as a bug. The
//   time field sits beside the date and is prompted for, never demanded.
//
//   Enq ID on PI Shared. The Inbound PRD names it required and it is hard-gated
//   there; this PRD does not name it, it only says the order value is
//   auto-fetched. So it is a soft gate here: without an Enq ID the fetch cannot
//   run and the value stays blank, which the rep can fix later by opening the
//   lead. Blocking on a field the document does not require would be us
//   inventing policy.

export interface OutreachGateInput {
  status: OutreachStatus;
  followUpDate?: string;
  lostReason?: string;
}

/** Blocking problems with a status change. Empty array = allowed. */
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

/**
 * Non-blocking prompts attached to a status — things the PRD describes as
 * happening at that status without naming them as requirements. Surfaced in the
 * move form and the drawer so a rep sees what is missing without being stopped.
 */
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
    // PRD open question #3: does Quote Share need its own follow-up reminder?
    // Undecided, so it is asked for and not enforced.
    prompts.push('No next follow-up set. The PRD leaves this optional on Quote Share — set one if you plan to chase it.');
  }
  if (l.status === 'Closed') {
    if (!String(l.enqId || '').trim()) prompts.push('Add the Enq ID to pull the order details from the deal ticket.');
    if (!String(l.kam || '').trim()) prompts.push('Assign a KAM — a closed lead hands off on a round-robin basis (§7).');
  }
  return prompts;
}

// ── Soft gates: enrichment (PRD §3.1 / §3.3) ─────────────────────────────────
//
// The create form asks for these, but a BM standing in an architect's office
// should never be blocked from logging the lead because a GST number is not to
// hand. Counted and chased instead — the same rule the Inbound board runs on.
// GST is explicitly "Optional — not mandatory" in the PRD and is therefore NOT
// on this list at all: counting it as a gap would nag about a field the
// document says nobody has to fill.

export interface OutreachEnrichmentInput {
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

// ── Lost reasons ─────────────────────────────────────────────────────────────
//
// The board's existing three plus the lifecycle diagram's exhausted-meeting
// branch. Kept a separate list from `INBOUND_LOST_REASONS` because that one
// carries call-log reasons ("Unreachable (4 attempts)", "Enquiry invalid") that
// cannot happen to a lead created face to face.

export const OUTREACH_LOST_REASONS = [
  'Selection Not Liked',
  'Price Issue',
  'Timeline/Delivery Delay',
  'Unable to meet (4 meetings)',
] as const;

// ── Views (PRD §5) ───────────────────────────────────────────────────────────
//
// "Meetings scheduled for Today · Follow-up Meetings · PI Shared · Closed ·
// Lost." Declared here so the tab's view switcher, its counts and its empty
// states all read from one list.

export type OutreachView = 'today' | 'followups' | 'pi' | 'closed' | 'lost' | 'board' | 'list';

export const OUTREACH_PRD_VIEWS: { key: OutreachView; label: string; note: string }[] = [
  { key: 'today',     label: 'Today',      note: "Meetings scheduled for today, soonest first." },
  { key: 'followups', label: 'Follow-ups', note: 'Leads with a next follow-up date — overdue first.' },
  { key: 'pi',        label: 'PI Shared',  note: 'PIs out, awaiting a decision. Value comes from the deal ticket.' },
  { key: 'closed',    label: 'Closed',     note: 'Orders placed and handed to a KAM.' },
  { key: 'lost',      label: 'Lost',       note: 'Every lost lead with the reason recorded.' },
];

// ── Summary (PRD §6) ─────────────────────────────────────────────────────────
//
// The PRD's five tiles, with one rule worth stating in code rather than in a
// comment on a JSX line: the two revenue figures come from DIFFERENT systems
// and must never be added together.
//
//   PI Shared revenue  → `orderValue`, fetched from the deal ticket.
//   Quote Shared value → `expectedOrderValue`, the BM's own estimate.
//
// The PRD asks for exactly that ("revenue (from Expected Order Value)"), so the
// estimate is reported — but it is returned under a name that says what it is,
// and the tile labels it as an estimate. Nothing sums the two.

export interface OutreachSummaryInput {
  status: OutreachStatus;
  meetings?: OutreachMeeting[];
  followUpDate?: string;
  orderValue?: number;
  expectedOrderValue?: number;
}

export interface OutreachSummary {
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

// ── Field registry ───────────────────────────────────────────────────────────
//
// The declaration the drawer, the create form and the export read, with the
// PRD section against each field so a reviewer can check this file against the
// document line by line. `owner` is the same provenance vocabulary Inbound
// uses — there is simply no `kylas` owner in Outreach.

export type FieldInput = 'text' | 'textarea' | 'number' | 'date' | 'time' | 'select' | 'chips' | 'readonly';

export interface OutreachFieldSpec {
  key: string;
  label: string;
  section: '3.1' | '3.2' | '3.3' | '3.4' | '7';
  owner: FieldOwner;
  input: FieldInput;
  options?: readonly string[];
  hint?: string;
  /** Only shown when the lead is in one of these statuses. */
  statuses?: OutreachStatus[];
  /** Asked for on the Create Lead form (PRD §3.1). */
  onCreate?: boolean;
}

export const OUTREACH_FIELDS: OutreachFieldSpec[] = [
  // §3.1 — Create Lead
  { key: 'company',       label: 'Company name',   section: '3.1', owner: 'crm', input: 'text', onCreate: true },
  { key: 'contactPerson', label: 'Contact person', section: '3.1', owner: 'crm', input: 'text', onCreate: true },
  { key: 'designation',   label: 'Designation',    section: '3.1', owner: 'crm', input: 'text', onCreate: true },
  { key: 'phone',         label: 'Contact number', section: '3.1', owner: 'crm', input: 'text', onCreate: true, hint: 'Not in the PRD field list, but the Leads tab shows it and the deal-ticket lookup matches on it' },
  { key: 'gstNumber',     label: 'GST',            section: '3.1', owner: 'crm', input: 'text', onCreate: true, hint: 'Optional — never blocks a save' },
  { key: 'segment',       label: 'Segment',        section: '3.1', owner: 'crm', input: 'select', options: SEGMENTS, onCreate: true },
  { key: 'leadType',      label: 'Lead type',      section: '3.1', owner: 'crm', input: 'select', options: LEAD_TYPES, onCreate: true },
  { key: 'companyType',   label: 'Company type',   section: '3.1', owner: 'crm', input: 'select', options: COMPANY_TYPES, onCreate: true },

  // §3.2 — Schedule Meeting (stored as the meetings array, edited in its own block)
  { key: 'meetings',      label: 'Meetings',       section: '3.2', owner: 'crm', input: 'readonly', hint: 'Up to 4, each Completed or Postponed' },

  // §3.3 — Requirement details
  { key: 'selections',         label: 'Selection',            section: '3.3', owner: 'crm', input: 'chips', options: SELECTIONS },
  { key: 'requirement',        label: 'Requirement summary',  section: '3.3', owner: 'crm', input: 'textarea' },
  { key: 'expectedOrderValue', label: 'Expected order value', section: '3.3', owner: 'crm', input: 'number', hint: "Your estimate at qualification — never reported as revenue" },

  // §3.4 — Status
  { key: 'status',        label: 'Status',         section: '3.4', owner: 'crm',   input: 'select', options: OUTREACH_STATUSES },
  { key: 'followUpDate',  label: 'Next follow-up', section: '3.4', owner: 'crm',   input: 'date', statuses: ['Follow up', 'PI Shared'] },
  { key: 'followUpTime',  label: 'Follow-up time', section: '3.4', owner: 'crm',   input: 'time', statuses: ['Follow up', 'PI Shared'] },
  { key: 'enqId',         label: 'Enq ID',         section: '3.4', owner: 'crm',   input: 'text', statuses: ['PI Shared', 'Closed'] },
  { key: 'orderValue',    label: 'Order value',    section: '3.4', owner: 'deals', input: 'number', statuses: ['PI Shared', 'Closed'], hint: 'Fetched from the deal ticket matching the Enq ID' },
  { key: 'expectedClosure', label: 'Expected date of closure', section: '3.4', owner: 'crm', input: 'date', hint: 'Shown as a column on the Leads tab' },
  { key: 'lostReason',    label: 'Lost reason',    section: '3.4', owner: 'crm',   input: 'select', options: OUTREACH_LOST_REASONS, statuses: ['Lost'] },

  // §7 — KAM handoff
  { key: 'kam',  label: 'KAM',  section: '7', owner: 'crm', input: 'select', statuses: ['Closed'], hint: 'Round-robin on order placement' },
  { key: 'spok', label: 'Spok', section: '7', owner: 'crm', input: 'text', hint: 'Whoever is speaking to this lead — the Leads tab shows it' },
];

export const OUTREACH_FIELDS_BY_SECTION = (section: OutreachFieldSpec['section']): OutreachFieldSpec[] =>
  OUTREACH_FIELDS.filter((f) => f.section === section);
