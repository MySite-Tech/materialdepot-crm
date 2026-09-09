// ── Client Database Module — the unified client master ────────────────────────
//
// Implements `Client_Database_Module_PRD.docx` v1.0 (KK, Business Head – B2B).
//
// Where the Leads tab shows leads and Inbound/Outreach show how a lead was
// sourced, this module shows the client as a BUSINESS: one row per real-world
// entity, however many contact numbers or GST numbers that entity has ordered
// under. It captures nothing about an order itself — every rupee and every
// Enquiry ID is read from the deal tickets and attributed to a client by an
// EXACT phone match.
//
// Two systems hold a client:
//
//   b2b_lead (pipeline='client')  — CRM's own Supabase. The entity: canonical
//                                   name, its contact numbers, its GSTs, its
//                                   segment/type, and (for the KAM module) the
//                                   interaction log. `pipeline='client'` is a
//                                   new value; verified 2026-09-08 that the
//                                   column has no CHECK constraint by inserting
//                                   and deleting a probe row.
//   Django deal tickets           — /crm/leads/. Authoritative for every order
//                                   metric in §2 and every row in §3.2. The PRD
//                                   calls it "Procurement".
//
// This module is the ONE place that answers "where does this field live?" for a
// client entity — the counterpart of `inboundModel.ts` / `outreachModel.ts` —
// and it reuses their Segment vocabulary rather than declaring a second copy.

import { SEGMENTS, istToday, type Segment, type FieldOwner } from './inboundModel';
import type { Escalation } from './accountHealth';

export type { Segment, FieldOwner };
export { SEGMENTS, istToday };

// ── Client type (PRD §6.1 / §7) ──────────────────────────────────────────────
//
// The upload template's accepted list, verbatim: "Architect / Interior Designer
// / Contractor / Builder / End Consumer / Other".
//
// This is a THIRD client-type vocabulary in the B2B CRM and it is deliberately
// its own list rather than an alias of either existing one. Inbound's
// `CLIENT_TYPES` has no Builder; Outreach's `COMPANY_TYPES` has no End Consumer.
// This one is the union — which makes it the right target to map INTO, and the
// wrong thing to map back out of. `clientTypeFromLead` below is therefore
// one-directional: a lead's type can seed a client, never the reverse.
export const CLIENT_ENTITY_TYPES = [
  'Architect', 'Interior Designer', 'Contractor', 'Builder', 'End Consumer', 'Other',
] as const;
export type ClientEntityType = typeof CLIENT_ENTITY_TYPES[number];

/**
 * A source module's client/company type, mapped onto this module's list.
 *
 * Only exact, unambiguous names map. Inbound's `Others` and Outreach's `Other`
 * both land on `Other`; anything the source left blank or spelled its own way
 * returns undefined and the field stays empty, with the source's own wording
 * shown beside it. Guessing here would launder one team's vocabulary into
 * another team's reporting and nobody would know which rows were guessed —
 * the same rule `clientTypeFromKylas` follows.
 */
export function clientTypeFromLead(raw: string | undefined): ClientEntityType | undefined {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return undefined;
  if (v === 'others' || v === 'other') return 'Other';
  return CLIENT_ENTITY_TYPES.find((t) => t.toLowerCase() === v);
}

/** Where a client entity first entered the CRM (KAM PRD §2 "Source"). */
export const CLIENT_SOURCES = ['Inbound', 'Outreach', 'Existing'] as const;
export type ClientSource = typeof CLIENT_SOURCES[number];

// ── Contact numbers (PRD §3.1) ───────────────────────────────────────────────
//
// "One or more, each with a name/label (e.g. 'Rahul – Owner', 'Accounts Desk')".
// The PRD's example collapses a person and a role into one string; they are
// stored as two fields because §3.2 needs the NAME on its own ("Contact Name —
// name tied to that contact number") and §2 needs one contact PERSON for the
// list row. `contactLabel()` puts them back together for display.
//
// Exactly one contact is `primary`. §2's Contact Number is "the one orders are
// mainly placed on", which is a judgement the team makes, not something to
// derive from order counts — deriving it would make the list row's phone jump
// around as tickets land.

export interface ClientContact {
  /** 10 digits, no country code. The only key that links orders to a client. */
  number: string;
  name?: string;
  /** e.g. Owner, Accounts, Site Manager. */
  label?: string;
  primary?: boolean;
}

export function contactLabel(c: ClientContact | undefined): string {
  if (!c) return '';
  const parts = [String(c.name || '').trim(), String(c.label || '').trim()].filter(Boolean);
  return parts.join(' – ');
}

/** Last 10 digits, so '+91 99000 99013' and '9900099013' are one contact. */
export function normalizeContactNumber(v: string | undefined): string {
  return String(v || '').replace(/\D/g, '').slice(-10);
}

