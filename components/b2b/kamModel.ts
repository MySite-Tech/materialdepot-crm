// ── KAM Module — assigned clients, call cadence, active orders ────────────────
//
// Implements `KAM_Module_PRD.docx` v1.0 (KK, Business Head – B2B).
//
// A Key Account Manager picks up a client once Inbound or Outreach closes its
// first order. From then on the KAM owns the relationship: a working list of
// assigned clients (§2), a log of calls and meetings with a temperature reading
// (§3), a daily calling cadence of 10 with a follow-up queue (§4), and
// repeat/upsell orders raised against an existing client (§5).
//
// The client universe is NOT a second copy of anything: §7 says the module
// "shares its client universe with the Client Database", so an assigned client
// IS a `ClientEntity` (see `clientModel.ts`) with `kam` set, and the
// interactions in §3 live on that record. This module owns exactly one stored
// thing of its own — the Active Order.
//
//   b2b_lead (pipeline='kam')  — one row per Active Order. These rows already
//                                exist: 30 of them, live, split between two
//                                KAMs (verified 2026-09-08). Everything below
//                                that looks like a migration is applied on READ
//                                so the board is correct whether or not any
//                                SQL is ever run.
//   Django deal tickets        — /crm/leads/. Authoritative for order VALUE.
//                                The PRD calls it "Procurement".

import {
  SEGMENTS, istToday, followUpBucket, daysUntil,
  type Segment, type FieldOwner, type FollowUpBucket,
} from './inboundModel';
import {
  dealIsOrder, dealIsLost, dealIsOpen,
  clientStatus, contactNumbers, primaryContact, currentTemperature, nextFollowUp,
  latestInteraction, temperatureBand,
  type ClientEntity, type ClientInteraction, type ClientOrderMetrics,
  type ClientSource, type InteractionType, type TemperatureBand,
} from './clientModel';

export type { Segment, FieldOwner, FollowUpBucket };
export { SEGMENTS, istToday, followUpBucket, daysUntil, dealIsOrder, dealIsLost, dealIsOpen };

// ── Active Order status (PRD §5.2) ───────────────────────────────────────────
//
// The PRD's table names four: Quote Shared, PI Shared, Closed, Lost.
//
// `Requirement Logged` is the fifth and is unavoidable. §5.1 has the KAM type a
// Requirement Details and an Order Value estimate at creation, and §5.2's
// earliest status asserts a quote has gone out. A requirement captured before
// any quote exists therefore has no status in the document, and one live row is
// in exactly that condition today ("A155, A191 requirement 7,2 sheets", no Enq
// ID). Storing it as `Quote Shared` would claim a quote was sent to a client
// who has not had one. Same reasoning as Inbound's `New` and Outreach's
// `Scheduled` — the PRD names the milestones, not the waiting state.

export type KamOrderStatus =
  | 'Requirement Logged' | 'Quote Shared' | 'PI Shared' | 'Closed' | 'Lost';

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

/** Statuses that are neither Closed nor Lost — §6.1's pipeline. */
export const KAM_OPEN_STATUSES: KamOrderStatus[] = ['Requirement Logged', 'Quote Shared', 'PI Shared'];

/** §6.1: "Pipeline = sum of Order Value across all orders at Quote Shared or PI Shared". */
export const KAM_PIPELINE_STATUSES: KamOrderStatus[] = ['Quote Shared', 'PI Shared'];

// ── Legacy stage migration (applied on every READ) ───────────────────────────
//
// The board ran on seven stages of its own before this module. Thirty live rows
// carry those strings, so the map below is load-bearing, not a courtesy:
//
//   No Active Enquiry (1 row)       → Requirement Logged
//   Quote Approval Pending (3 rows) → Quote Shared. This was set by automation
//                                     off a Django cart existing at all, which
//                                     is what a shared quote is on that board.
//   PI Shared (0 rows)              → PI Shared
//   Awaiting Payment (0 rows)       → PI Shared. The PI is out and the money is
//                                     not in; the PRD has no payment state, and
//                                     inventing one here would put a column on
//                                     the board that no document asks for.
//   Order Placed (16 rows)          → Closed. §5.2 defines Closed as "once the
//                                     order is placed", so these ARE closed.
//   Closed (9 rows)                 → Closed
//   Lost (1 row)                    → Lost
//
// Collapsing `Order Placed` into `Closed` is only safe because of the revenue
// rule below. `analytics.ts` used to exclude Order Placed from revenue on
// purpose — those 16 rows were auto-advanced off a cart status while their
// `value` was a figure a KAM had TYPED, so counting them would have inflated
// the reported figure off a guess. That is fixed at the source instead: a KAM
// order's revenue is now the deal ticket's value or nothing, so an
// auto-advanced row contributes real rupees or zero, never an estimate.

