// ── Inbound CRM Module — field registry, status machine, provenance ──────────
//
// Implements `Inbound_CRM_Module_PRD.docx` v1.0 (KK, Business Head – B2B).
//
// This module is the ONE place that answers "where does this field live?" for an
// inbound lead. Three systems hold pieces of the same lead and none of them
// knows about the other two:
//
//   Kylas          — Presales creates and qualifies the lead. Authoritative for
//                    everything Presales captured; mostly read-only to us.
//   b2b_lead       — CRM's own Supabase. Everything the Inbound team types.
//   Django deals   — /crm/leads/. Authoritative for cart/PI/order VALUE. We
//                    never type a rupee figure that this system owns.
//
// Every field below declares which of those owns it, so the drawer can show a
// rep where a value came from and the mapper can round-trip it without a
// hand-kept copy in three files. Adding a PRD field is one entry here, not JSX
// in the drawer + a key in `inboundToRow` + a key in `rowToInbound`.

// ── Provenance ───────────────────────────────────────────────────────────────

export type FieldOwner =
  | 'kylas'        // Presales owns it. Read-only here — editing it in the CRM
                   // would be overwritten by the next sync.
  | 'kylas-write'  // Shared: we PATCH it back to Kylas on save.
  | 'crm'          // b2b_lead.meta_data. The Inbound team owns it outright.
  | 'deals'        // Derived from Django deal tickets. Never typed.
  | 'derived';     // Computed here from another field on this lead.

export const OWNER_LABEL: Record<FieldOwner, string> = {
  'kylas':       'From Presales',
  'kylas-write': 'Synced to Kylas',
  'crm':         'You own this',
  'deals':       'From deal tickets',
  'derived':     'Auto-filled',
};

// Short chip text shown beside a field in the drawer.
export const OWNER_CHIP: Record<FieldOwner, string> = {
  'kylas':       'Kylas',
  'kylas-write': 'Kylas ⇄',
  'crm':         'CRM',
  'deals':       'Deals',
  'derived':     'Auto',
};

// ── Status (PRD §3.4) ────────────────────────────────────────────────────────
//
// The PRD names four. `New` is the fifth and unavoidable: a lead auto-synced
// from Kylas has not been actioned yet, and parking it in `Follow up` would
// claim a follow-up date nobody set. It is the inbox, not a stage.

export type InboundStatus = 'New' | 'Follow up' | 'PI Shared' | 'Closed' | 'Lost';

export const INBOUND_STATUSES: InboundStatus[] = ['New', 'Follow up', 'PI Shared', 'Closed', 'Lost'];

// Board columns, in the order the PRD's lifecycle flow walks them.
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

// ── Legacy stage migration ───────────────────────────────────────────────────
//
// The board ran on nine stages before this module. Live rows carry all nine, so
// the nine are decomposed into the dimensions they were actually encoding
// rather than deleted. Counts below are the distribution on 2026-09-08 (151
// rows), kept as the evidence for each decision rather than as a live figure:
//
//   Hyderabad (40 rows)      → a LOCATION. Verified against Kylas `zipcode`:
//                              11 of 13 sampled Hyderabad rows are 50xxxx
//                              (Telangana) and every Followup Required row is
//                              56xxxx (Karnataka). It was never a stage.
//   RNR (13 rows)            → a CALL OUTCOME (PRD §3.2 Call Log). The lead is
//                              still awaiting follow-up.
//   Quote (6 rows)           → `Follow up`. No PI number was raised, so it
//                              cannot be PI Shared.
//   Enquiry Invalid (2 rows) → `Lost` with a lost reason that says so.
//   Followup Required        → `Follow up`.
//
// Applied on READ (`normalizeStatus`), not by a migration, deliberately: a
// migration that nobody runs leaves the board broken, and this repo has shipped
// two of those. `b2b-migration-inbound-status.sql` does the same thing
// permanently, whenever someone gets to it.

export type LegacyStage =
  | 'New' | 'Hyderabad' | 'RNR' | 'Followup Required' | 'Quote'
  | 'PI Shared' | 'Closed' | 'Lost' | 'Enquiry Invalid';