export function isValidContactNumber(v: string | undefined): boolean {
  const n = normalizeContactNumber(v);
  return n.length === 10 && /^[6-9]/.test(n);
}

/**
 * The primary contact, or the first one. Never undefined for a client with any
 * contact at all, so §2's Contact Person column has something to render.
 */
export function primaryContact(contacts: ClientContact[] | undefined): ClientContact | undefined {
  const list = contacts || [];
  return list.find((c) => c.primary) || list[0];
}

/** Every distinct, valid number on a client — the keys order linking runs on. */
export function contactNumbers(contacts: ClientContact[] | undefined): string[] {
  const seen = new Set<string>();
  for (const c of contacts || []) {
    const n = normalizeContactNumber(c.number);
    if (n.length === 10) seen.add(n);
  }
  return [...seen];
}

// ── GST numbers (PRD §3.1 / §7) ──────────────────────────────────────────────
//
// "One or more. Each GST fetched and validated via GST Validator, showing the
// registered company name against it."
//
// **There is no GST Validator in this stack** — no API, no credential, nothing
// in `mockApi.ts`. So this module does the half that can be done offline and is
// explicit about the half that cannot:
//
//   Structure + check digit — done here, fully. A GSTIN's 15th character is a
//     mod-36 check digit over the first 14, so a typo is detectable without any
//     service. Verified against the published example 27AAPFU0939F1ZV.
//   Registered company name — NOT AVAILABLE. `registeredName` exists on the
//     record and is rendered when present, but nothing fills it, and the UI
//     says so rather than showing an empty cell that reads as "no name on file".
//
// PRD open question #2 asks whether validation runs in real time or as a batch
// pass. Structural validation runs on entry AND on import, immediately, because
// it is free. The registered-name lookup is neither, because it does not exist.

export type GstCheck = 'valid' | 'bad-format' | 'bad-checksum' | 'unknown-state' | 'empty';

export interface ClientGst {
  /** 15 characters, upper-case, no spaces. */
  number: string;
  /** From the GST Validator. Nothing populates this yet — see above. */
  registeredName?: string;
  /** ISO instant the registered name was last confirmed. */
  validatedAt?: string;
}

const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;
const GST_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// GST state codes 01–38 are the states/UTs; 97 is "Other Territory" and 99 is
// the Centre's own. Anything else is not a state code at all.
export const GST_STATE_NAMES: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan',
  '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
  '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura',
  '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand',
  '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '25': 'Daman & Diu', '26': 'Dadra & Nagar Haveli', '27': 'Maharashtra', '28': 'Andhra Pradesh (old)',
  '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala',
  '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar', '36': 'Telangana',
  '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory', '99': 'Centre Jurisdiction',
};