type LegacyKamStage =
  | 'No Active Enquiry' | 'Quote Approval Pending' | 'Awaiting Payment' | 'Order Placed';

const LEGACY_KAM_STAGE: Record<LegacyKamStage, KamOrderStatus> = {
  'No Active Enquiry':      'Requirement Logged',
  'Quote Approval Pending': 'Quote Shared',
  'Awaiting Payment':       'PI Shared',
  'Order Placed':           'Closed',
};

/** Any stored stage string — current or legacy — reduced to a live status. */
export function normalizeKamOrderStatus(stage: string | undefined): KamOrderStatus {
  if (!stage) return 'Requirement Logged';
  if ((KAM_ORDER_STATUSES as string[]).includes(stage)) return stage as KamOrderStatus;
  return LEGACY_KAM_STAGE[stage as LegacyKamStage] ?? 'Requirement Logged';
}

/** True when a stored stage needed the map above — surfaced in the UI as a count. */
export function isLegacyKamStage(stage: string | undefined): boolean {
  return !!stage && !(KAM_ORDER_STATUSES as string[]).includes(stage);
}

// ── The Active Order (PRD §5.1) ──────────────────────────────────────────────

export interface KamOrder {
  id: string;
  /** §5.1 "Company Name — dropdown, from the KAM's assigned clients". */
  clientId?: string;
  company: string;
  contactName?: string;
  phone?: string;
  /** §5.1 "Requirement Details — free text, what the client needs". */
  requirement?: string;
  /**
   * §5.1 "Order Value — numeric, KAM's estimate at creation".
   *
   * An ESTIMATE. Never summed as revenue, and never written to `value`. This is
   * the third board to carry this field and the first two both shipped the bug
   * of counting it: `OutboundLead.value` was a typed monthly figure that
   * `analytics.ts` read as realised revenue. Legacy rows' `b2b_lead.value`
   * migrates in here, because that column was typed by hand on the old board.
   */
  estimatedValue?: number;
  status: KamOrderStatus;
  /** The stored string, when it needed `normalizeKamOrderStatus`. */
  legacyStage?: string;
  /** ISO instant the status last changed — drives the "today" tiles. */
  statusChangedAt?: string;
  /** §5.1 "Enquiry ID — fetched from Procurement, once available". */
  enqId?: string;
  /** §5.1 "Order Value (Procurement) — auto-fetched, in line with the Enquiry ID". */
  orderValue?: number;
  orderValueSource?: 'deal' | 'manual';
  /** Status on the matched deal ticket, so the board can show what it matched. */
  dealStatus?: string;
  /** §5.1 "Expected Date of Closure". */
  expectedClosure?: string;
  /** §5.2 "Lost — requires a lost reason". */
  lostReason?: string;
  kam: string;
  /** Where the CLIENT came from (§6's source split), not where the order came from. */
  source: ClientSource;
  notes?: { ts: string; author: string; text: string }[];
  /**
   * Escalations stored on this row by the old board, before they moved to the
   * client. Read and written back verbatim so a save cannot delete them; no
   * surface reads them, and `accountHealth` scores the client's own log.
   */
  legacyEscalations?: import('./accountHealth').Escalation[];
  createdAt?: string;
  /**
   * Realised rupees only — `orderValue` or nothing. `analytics.ts` sums this as
   * revenue. Do NOT put `estimatedValue` in here.
   */
  value: number;
}

export const KAM_ORDER_LOST_REASONS = [
  'Selection Not Liked',
  'Price Issue',
  'Timeline/Delivery Delay',
  'Client deferred the project',
  'Lost to a competitor',
] as const;

// ── Gates (PRD §5.2) ─────────────────────────────────────────────────────────
//
// The PRD's Behavior column states two requirements and they are both hard:
// PI Shared "requires Enquiry ID", Lost "requires a lost reason".
//
// Note the difference from the Outreach board, which soft-gates the Enq ID on
// PI Shared. That is not an inconsistency — this PRD writes the word
// "Requires", the Outreach one only says the value is auto-fetched, and the
// rule here is to hard-gate exactly what a document names as required.
//
// PRD open question #4 asks whether Quote Shared needs a follow-up date, the
// way Quote Share does in Outreach. It is left ungated and prompted, which is
// what Outreach settled on — so answering the question either way later changes
// one list, not two boards' behaviour.