export const INVALID_ENQUIRY_REASON = 'Enquiry invalid';

interface LegacyDecomposition {
  status: InboundStatus;
  location?: InboundLocation;
  lostReason?: string;
  /** True when the old stage meant "last call rang out" rather than a stage. */
  rnr?: boolean;
}

const LEGACY_STAGES: Record<LegacyStage, LegacyDecomposition> = {
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

export function decomposeLegacyStage(stage: string): LegacyDecomposition {
  return LEGACY_STAGES[stage as LegacyStage] ?? { status: 'New' };
}

/** Any stored stage string — current or legacy — reduced to a live status. */
export function normalizeStatus(stage: string | undefined): InboundStatus {
  if (!stage) return 'New';
  if ((INBOUND_STATUSES as string[]).includes(stage)) return stage as InboundStatus;
  return decomposeLegacyStage(stage).status;
}

// ── Location (PRD: implicit; was the "Hyderabad" column) ─────────────────────

export type InboundLocation = 'Bangalore' | 'Hyderabad';
export const INBOUND_LOCATIONS: InboundLocation[] = ['Bangalore', 'Hyderabad'];

// Kylas `zipcode` holds a real Indian pincode (the field named `companyZipcode`
// holds the qualification tag instead — this instance's fields are repurposed).
// Telangana is 500000–509999, Karnataka 560000–591999. Anything else is left
// unset rather than guessed: a Chennai pincode is not a Bangalore lead.
export function locationFromPincode(pincode: string | undefined): InboundLocation | undefined {
  const head = Number(String(pincode || '').replace(/\D/g, '').slice(0, 3));
  if (!head) return undefined;
  if (head >= 500 && head <= 509) return 'Hyderabad';
  if (head >= 560 && head <= 591) return 'Bangalore';
  return undefined;
}

// ── Segment / Client Type / Lead Type / Priority (PRD §3.2) ──────────────────

export const SEGMENTS = ['1', '2', '3'] as const;
export type Segment = typeof SEGMENTS[number];

export const CLIENT_TYPES = [
  'Architect', 'Interior Designer', 'Contractor', 'End Consumer', 'Others',
] as const;
export type ClientType = typeof CLIENT_TYPES[number];

export const LEAD_TYPES = ['Hot', 'Warm', 'Cold'] as const;
export type LeadType = typeof LEAD_TYPES[number];

export const LEAD_TYPE_COLORS: Record<LeadType, string> = {
  Hot:  '#EF4444',
  Warm: '#F59E0B',
  Cold: '#64748B',
};

export const PRIORITIES = ['P1', 'P2', 'P3'] as const;
export type Priority = typeof PRIORITIES[number];

export const PRIORITY_COLORS: Record<Priority, string> = {
  P1: '#DC2626',
  P2: '#EA580C',
  P3: '#64748B',
};

// Kylas `cfClientType` is a *different* picklist that Presales already fills
// (Commercial owner 46, Architect/Designer 24, Home Owner 4, Builder 2 of 100
// sampled). Only the unambiguous ones are pre-filled. `Architect/Designer`
// collapses two distinct PRD values and `Commercial owner` has no PRD
// equivalent, so those stay blank with the Kylas value shown beside the field —
// a best guess here would launder Presales' wording into the Inbound team's
// reporting vocabulary and nobody would know which rows were guessed.
const KYLAS_CLIENT_TYPE_MAP: Record<string, ClientType> = {
  'home owner': 'End Consumer',
  'contractor': 'Contractor',
};

export function clientTypeFromKylas(raw: string | undefined): ClientType | undefined {
  return KYLAS_CLIENT_TYPE_MAP[String(raw || '').trim().toLowerCase()];
}

/** True when Presales gave a client type we deliberately refuse to map. */
export function kylasClientTypeIsAmbiguous(raw: string | undefined): boolean {
  const v = String(raw || '').trim();
  return !!v && !clientTypeFromKylas(v);
}

// ── Requirement selection (PRD §3.3) ─────────────────────────────────────────
//
// The PRD's seven. Kylas's `cfCategoriesOfInterest` picklist has six and
// **Plywood is not one of them** — so Selection is CRM-owned, and only the six
// Kylas recognises are mirrored back on save. `SELECTION_KYLAS_LABEL` maps our
// wording onto theirs where they differ (Laminates/Panels are plural there,
// "Flooring" is "Wooden Flooring").

export const SELECTIONS = [
  'Tiles', 'Plywood', 'Laminates', 'Panels', 'Wallpaper', 'Flooring', 'Others',
] as const;
export type Selection = typeof SELECTIONS[number];

const SELECTION_KYLAS_LABEL: Partial<Record<Selection, string>> = {
  'Tiles':     'Tiles',
  'Laminates': 'Laminates',
  'Panels':    'Panels',
  'Wallpaper': 'Wallpapers',
  'Flooring':  'Wooden Flooring',
  'Others':    'Others',
  // 'Plywood' intentionally absent — no Kylas picklist option exists.
};

/** Selections that survive a round-trip through Kylas. */
export function selectionsToKylasLabels(sel: string[] | undefined): string[] {
  return (sel || [])
    .map((s) => SELECTION_KYLAS_LABEL[s as Selection])
    .filter((s): s is string => !!s);
}

/** Kylas category labels read back as PRD selections. */
export function selectionsFromKylasLabels(labels: string[] | undefined): Selection[] {
  const inverse = new Map(
    Object.entries(SELECTION_KYLAS_LABEL).map(([ours, theirs]) => [theirs, ours as Selection]),
  );
  return (labels || []).map((l) => inverse.get(l)).filter((s): s is Selection => !!s);
}

/** Selections the rep picked that Kylas cannot store — surfaced, not hidden. */
export function selectionsKylasWillDrop(sel: string[] | undefined): string[] {
  return (sel || []).filter((s) => !SELECTION_KYLAS_LABEL[s as Selection]);
}

// ── Call log (PRD §3.2) ──────────────────────────────────────────────────────
//
// "Attempt 1–4, each logged as Connected or RNR". The lifecycle flow loops a
// lead back through the retry until it connects, and on the 4th RNR offers
// "mark Lost (unreachable) or park for long-term follow-up".

export const MAX_CALL_ATTEMPTS = 4;

export type CallAttemptOutcome = 'Connected' | 'RNR';

export interface CallAttempt {
  n: number;                  // 1-based attempt number
  outcome: CallAttemptOutcome;
  at: string;                 // ISO instant
  by?: string;                // who logged it
  note?: string;
}

export function nextAttemptNumber(attempts: CallAttempt[] | undefined): number {
  return (attempts?.length || 0) + 1;
}

export function lastAttempt(attempts: CallAttempt[] | undefined): CallAttempt | undefined {
  const a = attempts || [];
  return a.length ? a[a.length - 1] : undefined;
}

export function hasConnected(attempts: CallAttempt[] | undefined): boolean {
  return (attempts || []).some((a) => a.outcome === 'Connected');
}

/** The PRD's exhausted-retry branch: 4 attempts, none connected. */
export function retriesExhausted(attempts: CallAttempt[] | undefined): boolean {
  const a = attempts || [];
  return a.length >= MAX_CALL_ATTEMPTS && !hasConnected(a);
}

// ── Placed Under (PRD §3.5) ──────────────────────────────────────────────────

export interface PlacedUnder {
  bmName?: string;    // from the deal ticket's assignee ("from Procurement")
  spok?: string;      // whoever actually called and closed the lead
  ecName?: string;    // if the order closed at an End Consumer
  ecBmName?: string;  // that EC's BM, from the deal ticket
}

export const PLACED_UNDER_FIELDS: { key: keyof PlacedUnder; label: string; owner: FieldOwner; hint?: string }[] = [
  { key: 'bmName',   label: 'BM name',    owner: 'deals', hint: 'Assignee on the matched deal ticket' },
  { key: 'spok',     label: 'Spok',       owner: 'crm',   hint: 'Whoever actually called and closed this lead' },
  { key: 'ecName',   label: 'EC name',    owner: 'crm',   hint: 'Only if the order closed at an End Consumer' },
  { key: 'ecBmName', label: 'EC BM name', owner: 'deals', hint: 'Only if the order closed at an End Consumer' },
];

// ── Hard gates (PRD §3.4) ────────────────────────────────────────────────────
//
// Four gates the PRD states as requirements, and only these four block a save.
// Everything else in §3.2/§3.3 is chased through `enrichmentGaps` instead, so a
// rep is never stuck holding a status change because a GST number is missing.

export interface StatusGateInput {
  status: InboundStatus;
  followUpDate?: string;
  enqId?: string;
  lostReason?: string;
}

/** Blocking problems with a status change. Empty array = allowed. */
export function statusGateErrors(l: StatusGateInput): string[] {
  const errs: string[] = [];
  if (l.status === 'Follow up' && !l.followUpDate) {
    errs.push('A next follow-up date is required to set Follow up.');
  }
  if (l.status === 'PI Shared') {
    if (!String(l.enqId || '').trim()) errs.push('An Enq ID is required to set PI Shared.');
    if (!l.followUpDate) errs.push('A next follow-up date is required to set PI Shared.');
  }
  if (l.status === 'Lost' && !String(l.lostReason || '').trim()) {
    errs.push('A lost reason is required to set Lost.');
  }
  return errs;
}

// PRD §3.4: "Connected, RNR, PI Shared, and Follow up all require a next
// follow-up date, with a reminder generated against it." Logging a call is
// therefore also gated — but on the call form, not on the whole lead.
export function callGateErrors(followUpDate: string | undefined): string[] {
  return followUpDate ? [] : ['A next follow-up date is required when logging a call.'];
}

// ── Soft gates: enrichment (PRD §3.2 / §3.3) ─────────────────────────────────
//
// These warn and are counted, never blocked. Every one of them is empty on all
// 150 live rows today, which is the problem this module exists to fix — a hard
// block would just stop the board being used.

export interface EnrichmentInput {
  companyName?: string;
  gstNumber?: string;
  segment?: string;
  clientType?: string;
  leadType?: string;
  priority?: string;
  selections?: string[];
  expectedOrderValue?: number;
}

export interface EnrichmentGap { key: keyof EnrichmentInput; label: string }

const ENRICHMENT_CHECKS: { key: keyof EnrichmentInput; label: string; filled: (l: EnrichmentInput) => boolean }[] = [
  { key: 'companyName',        label: 'Company name',   filled: (l) => !!String(l.companyName || '').trim() },
  { key: 'gstNumber',          label: 'GST number',     filled: (l) => !!String(l.gstNumber || '').trim() },
  { key: 'segment',            label: 'Segment',        filled: (l) => !!l.segment },
  { key: 'clientType',         label: 'Client type',    filled: (l) => !!l.clientType },
  { key: 'leadType',           label: 'Lead type',      filled: (l) => !!l.leadType },
  { key: 'priority',           label: 'Priority',       filled: (l) => !!l.priority },
  { key: 'selections',         label: 'Selection',      filled: (l) => !!(l.selections || []).length },
  { key: 'expectedOrderValue', label: 'Expected value', filled: (l) => Number(l.expectedOrderValue || 0) > 0 },
];

export function enrichmentGaps(l: EnrichmentInput): EnrichmentGap[] {
  return ENRICHMENT_CHECKS.filter((c) => !c.filled(l)).map(({ key, label }) => ({ key, label }));
}

export const ENRICHMENT_FIELD_COUNT = ENRICHMENT_CHECKS.length;

// ── Follow-up urgency ────────────────────────────────────────────────────────
//
// There is no reminder service in this stack, so the reminder the PRD asks for
// is the Today view: a follow-up date lands a lead in Overdue / Due today /
// Upcoming, and the board card carries the same badge. Said plainly in the UI
// rather than implying a notification went out.

export type FollowUpBucket = 'overdue' | 'today' | 'upcoming' | 'none';

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

/** 'YYYY-MM-DD' for the current Indian day. The team works IST. */
export function istToday(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function followUpBucket(date: string | undefined, today = istToday()): FollowUpBucket {
  const d = String(date || '').slice(0, 10);
  if (!d) return 'none';
  if (d < today) return 'overdue';
  if (d === today) return 'today';
  return 'upcoming';
}

/** Whole days from today; negative = overdue. `undefined` when no date is set. */
export function daysUntil(date: string | undefined, today = istToday()): number | undefined {
  const d = String(date || '').slice(0, 10);
  if (!d) return undefined;
  const a = Date.parse(`${d}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return undefined;
  return Math.round((a - b) / 86_400_000);
}

// ── KAM handoff (PRD §3.5) ───────────────────────────────────────────────────
//
// "Once an order is placed, the lead/account is assigned to a KAM on a
// round-robin basis." The PRD's open question #3 asks whether capacity or
// region should weight it; until that is answered this is a plain rotation over
// the KAM roster, seeded by how many closed inbound leads each KAM already
// holds so it stays balanced across sessions rather than restarting at the top
// of the list every page load.
export function nextKamRoundRobin(
  kams: string[],
  currentLoad: Record<string, number>,
): string | undefined {
  if (!kams.length) return undefined;
  let best = kams[0];
  let bestLoad = Number.POSITIVE_INFINITY;
  for (const k of kams) {
    const load = currentLoad[k] || 0;
    if (load < bestLoad) { best = k; bestLoad = load; }
  }
  return best;
}

/**
 * True when a lead's headline is only the phone number wearing a name's clothes.
 *
 * Kylas ships these leads with the phone number in `firstName`, so the previous
 * board headed all 151 live cards with a number — and rendering it again in a
 * Company column beside a Contact column of the same number tells a rep
 * nothing. Naming the gap instead is what PRD §3.2's Client Company Name is
 * for.
 */
export function nameIsJustThePhone(
  lead: { companyName?: string; company?: string; phone?: string },
): boolean {
  if (String(lead.companyName || '').trim()) return false;
  const name = String(lead.company || '').replace(/\D/g, '');
  const phone = String(lead.phone || '').replace(/\D/g, '');
  if (!phone) return false;
  // Also catches the old mapper's `Lead <kylas id>` fallback.
  if (/^lead \d+$/i.test(String(lead.company || '').trim())) return true;
  return !!name && name.slice(-10) === phone.slice(-10);
}

// ── Field registry ───────────────────────────────────────────────────────────
//
// The declaration the drawer, the export and the filters all read. `section`
// matches the PRD so a reviewer can check this against the document field by
// field.

export type FieldInput = 'text' | 'textarea' | 'number' | 'date' | 'time' | 'select' | 'chips' | 'readonly';

export interface InboundFieldSpec {
  key: string;
  label: string;
  section: '3.1' | '3.2' | '3.3' | '3.4' | '3.5';
  owner: FieldOwner;
  input: FieldInput;
  options?: readonly string[];
  hint?: string;
  /** Only shown when the lead is in one of these statuses. */
  statuses?: InboundStatus[];
}

export const INBOUND_FIELDS: InboundFieldSpec[] = [
  // §3.1 — auto-synced from Kylas, read-only
  { key: 'phone',            label: 'Contact number',  section: '3.1', owner: 'kylas', input: 'readonly' },
  { key: 'contactName',      label: 'Contact name',    section: '3.1', owner: 'kylas', input: 'readonly' },
  { key: 'owner',            label: 'Assigned to',     section: '3.1', owner: 'kylas', input: 'readonly' },
  { key: 'leadCreatedAt',    label: 'Lead date & time', section: '3.1', owner: 'kylas', input: 'readonly' },
  { key: 'qualificationTag', label: 'Qualified as',    section: '3.1', owner: 'kylas', input: 'readonly', hint: 'Kylas tag that routed this lead here' },
  { key: 'presalesOwner',    label: 'Qualified by',    section: '3.1', owner: 'kylas', input: 'readonly', hint: 'Presales rep who handed this over' },
  { key: 'leadSummary',      label: 'Lead summary',    section: '3.1', owner: 'kylas', input: 'readonly', hint: 'Enquiry type as Presales recorded it' },
  { key: 'urgency',          label: 'Urgency',         section: '3.1', owner: 'kylas', input: 'readonly' },
  { key: 'pincode',          label: 'Pincode',         section: '3.1', owner: 'kylas', input: 'readonly' },
  { key: 'presalesClientType', label: 'Client type (Presales)', section: '3.1', owner: 'kylas', input: 'readonly' },
  { key: 'presalesMissedCalls', label: 'Missed calls (Presales)', section: '3.1', owner: 'kylas', input: 'readonly' },

  // §3.2 — the Inbound team's own fields
  { key: 'companyName', label: 'Client company name', section: '3.2', owner: 'crm', input: 'text', hint: 'Kylas ships the phone number in the name field — this is the real company' },
  { key: 'gstNumber',   label: 'GST number',          section: '3.2', owner: 'crm', input: 'text' },
  { key: 'segment',     label: 'Segment',             section: '3.2', owner: 'crm', input: 'select', options: SEGMENTS },
  { key: 'clientType',  label: 'Client type',         section: '3.2', owner: 'crm', input: 'select', options: CLIENT_TYPES },
  { key: 'leadType',    label: 'Lead type',           section: '3.2', owner: 'crm', input: 'select', options: LEAD_TYPES },
  { key: 'priority',    label: 'Priority',            section: '3.2', owner: 'crm', input: 'select', options: PRIORITIES },
  { key: 'location',    label: 'Location',            section: '3.2', owner: 'derived', input: 'select', options: INBOUND_LOCATIONS, hint: 'Defaults from the pincode; override if the lead is worked elsewhere' },

  // §3.3 — requirement
  { key: 'selections',         label: 'Selection',           section: '3.3', owner: 'crm',         input: 'chips', options: SELECTIONS },
  { key: 'requirement',        label: 'Requirement summary', section: '3.3', owner: 'kylas-write', input: 'textarea' },
  { key: 'expectedOrderValue', label: 'Expected order value', section: '3.3', owner: 'crm',        input: 'number', hint: "Your estimate at qualification — not the PI or order figure" },

  // §3.4 — status
  { key: 'status',       label: 'Status',          section: '3.4', owner: 'crm', input: 'select', options: INBOUND_STATUSES },
  { key: 'followUpDate', label: 'Next follow-up',  section: '3.4', owner: 'crm', input: 'date', statuses: ['Follow up', 'PI Shared'] },
  { key: 'followUpTime', label: 'Follow-up time',  section: '3.4', owner: 'crm', input: 'time', statuses: ['Follow up', 'PI Shared'] },
  { key: 'enqId',        label: 'Enq ID',          section: '3.4', owner: 'crm', input: 'text', statuses: ['PI Shared', 'Closed'] },
  { key: 'orderValue',   label: 'Order value',     section: '3.4', owner: 'deals', input: 'number', statuses: ['PI Shared', 'Closed'], hint: 'Fetched from the deal ticket matching the Enq ID' },
  { key: 'lostReason',   label: 'Lost reason',     section: '3.4', owner: 'crm', input: 'select', statuses: ['Lost'] },
];

export const FIELDS_BY_SECTION = (section: InboundFieldSpec['section']): InboundFieldSpec[] =>
  INBOUND_FIELDS.filter((f) => f.section === section);

// Lost reasons: the board's existing three, plus the reason the retired
// "Enquiry Invalid" column becomes and the PRD's unreachable branch.
export const INBOUND_LOST_REASONS = [
  'Selection Not Liked',
  'Price Issue',
  'Timeline/Delivery Delay',
  'Unreachable (4 attempts)',
  INVALID_ENQUIRY_REASON,
] as const;