export function normalizeGst(v: string | undefined): string {
  return String(v || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** The mod-36 check digit the 15th character of a GSTIN must equal. */
export function gstCheckDigit(first14: string): string | null {
  if (first14.length !== 14) return null;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = GST_ALPHABET.indexOf(first14[i]);
    if (v < 0) return null;
    // Factors alternate 1, 2 from the leftmost character.
    const product = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GST_ALPHABET[(36 - (sum % 36)) % 36];
}

export interface GstValidation {
  check: GstCheck;
  normalized: string;
  stateCode?: string;
  stateName?: string;
  /** The PAN embedded in characters 3–12, useful for spotting two GSTs of one firm. */
  pan?: string;
  message?: string;
  /**
   * True when the number should be accepted and stored. A failed CHECK DIGIT is
   * accepted-with-a-warning rather than refused: the check-digit rule is not
   * something this repo can regression-test against a corpus of real GSTINs, and
   * refusing a client's genuine GST because our arithmetic disagrees would block
   * the upload the module exists to serve. A failed SHAPE is refused — a
   * 13-character string is not a GSTIN under any reading.
   */
  storable: boolean;
}

export function validateGst(raw: string | undefined): GstValidation {
  const normalized = normalizeGst(raw);
  if (!normalized) return { check: 'empty', normalized, storable: true };

  if (!GSTIN_SHAPE.test(normalized)) {
    return {
      check: 'bad-format',
      normalized,
      storable: false,
      message: normalized.length === 15
        ? 'Right length, wrong shape — a GSTIN is 2 digits, 5 letters, 4 digits, a letter, one character, "Z", then a check character.'
        : `A GSTIN is 15 characters; this is ${normalized.length}.`,
    };
  }

  const stateCode = normalized.slice(0, 2);
  const stateName = GST_STATE_NAMES[stateCode];
  const pan = normalized.slice(2, 12);

  if (!stateName) {
    return {
      check: 'unknown-state',
      normalized, stateCode, pan,
      storable: false,
      message: `"${stateCode}" is not a GST state code (01–38, 97, 99).`,
    };
  }

  const expected = gstCheckDigit(normalized.slice(0, 14));
  if (expected && expected !== normalized[14]) {
    return {
      check: 'bad-checksum',
      normalized, stateCode, stateName, pan,
      storable: true,
      message: `Check character should be "${expected}", not "${normalized[14]}" — worth re-reading off the certificate.`,
    };
  }

  return { check: 'valid', normalized, stateCode, stateName, pan, storable: true };
}

export function gstNumbers(gsts: ClientGst[] | undefined): string[] {
  const seen = new Set<string>();
  for (const g of gsts || []) {
    const n = normalizeGst(g.number);
    if (n) seen.add(n);
  }
  return [...seen];
}

// ── Deal-ticket vocabulary ───────────────────────────────────────────────────
//
// The one place the B2B modules agree on what a deal status MEANS. §2 counts
// "Enquiry IDs linked to this client, status = Closed" and §3.2 renders a
// "Closed" column; the deal tickets have no status called Closed, they have a
// fulfilment ladder. An order placed is an order placed however far it has since
// travelled, so everything from `Order Placed` downstream counts as one.
//
// `kamModel.ts` imports these rather than restating them, so the KAM board's
// auto-advance and this module's order count can never disagree about whether a
// client has ordered.

export const DEAL_ORDER_STATUSES = [
  'Order Placed', 'Order Confirmed', 'Partly Shipped', 'Shipped',
  'Partly Delivered', 'Delivered',
] as const;

export const DEAL_LOST_STATUSES = [
  'Order Lost', 'Order Cancelled', 'Refunded',
] as const;

const ORDER_SET = new Set<string>(DEAL_ORDER_STATUSES);
const LOST_SET = new Set<string>(DEAL_LOST_STATUSES);

export const dealIsOrder = (status: string | null | undefined): boolean => ORDER_SET.has(String(status || ''));
export const dealIsLost = (status: string | null | undefined): boolean => LOST_SET.has(String(status || ''));

/** Neither ordered nor lost — a live enquiry. */
export const dealIsOpen = (status: string | null | undefined): boolean => {
  const s = String(status || '');
  return !!s && !ORDER_SET.has(s) && !LOST_SET.has(s);
};

// ── The client entity ────────────────────────────────────────────────────────

export interface ClientMergeRecord {
  /** The absorbed record's id — kept so a merge can be explained, not undone. */
  id: string;
  company: string;
  mergedAt: string;
  mergedBy?: string;
}

export interface KamAssignment {
  kam: string;
  /** ISO instant. */
  at: string;
  by?: string;
  reason?: string;
}

export interface ClientEntity {
  id: string;
  /** §3.1 "Single canonical name for the merged entity". */
  company: string;
  contacts: ClientContact[];
  gsts: ClientGst[];
  segment?: Segment;
  clientType?: ClientEntityType;
  /** The source module's own wording, when `clientType` could not be mapped. */
  clientTypeRaw?: string;
  source: ClientSource;
  /** §2 of the KAM PRD — the assigned Key Account Manager. */
  kam?: string;
  /**
   * Every assignment this account has had, newest last. KAM PRD open question
   * #1 asks whether an account is permanently assigned or can be rebalanced.
   * Built reassignable, because a KAM leaving is not a hypothetical — but every
   * change is recorded, so "who owned this in June" has an answer.
   */
  assignments?: KamAssignment[];
  remarks?: string;
  /** KAM PRD §3.1 — calls and meetings logged against the account. */
  interactions?: ClientInteraction[];
  /** Client issues driving the account-health meter (see accountHealth.ts). */
  escalations?: Escalation[];
  mergedFrom?: ClientMergeRecord[];
  createdAt?: string;
  updatedAt?: string;
}

// ── Interactions (KAM PRD §3.1–3.3) ──────────────────────────────────────────
//
// Stored on the CLIENT, not on an order: §3 puts them in the client detail view,
// and an account's temperature has to survive the order that was open when it
// was taken. The most recent entry is the account's current reading — nothing is
// stored twice as a "latest" field, so there is no way for a summary to drift
// from the log it summarises.

export const INTERACTION_TYPES = ['Call', 'Meeting'] as const;
export type InteractionType = typeof INTERACTION_TYPES[number];

/** §3.2 — "0–10 scale — 0 is very bad, 10 is very good". */
export const TEMPERATURE_MIN = 0;
export const TEMPERATURE_MAX = 10;

export interface ClientInteraction {
  id: string;
  type: InteractionType;
  /** 'YYYY-MM-DD' — the day the call or meeting took place. */
  date: string;
  summary?: string;
  /** 0–10. Undefined when the KAM did not score this interaction. */
  temperature?: number;
  upcomingProject?: string;
  /** 'YYYY-MM-DD' — feeds Today's Calls and the Follow-up Queue (§4). */
  nextFollowUpDate?: string;
  loggedBy?: string;
  /** ISO instant the entry was written, so same-day entries keep their order. */
  createdAt?: string;
}

export function clampTemperature(v: unknown): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(TEMPERATURE_MIN, Math.min(TEMPERATURE_MAX, Math.round(n)));
}

/** Interactions newest first — by date, then by write order within a day. */
export function sortedInteractions(list: ClientInteraction[] | undefined): ClientInteraction[] {
  return [...(list || [])].sort((a, b) =>
    String(b.date || '').localeCompare(String(a.date || ''))
    || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export function latestInteraction(list: ClientInteraction[] | undefined): ClientInteraction | undefined {
  return sortedInteractions(list)[0];
}

/**
 * The account's current temperature: the most recent interaction that actually
 * carried a score. An unscored call does not reset the reading to "unknown" —
 * it just isn't a new reading.
 */
export function currentTemperature(list: ClientInteraction[] | undefined): { value: number; at: string } | undefined {
  for (const i of sortedInteractions(list)) {
    if (typeof i.temperature === 'number') return { value: i.temperature, at: i.date };
  }
  return undefined;
}

/** The scored reading before the current one — §6.2's "has it dropped?". */
export function previousTemperature(list: ClientInteraction[] | undefined): number | undefined {
  const scored = sortedInteractions(list).filter((i) => typeof i.temperature === 'number');
  return scored.length > 1 ? scored[1].temperature : undefined;
}

export const TEMPERATURE_BANDS = [
  { key: 'cold',  label: '0–3 · at risk',  min: 0, max: 3,  color: '#EF4444' },
  { key: 'warm',  label: '4–6 · watch',    min: 4, max: 6,  color: '#F59E0B' },
  { key: 'hot',   label: '7–10 · healthy', min: 7, max: 10, color: '#22C55E' },
] as const;
export type TemperatureBand = typeof TEMPERATURE_BANDS[number]['key'];

export function temperatureBand(v: number | undefined): TemperatureBand | undefined {
  if (typeof v !== 'number') return undefined;
  return TEMPERATURE_BANDS.find((b) => v >= b.min && v <= b.max)?.key;
}

export function temperatureColor(v: number | undefined): string {
  const band = temperatureBand(v);
  return TEMPERATURE_BANDS.find((b) => b.key === band)?.color || '#9CA3AF';
}

/**
 * The upcoming project currently on file (§3.3) — the most recent interaction
 * that recorded one. A later call that mentioned no project does not erase it;
 * the KAM has to type over it.
 */
export function currentUpcomingProject(list: ClientInteraction[] | undefined): { text: string; at: string } | undefined {
  for (const i of sortedInteractions(list)) {
    const text = String(i.upcomingProject || '').trim();
    if (text) return { text, at: i.date };
  }
  return undefined;
}

/**
 * The account's live next-follow-up date: the one on the most recent
 * interaction. Deliberately NOT "the earliest future date across the log" — a
 * follow-up set in March and superseded in April is not still pending, and
 * taking the minimum would keep re-raising it forever.
 */
export function nextFollowUp(list: ClientInteraction[] | undefined): { date: string; from: ClientInteraction } | undefined {
  const latest = latestInteraction(list);
  const date = String(latest?.nextFollowUpDate || '').slice(0, 10);
  return latest && date ? { date, from: latest } : undefined;
}

// ── Order metrics (PRD §2) ───────────────────────────────────────────────────
//
// Every figure here is derived from deal tickets. Nothing is stored on the
// client row: a stored total is a total that can be wrong, and this one has two
// independent ways to change (a new ticket, or a merge).
//
// Counts and values come from the BATCHED `/crm/leads/client-order-history/`
// endpoint, which is the same derivation the Leads tab uses — so a client row
// and the Leads tab can never disagree about how much a client has spent. Dates
// come from the per-phone ticket list, because the batched endpoint returns no
// dates at all. Both are optional, and each missing half has its own state.

export interface ClientOrderMetrics {
  /** Count of ordered Enquiry IDs. `undefined` = not loaded / unavailable. */
  orders?: number;
  totalRevenue?: number;
  /** Total ÷ orders. Undefined when there are no orders — not 0. */
  averageOrderValue?: number;
  /** Every enquiry ever raised, ordered or not. */
  enquiries?: number;
  openValue?: number;
  /** 'YYYY-MM-DD' of the most recent ordered ticket. */
  lastOrderPlaced?: string;
  /**
   * Whether the DATE half loaded. 'ok' | 'pending' | 'unavailable' | 'no-phone'
   * — kept separate from the count half because they come from different calls
   * and a client with real orders but an unread date must not read as inactive.
   */
  dateState: 'ok' | 'pending' | 'unavailable' | 'no-phone' | 'no-orders';
}

export const EMPTY_ORDER_METRICS: ClientOrderMetrics = { dateState: 'pending' };

export function averageOrderValue(total: number | undefined, orders: number | undefined): number | undefined {
  if (!orders || !Number.isFinite(orders) || orders <= 0) return undefined;
  return (Number(total) || 0) / orders;
}

// ── Client status (PRD §2.1) ─────────────────────────────────────────────────
//
// "Active: at least one order (Closed Enquiry ID) placed within the last 3
// months, measured from Last Order Placed. Inactive: no order placed in the
// trailing 3 months."
//
// Read literally, "measured from Last Order Placed" makes the rule vacuous: the
// last order is always within three months of itself, so every client who ever
// ordered would be Active forever and the column would carry no information.
// The PRD's own next sentence settles it — status "re-evaluates … on a daily
// rollover", and a daily rollover only ever changes the answer if the window is
// anchored to TODAY. So: Active = last ordered within the trailing 3 months of
// today. Flagged for KK rather than silently chosen.
//
// A THIRD state exists and must not be folded into Inactive. A client whose
// order dates could not be read — no phone on file, or a Django failure — is
// `unknown`, not inactive. Rendering an unread client as Inactive would have a
// KAM stand down an account that is ordering every week.

export const ACTIVE_WINDOW_MONTHS = 3;

export type ClientStatus = 'Active' | 'Inactive' | 'Unknown';

export const CLIENT_STATUS_COLORS: Record<ClientStatus, string> = {
  Active:   '#22C55E',
  Inactive: '#9CA3AF',
  Unknown:  '#3B82F6',
};

export const CLIENT_STATUS_HINT: Record<ClientStatus, string> = {
  Active:   `Ordered within the last ${ACTIVE_WINDOW_MONTHS} months`,
  Inactive: `No order in the last ${ACTIVE_WINDOW_MONTHS} months`,
  Unknown:  'Order dates could not be read for this client',
};

/** 'YYYY-MM-DD', `months` calendar months before `day`. */
export function monthsBefore(day: string, months: number): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  // Day-of-month is clamped by Date itself (31 Mar − 1 month → 3 Mar in JS), so
  // the boundary is built from a UTC date rather than by subtracting from `m`.
  const dt = new Date(Date.UTC(y, m - 1 - months, 1));
  const lastOfMonth = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, lastOfMonth));
  return dt.toISOString().slice(0, 10);
}