export interface KamOrderGateInput {
  status: KamOrderStatus;
  enqId?: string;
  lostReason?: string;
  company?: string;
}

export function kamOrderGateErrors(o: KamOrderGateInput): string[] {
  const errs: string[] = [];
  if (!String(o.company || '').trim()) errs.push('Pick the client this order is for.');
  if (o.status === 'PI Shared' && !String(o.enqId || '').trim()) {
    errs.push('An Enquiry ID is required to set PI Shared — §5.2 fetches the order value with it.');
  }
  if (o.status === 'Lost' && !String(o.lostReason || '').trim()) {
    errs.push('A lost reason is required to set Lost.');
  }
  return errs;
}

/** Non-blocking prompts for a status — asked for, never demanded. */
export function kamOrderStatusPrompts(o: {
  status: KamOrderStatus;
  enqId?: string;
  orderValue?: number;
  expectedClosure?: string;
  requirement?: string;
}): string[] {
  const prompts: string[] = [];
  if (o.status === 'Quote Shared') {
    prompts.push('§5.2 expects no Enquiry ID yet at Quote Shared. PRD open question #4 asks whether this status should also demand a next follow-up date — it does not today.');
  }
  if (o.status === 'Closed' && !String(o.enqId || '').trim()) {
    prompts.push('Add the Enquiry ID — without it the closure value cannot be read from the deal ticket and this order counts as ₹0 revenue.');
  }
  if ((o.status === 'PI Shared' || o.status === 'Closed') && String(o.enqId || '').trim() && !o.orderValue) {
    prompts.push('The Enquiry ID has not resolved to a deal ticket yet, so no order value is on file.');
  }
  if (!String(o.requirement || '').trim()) prompts.push('No requirement details captured (§5.1).');
  if (!o.expectedClosure && o.status !== 'Closed' && o.status !== 'Lost') {
    prompts.push('No expected date of closure set (§5.1).');
  }
  return prompts;
}

// ── Interactions (PRD §3.1 / §4.1) ───────────────────────────────────────────
//
// §4.1: "Every call logged (Section 3.1) requires a Next Follow-up Date before
// it can be saved, which is what populates the views below." That is an
// explicit requirement, so it is a hard gate — and it is scoped to a CALL,
// which is the word the document uses. A meeting is prompted for one instead:
// gating it too would be us extending a rule the PRD wrote about calls, and a
// site meeting that ends with "we'll call you when the drawings land" has no
// honest date to put in the box.

export interface InteractionGateInput {
  type: InteractionType;
  date?: string;
  nextFollowUpDate?: string;
}

export function interactionGateErrors(i: InteractionGateInput, today: string = istToday()): string[] {
  const errs: string[] = [];
  const day = String(i.date || '').slice(0, 10);
  if (!day) errs.push('Set the date the call or meeting took place.');
  else if (day > today) errs.push('An interaction cannot be dated in the future — set the next follow-up date instead.');
  if (i.type === 'Call' && !String(i.nextFollowUpDate || '').slice(0, 10)) {
    errs.push('A next follow-up date is required on a logged call (§4.1).');
  }
  const next = String(i.nextFollowUpDate || '').slice(0, 10);
  if (next && day && next < day) errs.push('The next follow-up date cannot be before the interaction itself.');
  return errs;
}

export function interactionPrompts(i: InteractionGateInput & { summary?: string; temperature?: number }): string[] {
  const prompts: string[] = [];
  if (i.type === 'Meeting' && !String(i.nextFollowUpDate || '').trim()) {
    prompts.push('No next follow-up date. §4.1 only requires one on a call, so this meeting will not appear in Today\'s Calls or the Follow-up Queue.');
  }
  if (!String(i.summary || '').trim()) prompts.push('No summary — §3.1 asks for one.');
  if (typeof i.temperature !== 'number') prompts.push('No account temperature scored, so the account keeps its previous reading (§3.2).');
  return prompts;
}

// ── Daily call cadence (PRD §4) ──────────────────────────────────────────────
//
// §4.1: "Each KAM has a daily target of 10 client calls."
//
// PRD open question #2 asks whether missing the target should trigger a system
// flag. It does not: the target is reported, per KAM, on the dashboard and in
// the cadence header, and nothing is blocked or escalated by it. Measured, not
// policed — and if KK wants it enforced, that is one flag on a number this
// module already computes.

export const DAILY_CALL_TARGET = 10;

/**
 * Calls logged by a KAM on a given day. Counts CALLS only — a meeting is not a
 * call, and §4.1's target is explicitly "10 client calls".
 *
 * Interactions are de-duplicated on client + day, because the field apps in
 * this stack have a documented habit of writing one event several times and
 * this is a target somebody will be measured against. Two genuinely separate
 * calls to the same client on the same day count once; that is the conservative
 * direction, and the alternative is a KAM hitting their number by pressing Save
 * twice.
 */
export function callsLoggedOn(
  clients: ClientEntity[],
  kam: string,
  day: string,
): number {
  const seen = new Set<string>();
  for (const c of clients) {
    if (c.kam !== kam) continue;
    for (const i of c.interactions || []) {
      if (i.type !== 'Call') continue;
      if (String(i.date || '').slice(0, 10) !== day) continue;
      seen.add(`${c.id}|${day}`);
    }
  }
  return seen.size;
}

export interface CallCompliance {
  kam: string;
  logged: number;
  target: number;
  overdueFollowUps: number;
  dueToday: number;
}

export function callCompliance(
  clients: ClientEntity[],
  kams: string[],
  today: string = istToday(),
): CallCompliance[] {
  return kams.map((kam) => {
    const mine = clients.filter((c) => c.kam === kam);
    return {
      kam,
      logged: callsLoggedOn(clients, kam, today),
      target: DAILY_CALL_TARGET,
      overdueFollowUps: mine.filter((c) => followUpBucket(nextFollowUp(c.interactions)?.date, today) === 'overdue').length,
      dueToday: mine.filter((c) => followUpBucket(nextFollowUp(c.interactions)?.date, today) === 'today').length,
    };
  });
}

// ── Today's Calls / Follow-up Queue (PRD §4.2 / §4.3) ────────────────────────
//
// §4.2: "Clients whose Next Follow-up Date is today's date."
// §4.3: "Clients whose Next Follow-up Date has passed and has not yet been
//        actioned, ordered FIFO — oldest follow-up date first."
//
// "Actioned" needs a definition the data can answer, and there is exactly one
// that does not need a new field: a follow-up is actioned when a LATER
// interaction is logged, because logging one replaces the account's live
// follow-up date (see `nextFollowUp` — the latest entry's date, deliberately
// not the earliest across the log). So an overdue queue entry disappears the
// moment the KAM logs the call, and nothing has to be ticked off by hand.
//
// PRD open question #3 asks whether the queue has a floor. It does not — an old
// unactioned follow-up sits there indefinitely, because dropping it is how an
// account goes quiet without anyone deciding to let it. `agedDays` is reported
// beside each row so a queue full of six-month-old entries is visible as a
// problem rather than silently trimmed.

export interface CadenceRow {
  client: ClientEntity;
  date: string;
  /** Whole days overdue; 0 for today's list. */
  agedDays: number;
  from: ClientInteraction;
}

export function todaysCalls(clients: ClientEntity[], today: string = istToday()): CadenceRow[] {
  const out: CadenceRow[] = [];
  for (const client of clients) {
    const next = nextFollowUp(client.interactions);
    if (next && next.date === today) out.push({ client, date: next.date, agedDays: 0, from: next.from });
  }
  return out.sort((a, b) => a.client.company.localeCompare(b.client.company));
}

export function followUpQueue(clients: ClientEntity[], today: string = istToday()): CadenceRow[] {
  const out: CadenceRow[] = [];
  for (const client of clients) {
    const next = nextFollowUp(client.interactions);
    if (!next || next.date >= today) continue;
    out.push({ client, date: next.date, agedDays: Math.abs(daysUntil(next.date, today) ?? 0), from: next.from });
  }
  // FIFO — oldest follow-up date first, so overdue calls surface ahead of ones
  // that just became due.
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.client.company.localeCompare(b.client.company));
}

/** Age band for a queue row, so a stale queue is legible at a glance. */
export const QUEUE_AGE_BANDS = [
  { key: 'fresh',  label: '≤ 7 days',   max: 7,        color: '#F59E0B' },
  { key: 'stale',  label: '8–30 days',  max: 30,       color: '#EA580C' },
  { key: 'rotten', label: '> 30 days',  max: Infinity, color: '#DC2626' },
] as const;