export function clientStatus(m: ClientOrderMetrics, today: string = istToday()): ClientStatus {
  if (m.dateState === 'pending' || m.dateState === 'unavailable' || m.dateState === 'no-phone') return 'Unknown';
  const last = String(m.lastOrderPlaced || '').slice(0, 10);
  if (!last) return 'Inactive';
  return last >= monthsBefore(today, ACTIVE_WINDOW_MONTHS) ? 'Active' : 'Inactive';
}

/** Days until an Active client crosses into Inactive. Undefined when it can't. */
export function daysToInactive(m: ClientOrderMetrics, today: string = istToday()): number | undefined {
  if (clientStatus(m, today) !== 'Active') return undefined;
  const last = String(m.lastOrderPlaced || '').slice(0, 10);
  if (!last) return undefined;
  const cutoff = Date.parse(`${last}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(cutoff) || Number.isNaN(now)) return undefined;
  // The order falls out of the window ACTIVE_WINDOW_MONTHS after it was placed.
  const [ly, lm, ld] = last.split('-').map(Number);
  const expiry = new Date(Date.UTC(ly, lm - 1 + ACTIVE_WINDOW_MONTHS, ld)).getTime();
  return Math.max(0, Math.round((expiry - now) / 86_400_000));
}

// ── Duplicate suggestions (PRD §4) ───────────────────────────────────────────
//
// "Search by company name, GST number, or contact number surfaces
// likely-duplicate client records for review… Merge is a manual, user-initiated
// action — not automatic."
//
// Suggestions are ranked by how much evidence there is, and the evidence is
// always shown, because that is what makes this safe: the system never merges,
// it hands a human two records and the reason it paired them. A shared PHONE or
// GST is exact-match evidence. A similar NAME is not evidence of identity —
// "Metro Constructions" and "Metro Construction Co" may be two firms — so a
// name-only pairing is offered at the lowest confidence and never pre-selected.

export type DuplicateEvidence = 'contact' | 'gst' | 'pan' | 'name';

export const EVIDENCE_LABEL: Record<DuplicateEvidence, string> = {
  contact: 'Same contact number',
  gst:     'Same GST number',
  pan:     'Same PAN inside two GSTs',
  name:    'Similar company name',
};

/** Exact-match evidence. A name similarity alone never reaches this. */
export const EVIDENCE_IS_EXACT: Record<DuplicateEvidence, boolean> = {
  contact: true, gst: true, pan: true, name: false,
};

export interface DuplicateSuggestion {
  a: ClientEntity;
  b: ClientEntity;
  evidence: DuplicateEvidence[];
  /** Which values actually matched, for display. */
  shared: string[];
}

export function normalizeCompanyName(v: string | undefined): string {
  return String(v || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(pvt|private|ltd|limited|llp|inc|co|company|enterprises?|constructions?|interiors?|designs?|associates?|and|the)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function overlap(a: string[], b: string[]): string[] {
  const set = new Set(b);
  return a.filter((v) => set.has(v));
}

export function findDuplicates(clients: ClientEntity[]): DuplicateSuggestion[] {
  const out: DuplicateSuggestion[] = [];
  const prepared = clients.map((c) => ({
    c,
    phones: contactNumbers(c.contacts),
    gsts: gstNumbers(c.gsts),
    pans: gstNumbers(c.gsts).map((g) => g.slice(2, 12)).filter((p) => p.length === 10),
    name: normalizeCompanyName(c.company),
  }));

  for (let i = 0; i < prepared.length; i++) {
    for (let j = i + 1; j < prepared.length; j++) {
      const A = prepared[i];
      const B = prepared[j];
      const evidence: DuplicateEvidence[] = [];
      const shared: string[] = [];

      const phones = overlap(A.phones, B.phones);
      if (phones.length) { evidence.push('contact'); shared.push(...phones); }

      const gsts = overlap(A.gsts, B.gsts);
      if (gsts.length) { evidence.push('gst'); shared.push(...gsts); }
      else {
        const pans = overlap(A.pans, B.pans);
        if (pans.length) { evidence.push('pan'); shared.push(...pans); }
      }

      if (A.name && A.name === B.name) { evidence.push('name'); shared.push(A.c.company); }

      if (evidence.length) out.push({ a: A.c, b: B.c, evidence, shared: [...new Set(shared)] });
    }
  }

  // Exact evidence first, then by how many kinds of evidence agree.
  const rank = (s: DuplicateSuggestion) =>
    (s.evidence.some((e) => EVIDENCE_IS_EXACT[e]) ? 0 : 1) * 10 - s.evidence.length;
  return out.sort((x, y) => rank(x) - rank(y));
}

// ── Merge (PRD §4) ───────────────────────────────────────────────────────────
//
// "The merged entity retains all contact numbers and all GST numbers from the
// source records, each still labelled individually. All historical Enquiry IDs
// from every merged source record roll up into the merged entity's Order
// Details, and list metrics recompute across the full merged history."
//
// Order history needs no migration step: it was never stored. Every metric is
// derived from the ticket list for the merged entity's phone numbers, so
// retaining the numbers IS the rollup.
//
// PRD open question #1 — which Segment wins when sources disagree — is answered
// by asking. `mergeConflicts()` reports every field the sources disagree on and
// `mergeClients()` requires a decision for each; there is no "most recent order
// wins" rule, because picking a segment changes how the account is targeted and
// nobody would ever know a machine chose it.

export type MergeField = 'company' | 'segment' | 'clientType' | 'kam' | 'source';

export const MERGE_FIELD_LABEL: Record<MergeField, string> = {
  company:    'Company name',
  segment:    'Segment',
  clientType: 'Client type',
  kam:        'KAM',
  source:     'Source',
};

export interface MergeConflict {
  field: MergeField;
  /** Distinct non-empty values across the sources, with who holds each. */
  options: { value: string; from: string[] }[];
}

const mergeValue = (c: ClientEntity, f: MergeField): string => {
  switch (f) {
    case 'company': return String(c.company || '').trim();
    case 'segment': return String(c.segment || '');
    case 'clientType': return String(c.clientType || '');
    case 'kam': return String(c.kam || '');
    case 'source': return String(c.source || '');
  }
};

const MERGE_FIELDS: MergeField[] = ['company', 'segment', 'clientType', 'kam', 'source'];

export function mergeConflicts(sources: ClientEntity[]): MergeConflict[] {
  const out: MergeConflict[] = [];
  for (const field of MERGE_FIELDS) {
    const byValue = new Map<string, string[]>();
    for (const c of sources) {
      const v = mergeValue(c, field);
      if (!v) continue;
      byValue.set(v, [...(byValue.get(v) || []), c.company || c.id]);
    }
    if (byValue.size > 1) {
      out.push({ field, options: [...byValue.entries()].map(([value, from]) => ({ value, from })) });
    }
  }
  return out;
}

export interface MergeChoices {
  company?: string;
  segment?: Segment;
  clientType?: ClientEntityType;
  kam?: string;
  source?: ClientSource;
}

export interface MergeResult {
  merged: ClientEntity;
  /** The records to delete once the merged entity has been written. */
  absorbed: ClientEntity[];
}

/**
 * Merge `sources` into the first one's id, applying `choices` for any field the
 * sources disagree on. The surviving id is the OLDEST record's, so the client's
 * own history keeps its identity and any external reference to it still resolves.
 */
export function mergeClients(
  sources: ClientEntity[],
  choices: MergeChoices,
  by: string | undefined,
  now: string = new Date().toISOString(),
): MergeResult {
  if (sources.length < 2) throw new Error('A merge needs at least two client records.');

  const ordered = [...sources].sort((a, b) =>
    String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || a.id.localeCompare(b.id));
  const keep = ordered[0];
  const absorbed = ordered.slice(1);

  // Contacts: every number from every source, de-duplicated on the normalized
  // number, keeping the first non-empty name/label seen for it. Exactly one
  // stays primary — the surviving record's, or the first contact if it had none.
  const contacts: ClientContact[] = [];
  const byNumber = new Map<string, ClientContact>();
  for (const c of ordered) {
    for (const contact of c.contacts || []) {
      const key = normalizeContactNumber(contact.number);
      if (!key) continue;
      const existing = byNumber.get(key);
      if (!existing) {
        const next: ClientContact = { ...contact, number: key, primary: false };
        byNumber.set(key, next);
        contacts.push(next);
      } else {
        if (!existing.name && contact.name) existing.name = contact.name;
        if (!existing.label && contact.label) existing.label = contact.label;
      }
    }
  }
  const keepPrimary = normalizeContactNumber(primaryContact(keep.contacts)?.number);
  const primary = contacts.find((c) => c.number === keepPrimary) || contacts[0];
  if (primary) primary.primary = true;

  const gsts: ClientGst[] = [];
  const byGst = new Map<string, ClientGst>();
  for (const c of ordered) {
    for (const g of c.gsts || []) {
      const key = normalizeGst(g.number);
      if (!key) continue;
      const existing = byGst.get(key);
      if (!existing) {
        const next: ClientGst = { ...g, number: key };
        byGst.set(key, next);
        gsts.push(next);
      } else if (!existing.registeredName && g.registeredName) {
        existing.registeredName = g.registeredName;
        existing.validatedAt = g.validatedAt;
      }
    }
  }

  // A field the sources agreed on needs no choice; `choices` only ever overrides
  // a genuine conflict, and an unresolved conflict keeps the surviving record's
  // value rather than blanking the field.
  const pick = <T extends string>(field: MergeField, fallback: T | undefined): T | undefined => {
    const chosen = (choices as Record<string, string | undefined>)[field];
    if (chosen) return chosen as T;
    const values = new Set(ordered.map((c) => mergeValue(c, field)).filter(Boolean));
    if (values.size === 1) return [...values][0] as T;
    return fallback;
  };

  const merged: ClientEntity = {
    ...keep,
    company: pick<string>('company', keep.company) || keep.company,
    contacts,
    gsts,
    segment: pick<Segment>('segment', keep.segment),
    clientType: pick<ClientEntityType>('clientType', keep.clientType),
    kam: pick<string>('kam', keep.kam),
    source: (pick<ClientSource>('source', keep.source) || 'Existing') as ClientSource,
    // Everything append-only is concatenated, oldest source first, so the merged
    // account carries the whole relationship rather than the survivor's slice.
    interactions: ordered.flatMap((c) => c.interactions || []),
    escalations: ordered.flatMap((c) => c.escalations || []),
    assignments: ordered.flatMap((c) => c.assignments || [])
      .sort((a, b) => String(a.at).localeCompare(String(b.at))),
    remarks: ordered.map((c) => String(c.remarks || '').trim()).filter(Boolean).join(' · ') || undefined,
    mergedFrom: [
      ...(keep.mergedFrom || []),
      ...absorbed.flatMap((c) => c.mergedFrom || []),
      ...absorbed.map((c) => ({ id: c.id, company: c.company, mergedAt: now, mergedBy: by })),
    ],
    updatedAt: now,
  };

  return { merged, absorbed };
}

// ── Field registry ───────────────────────────────────────────────────────────
//
// The declaration the detail view, the manual-entry form and the exports read,
// with the PRD section against each field so a reviewer can check this file
// against the document line by line.

export type ClientFieldInput = 'text' | 'textarea' | 'select' | 'contacts' | 'gsts' | 'readonly';

export interface ClientFieldSpec {
  key: string;
  label: string;
  section: '2' | '3.1' | '3.2' | '6.1';
  owner: FieldOwner;
  input: ClientFieldInput;
  options?: readonly string[];
  hint?: string;
  /** Asked for on the manual-entry form (PRD §6.1). */
  onCreate?: boolean;
  /** Refuses a save when empty. Only what the PRD's own table marks Mandatory. */
  required?: boolean;
}

export const CLIENT_FIELDS: ClientFieldSpec[] = [
  { key: 'company',    label: 'Company / business entity name', section: '3.1', owner: 'crm', input: 'text', onCreate: true, required: true },
  { key: 'contacts',   label: 'Contact numbers',                section: '3.1', owner: 'crm', input: 'contacts', onCreate: true, required: true, hint: 'One or more, each with a name and a label. Orders link to a client by these numbers.' },
  { key: 'gsts',       label: 'GST numbers',                    section: '3.1', owner: 'crm', input: 'gsts', onCreate: true, hint: 'Structure and check digit are validated here; the registered company name needs a GST Validator this stack does not have' },
  { key: 'segment',    label: 'Segment',                        section: '3.1', owner: 'crm', input: 'select', options: SEGMENTS, onCreate: true, required: true },
  { key: 'clientType', label: 'Client type',                    section: '6.1', owner: 'crm', input: 'select', options: CLIENT_ENTITY_TYPES, onCreate: true, required: true },
  { key: 'kam',        label: 'KAM',                            section: '3.2', owner: 'crm', input: 'select', hint: 'Assigned at the Inbound/Outreach handoff; reassignable, and every change is recorded' },
  { key: 'source',     label: 'Source',                         section: '2',   owner: 'crm', input: 'select', options: CLIENT_SOURCES },
  { key: 'remarks',    label: 'Remarks',                        section: '6.1', owner: 'crm', input: 'textarea' },

  // Derived — never typed, never stored. Listed so the detail view can render
  // provenance beside them and a reader can see why they are read-only.
  { key: 'lastOrderPlaced',    label: 'Last order placed',     section: '2', owner: 'deals', input: 'readonly', hint: 'Most recent ordered ticket on any of this client’s numbers' },
  { key: 'orders',             label: 'Number of orders',      section: '2', owner: 'deals', input: 'readonly' },
  { key: 'totalRevenue',       label: 'Total revenue',         section: '2', owner: 'deals', input: 'readonly' },
  { key: 'averageOrderValue',  label: 'Average order value',   section: '2', owner: 'derived', input: 'readonly', hint: 'Total revenue ÷ number of orders' },
  { key: 'clientStatus',       label: 'Client status',         section: '2', owner: 'derived', input: 'readonly', hint: `Active = ordered within ${ACTIVE_WINDOW_MONTHS} months. System-computed; never set by hand.` },
];

export const CLIENT_FIELDS_BY_SECTION = (section: ClientFieldSpec['section']): ClientFieldSpec[] =>
  CLIENT_FIELDS.filter((f) => f.section === section);

/**
 * Blocking problems with a client record. Exactly the fields the PRD's §7 table
 * marks Mandatory — company name, one contact number, segment, client type —
 * and nothing else. GST is explicitly optional there and is never gated.
 */
export function clientGateErrors(c: Partial<ClientEntity>): string[] {
  const errs: string[] = [];
  if (!String(c.company || '').trim()) errs.push('A company name is required.');
  const numbers = contactNumbers(c.contacts);
  if (!numbers.length) errs.push('At least one valid 10-digit contact number is required — it is the only thing that links orders to this client.');
  const bad = (c.contacts || []).filter((x) => String(x.number || '').trim() && !isValidContactNumber(x.number));
  if (bad.length) errs.push(`${bad.length} contact number${bad.length === 1 ? '' : 's'} ${bad.length === 1 ? 'is' : 'are'} not a valid 10-digit Indian mobile number.`);
  if (!c.segment) errs.push('A segment (1, 2 or 3) is required.');
  if (!c.clientType) errs.push('A client type is required.');
  for (const g of c.gsts || []) {
    const v = validateGst(g.number);
    if (!v.storable) errs.push(`GST "${g.number}": ${v.message}`);
  }
  return errs;
}

/** Non-blocking things worth fixing. Counted and chased, never enforced. */
export function clientEnrichmentGaps(c: ClientEntity): string[] {
  const gaps: string[] = [];
  if (!(c.gsts || []).length) gaps.push('No GST on file');
  if (!(c.contacts || []).some((x) => String(x.name || '').trim())) gaps.push('No contact person named');
  if (!c.kam) gaps.push('No KAM assigned');
  const withChecksumWarning = (c.gsts || []).filter((g) => validateGst(g.number).check === 'bad-checksum');
  if (withChecksumWarning.length) gaps.push(`${withChecksumWarning.length} GST check digit${withChecksumWarning.length === 1 ? '' : 's'} disagree`);
  return gaps;
}