export function queueAgeBand(agedDays: number): typeof QUEUE_AGE_BANDS[number] {
  return QUEUE_AGE_BANDS.find((b) => agedDays <= b.max) || QUEUE_AGE_BANDS[QUEUE_AGE_BANDS.length - 1];
}

// ── Assigned client rows (PRD §2) ────────────────────────────────────────────
//
// One row per assigned client, with every order metric derived from the deal
// tickets — see `ClientOrderMetrics` in `clientModel.ts` for why nothing here
// is stored. This function is the join, not a fetch: the caller supplies the
// metrics map so the same rows can be built from a cache, a partial load, or a
// Django failure without this file knowing which.

export interface AssignedClientRow {
  client: ClientEntity;
  company: string;
  source: ClientSource;
  contactPerson: string;
  contactNumber: string;
  metrics: ClientOrderMetrics;
  status: ReturnType<typeof clientStatus>;
  segment?: Segment;
  temperature?: number;
  temperatureAt?: string;
  temperatureBand?: TemperatureBand;
  /** The reading before the current one — a drop is what §3.2 exists to show. */
  previousTemperature?: number;
  upcomingProject?: string;
  nextFollowUpDate?: string;
  followUp: FollowUpBucket;
  lastInteraction?: ClientInteraction;
  daysSinceContact?: number;
}

export function assignedClientRows(
  clients: ClientEntity[],
  metricsFor: (c: ClientEntity) => ClientOrderMetrics,
  today: string = istToday(),
): AssignedClientRow[] {
  return clients.map((client) => {
    const metrics = metricsFor(client);
    const temp = currentTemperature(client.interactions);
    const scored = (client.interactions || []).filter((i) => typeof i.temperature === 'number');
    const prev = scored.length > 1
      ? [...scored].sort((a, b) => String(b.date).localeCompare(String(a.date)))[1].temperature
      : undefined;
    const last = latestInteraction(client.interactions);
    const next = nextFollowUp(client.interactions);
    const primary = primaryContact(client.contacts);
    const upcoming = [...(client.interactions || [])]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .find((i) => String(i.upcomingProject || '').trim());
    return {
      client,
      company: client.company,
      source: client.source,
      contactPerson: String(primary?.name || '').trim(),
      contactNumber: primary?.number || '',
      metrics,
      status: clientStatus(metrics, today),
      segment: client.segment,
      temperature: temp?.value,
      temperatureAt: temp?.at,
      temperatureBand: temperatureBand(temp?.value),
      previousTemperature: prev,
      upcomingProject: upcoming?.upcomingProject,
      nextFollowUpDate: next?.date,
      followUp: followUpBucket(next?.date, today),
      lastInteraction: last,
      daysSinceContact: last?.date ? Math.abs(daysUntil(last.date, today) ?? 0) : undefined,
    };
  });
}

// ── Temperature vs. the record (PRD open question #5) ────────────────────────
//
// "Is Account Temperature purely a KAM judgment call, or should objective
// signals feed into it or flag a mismatch?"
//
// It stays a judgment call — a KAM who has just been told the client is
// switching suppliers should be able to score a 2 on an account that ordered
// last week. But the two objective signals the module already holds are shown
// beside it, and a contradiction is named. Reported, never overridden.

export interface TemperatureMismatch {
  kind: 'hot-but-cold' | 'hot-but-silent' | 'cold-but-buying';
  message: string;
}

export const TEMPERATURE_SILENCE_DAYS = 45;

/**
 * Takes no reference date: every comparison it makes is already resolved on the
 * row (`status` was computed against today, `daysSinceContact` is a count). A
 * `today` parameter here would be one nothing read.
 */
export function temperatureMismatch(
  row: AssignedClientRow,
): TemperatureMismatch | undefined {
  const t = row.temperature;
  if (typeof t !== 'number') return undefined;

  if (t >= 7 && row.status === 'Inactive') {
    return {
      kind: 'hot-but-cold',
      message: `Scored ${t}/10 but the account has not ordered in over 3 months.`,
    };
  }
  if (t >= 7 && (row.daysSinceContact ?? 0) > TEMPERATURE_SILENCE_DAYS) {
    return {
      kind: 'hot-but-silent',
      message: `Scored ${t}/10, but the last interaction was ${row.daysSinceContact} days ago.`,
    };
  }
  if (t <= 3 && row.status === 'Active') {
    return {
      kind: 'cold-but-buying',
      message: `Scored ${t}/10 but the account is still ordering — worth a note on why.`,
    };
  }
  return undefined;
}

/**
 * §6.2's "At-Risk Accounts": Active clients approaching the Inactive cutoff
 * with no order and no follow-up scheduled. The window is deliberately generous
 * — an account 30 days from falling out of Active with nobody due to call it is
 * the thing this list exists to catch.
 */
export const AT_RISK_WINDOW_DAYS = 30;

export function isAtRisk(row: AssignedClientRow, daysLeft: number | undefined): boolean {
  if (row.status !== 'Active') return false;
  if (daysLeft === undefined || daysLeft > AT_RISK_WINDOW_DAYS) return false;
  return row.followUp === 'none' || row.followUp === 'overdue';
}

// ── §6 Dashboard ─────────────────────────────────────────────────────────────
//
// §6.1 fixes the definition the three pipeline widgets share: "Pipeline = sum of
// Order Value across all orders currently at Quote Shared or PI Shared (i.e.
// not yet Closed or Lost), split by source (Inbound-originated,
// Outreach-originated, KAM-created)."
//
// That also answers PRD open question #6 — whether KAM Pipeline includes orders
// still open from the original handoff. It does not: those orders belong to
// whichever board raised them and count in that source's pipeline, which is
// what "split by source" means. Adding them here would count one order twice.
//
// One rupee rule runs through all of it: an order at Quote Shared has no deal
// ticket yet, so its only figure is the KAM's estimate. That figure is reported
// under a name that says what it is (`estimatedPipeline`) and is never added to
// `pipeline`. The two are rendered side by side, labelled, and never summed.

export interface KamPipelineSplit {
  /** Deal-ticket rupees on orders at Quote Shared / PI Shared. */
  pipeline: number;
  /** The KAMs' own estimates on those same orders. NOT revenue, NOT additive. */
  estimatedPipeline: number;
  count: number;
}

export const EMPTY_SPLIT: KamPipelineSplit = { pipeline: 0, estimatedPipeline: 0, count: 0 };

const sum = (ns: (number | undefined)[]) => ns.reduce((a: number, b) => a + (Number(b) || 0), 0);

export function kamPipeline(orders: KamOrder[]): KamPipelineSplit {
  const live = orders.filter((o) => KAM_PIPELINE_STATUSES.includes(o.status));
  return {
    pipeline: sum(live.map((o) => o.orderValue)),
    estimatedPipeline: sum(live.map((o) => o.estimatedValue)),
    count: live.length,
  };
}

/** §6 "Today's Pipeline" — orders that entered the pipeline today. */
export function kamPipelineToday(orders: KamOrder[], today: string = istToday()): KamPipelineSplit {
  const day = (iso: string | undefined) => String(iso || '').slice(0, 10);
  const live = orders.filter((o) =>
    KAM_PIPELINE_STATUSES.includes(o.status)
    && (day(o.statusChangedAt) === today || day(o.createdAt) === today));
  return {
    pipeline: sum(live.map((o) => o.orderValue)),
    estimatedPipeline: sum(live.map((o) => o.estimatedValue)),
    count: live.length,
  };
}

/**
 * §6.2's KAM Funnel — the same Quote Shared → PI Shared → Closed/Lost shape
 * shown for Inbound and Outreach, over a date range.
 *
 * Counted on the CURRENT status, not on history: nothing in this stack records
 * when an order passed through a status it has since left, so a true funnel
 * cannot be built and one that looked like it could would be wrong. Each step
 * is therefore "orders standing here or beyond", which is a real statement
 * about a real column. `statusChangedAt` scopes it; orders that pre-date that
 * field are reported as untimed rather than counted into the range.
 */
export interface KamFunnel {
  steps: { label: string; count: number; value: number }[];
  untimed: number;
  winRate?: number;
  averageCycleDays?: number;
}

const STATUS_RANK: Record<KamOrderStatus, number> = {
  'Requirement Logged': 0, 'Quote Shared': 1, 'PI Shared': 2, 'Closed': 3, 'Lost': 3,
};

export function kamFunnel(
  orders: KamOrder[],
  range?: { from?: string; to?: string },
): KamFunnel {
  const day = (iso: string | undefined) => String(iso || '').slice(0, 10);
  let untimed = 0;
  const inRange = orders.filter((o) => {
    const d = day(o.statusChangedAt) || day(o.createdAt);
    if (!d) { untimed++; return !range?.from && !range?.to; }
    if (range?.from && d < range.from) return false;
    if (range?.to && d > range.to) return false;
    return true;
  });

  const atOrBeyond = (rank: number) => inRange.filter((o) => STATUS_RANK[o.status] >= rank && o.status !== 'Lost');
  const closed = inRange.filter((o) => o.status === 'Closed');
  const lost = inRange.filter((o) => o.status === 'Lost');

  const steps = [
    { label: 'Quote Shared', rows: atOrBeyond(1) },
    { label: 'PI Shared',    rows: atOrBeyond(2) },
    { label: 'Closed',       rows: closed },
    { label: 'Lost',         rows: lost },
  ].map(({ label, rows }) => ({
    label,
    count: rows.length,
    value: sum(rows.map((o) => o.orderValue)),
  }));

  const decided = closed.length + lost.length;

  // Average sales cycle — creation to closure, over the orders that carry both
  // dates. An order with no createdAt contributes nothing rather than a zero.
  const cycles = closed
    .map((o) => {
      const from = day(o.createdAt);
      const to = day(o.statusChangedAt);
      if (!from || !to) return undefined;
      const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
      return Number.isNaN(ms) ? undefined : Math.max(0, Math.round(ms / 86_400_000));
    })
    .filter((n): n is number => n !== undefined);

  return {
    steps,
    untimed,
    winRate: decided ? closed.length / decided : undefined,
    averageCycleDays: cycles.length ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length) : undefined,
  };
}

/** §6 "new clients added, month-wise" — the Inbound + Outreach + KAM cohort. */
export interface CohortMonth {
  /** 'YYYY-MM'. */
  month: string;
  inbound: number;
  outreach: number;
  existing: number;
  total: number;
}

/**
 * `undated` is clients with no creation date — they belong to no month and are
 * reported rather than dropped into the earliest bucket or silently lost. It is
 * a real case: a client seeded from a lead board inherits that lead's date, and
 * a row written before this field existed has none.
 */
export function clientCohort(
  clients: ClientEntity[],
  range?: { from?: string; to?: string },
): CohortMonth[] & { undated?: number } {
  const byMonth = new Map<string, CohortMonth>();
  let undated = 0;
  for (const c of clients) {
    const day = String(c.createdAt || '').slice(0, 10);
    if (!day) { undated++; continue; }
    if (range?.from && day < range.from) continue;
    if (range?.to && day > range.to) continue;
    const month = day.slice(0, 7);
    const row = byMonth.get(month) || { month, inbound: 0, outreach: 0, existing: 0, total: 0 };
    if (c.source === 'Inbound') row.inbound++;
    else if (c.source === 'Outreach') row.outreach++;
    else row.existing++;
    row.total++;
    byMonth.set(month, row);
  }
  const out = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)) as CohortMonth[] & { undated?: number };
  out.undated = undated;
  return out;
}

/** §6 "KAM accounts split SPOC-wise". SPOC here is the assigned KAM. */
export interface KamAccountSplit {
  kam: string;
  clients: number;
  active: number;
  inactive: number;
  unknown: number;
  revenue: number;
  pipeline: number;
  estimatedPipeline: number;
  openOrders: number;
}

export function kamAccountSplit(
  rows: AssignedClientRow[],
  orders: KamOrder[],
  kams: string[],
): KamAccountSplit[] {
  return kams.map((kam) => {
    const mine = rows.filter((r) => r.client.kam === kam);
    const myOrders = orders.filter((o) => o.kam === kam);
    const p = kamPipeline(myOrders);
    return {
      kam,
      clients: mine.length,
      active: mine.filter((r) => r.status === 'Active').length,
      inactive: mine.filter((r) => r.status === 'Inactive').length,
      unknown: mine.filter((r) => r.status === 'Unknown').length,
      revenue: sum(myOrders.filter((o) => o.status === 'Closed').map((o) => o.orderValue)),
      pipeline: p.pipeline,
      estimatedPipeline: p.estimatedPipeline,
      openOrders: myOrders.filter((o) => KAM_OPEN_STATUSES.includes(o.status)).length,
    };
  }).sort((a, b) => b.revenue - a.revenue || b.clients - a.clients);
}

/** §6.2 "Lost Reason Breakdown". */
export function lostReasonBreakdown(
  orders: KamOrder[],
): { reason: string; count: number; estimatedValue: number }[] {
  const byReason = new Map<string, { count: number; estimatedValue: number }>();
  for (const o of orders.filter((x) => x.status === 'Lost')) {
    const reason = String(o.lostReason || '').trim() || 'No reason recorded';
    const row = byReason.get(reason) || { count: 0, estimatedValue: 0 };
    row.count++;
    // A lost order has no deal-ticket value to report, so this is the estimate —
    // named as such, and never added to a revenue figure.
    row.estimatedValue += Number(o.estimatedValue) || 0;
    byReason.set(reason, row);
  }
  return [...byReason.entries()]
    .map(([reason, v]) => ({ reason, ...v }))
    .sort((a, b) => b.count - a.count);
}

/**
 * §6.2 "New vs. Repeat Revenue" — a client's first order versus the KAM-created
 * orders that followed.
 *
 * Derived from the deal tickets' own dates, not from which board raised the
 * order: "first order" is a fact about the client, and a KAM order that happens
 * to be a client's first (a KAM raising the very first ticket on a walked-in
 * account) is new revenue however it was keyed in.
 */
export interface NewVsRepeat {
  newRevenue: number;
  repeatRevenue: number;
  newOrders: number;
  repeatOrders: number;
  /** Clients whose order dates could not be read, so neither bucket claims them. */
  unknownClients: number;
}

export function newVsRepeat(
  rows: AssignedClientRow[],
  firstOrderValueFor: (c: ClientEntity) => number | undefined,
): NewVsRepeat {
  let newRevenue = 0, repeatRevenue = 0, newOrders = 0, repeatOrders = 0, unknownClients = 0;
  for (const r of rows) {
    const orders = r.metrics.orders;
    const total = r.metrics.totalRevenue;
    if (orders === undefined || total === undefined) { unknownClients++; continue; }
    if (orders === 0) continue;
    const first = firstOrderValueFor(r.client);
    if (first === undefined) { unknownClients++; continue; }
    newRevenue += first;
    newOrders += 1;
    repeatRevenue += Math.max(0, total - first);
    repeatOrders += Math.max(0, orders - 1);
  }
  return { newRevenue, repeatRevenue, newOrders, repeatOrders, unknownClients };
}

/** §6.2 "Segment-wise Revenue Split", alongside the source-wise one in §6. */
export function segmentRevenue(rows: AssignedClientRow[]): { segment: string; revenue: number; clients: number }[] {
  const out = new Map<string, { revenue: number; clients: number }>();
  for (const r of rows) {
    const key = r.segment ? `Segment ${r.segment}` : 'No segment set';
    const row = out.get(key) || { revenue: 0, clients: 0 };
    row.revenue += Number(r.metrics.totalRevenue) || 0;
    row.clients += 1;
    out.set(key, row);
  }
  return [...out.entries()].map(([segment, v]) => ({ segment, ...v })).sort((a, b) => b.revenue - a.revenue);
}

// ── Views ────────────────────────────────────────────────────────────────────

export type KamView = 'clients' | 'today' | 'queue' | 'orders' | 'dashboard';

export const KAM_VIEWS: { key: KamView; label: string; section: string; note: string }[] = [
  { key: 'clients',   label: 'Assigned Clients', section: '§2', note: 'Every client assigned to you, with lifetime order metrics from the deal tickets.' },
  { key: 'today',     label: "Today's Calls",    section: '§4.2', note: 'Clients whose next follow-up date is today.' },
  { key: 'queue',     label: 'Follow-up Queue',  section: '§4.3', note: 'Overdue follow-ups, oldest first. A row clears when you log the call.' },
  { key: 'orders',    label: 'Active Orders',    section: '§5', note: 'Repeat and upsell orders you have raised against an existing client.' },
  { key: 'dashboard', label: 'KAM Dashboard',    section: '§6', note: 'Pipeline, funnel, cohort and call compliance for the KAM book.' },
];

// ── Field registry ───────────────────────────────────────────────────────────

export type KamFieldInput = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'readonly';

export interface KamFieldSpec {
  key: string;
  label: string;
  section: '2' | '3.1' | '5.1';
  owner: FieldOwner;
  input: KamFieldInput;
  options?: readonly string[];
  hint?: string;
  onCreate?: boolean;
}

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

export function contactNumbersForOrder(client: ClientEntity | undefined): string[] {
  return contactNumbers(client?.contacts);
}
