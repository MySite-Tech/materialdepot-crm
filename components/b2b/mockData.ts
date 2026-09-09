// ── B2B Sales CRM — shared types ─────────────────────────────────────────────
// Types and vocabularies for the B2B Sales CRM module (Dashboard, Inbound,
// Outreach, KAM, Leads). Both lead modules now follow their PRDs, and their
// field registries, status machines and provenance rules live in
// `inboundModel.ts` and `outreachModel.ts` — this file re-exports what the
// shared boards import.

import {
  INBOUND_STATUSES, INBOUND_STATUS_COLORS,
  type InboundStatus, type InboundLocation, type Segment, type ClientType,
  type LeadType, type Priority, type Selection, type CallAttempt, type PlacedUnder,
} from './inboundModel';
import {
  OUTREACH_STATUSES, OUTREACH_STATUS_COLORS,
  type OutreachStatus, type OutreachMeeting, type MeetingStatus, type CompanyType,
} from './outreachModel';

export type AccountType = 'Interior Designer' | 'Architect' | 'Builder' | 'Modular Factory' | 'OSR' | 'Contractor' | 'Retailer';

// ── Inbound ──────────────────────────────────────────────────────────────────
// The status vocabulary, gates and field registry live in `inboundModel.ts`,
// which implements the Inbound CRM Module PRD. Re-exported under the old
// `*Stage*` names because Dashboard / LeadershipBoard / analytics import them.
export type InboundStage = InboundStatus;
export const INBOUND_STAGES: InboundStatus[] = INBOUND_STATUSES;
export type { InboundStatus };

// Two Kylas pipeline stages both feed the local "New" column — this lets the
// New column be filtered down to just one of them.
export const NEW_KYLAS_STAGES: { id: number; label: string }[] = [
  { id: 220515, label: 'B2B Qualified' },
  { id: 220290, label: 'Won' },
];

export type ProductCategory = 'Tiles' | 'Plywood' | 'Laminate' | 'Liner Laminate' | 'Panel' | 'Others';
export const PRODUCT_CATEGORIES: ProductCategory[] = ['Tiles', 'Plywood', 'Laminate', 'Liner Laminate', 'Panel', 'Others'];

export type CallOutcome = 'Connected' | 'RNR' | null;
export interface CallStep {
  label: string;             // "Call 1"
  outcome: CallOutcome;      // null = not yet actioned
  ts?: string;               // when it happened, e.g. "12 Jul 11:37 am"
  overdueHours?: number;     // hours overdue if due & not done
}

export interface LeadNote { ts: string; author: string; text: string }

export interface CallLogEntry {
  id: string;
  ts: string;
  direction: string;   // Inbound / Outbound
  status: string;      // Connected / Missed / …
  durationSec?: number;
  by?: string;
  note?: string;
}

// One deal ticket from the Django `ticket` table (via /crm/leads/), matched to a
// B2B lead by phone. Kylas is not consulted — escalated deals live in their own
// CRM section.
export interface LeadDeal {
  id: string;                // cart number / ENQ id
  ticketId?: number;
  status: string;            // In Cart / Order Placed / Order Lost / …
  cartValue: number;
  cartItems?: string;
  branch?: string;
  assignedTo?: string;
  createdAt?: string;
  followUpDate?: string;
  closureDate?: string;
  lostReason?: string;
}

export interface InboundLead {
  id: string;

  // ── §3.1 Auto-synced from Kylas, read-only here ──
  // Presales owns every field in this block. Editing one in the CRM would be
  // silently reverted by the next sync, so the drawer renders them read-only.
  phone: string;
  contactName: string;
  owner: string;                  // "Assigned To" — the Inbound BM
  ownerId?: number;               // Kylas owner id (notes/call-log lookups)
  leadCreatedAt?: string;         // ISO instant — PRD "Lead Date & Time"
  qualificationTag?: string;      // "B2B Qualified" / "Inbound Qualified"
  presalesOwner?: string;         // who qualified it (Kylas cfPsOwner)
  leadSummary?: string;           // enquiry type as Presales recorded it
  urgency?: string;               // "Immediate" / "Not sure" (Kylas `city`)
  pincode?: string;               // real pincode (Kylas `zipcode`)
  presalesClientType?: string;    // Kylas cfClientType — its own vocabulary
  presalesMissedCalls?: number;   // Kylas cfMissedCallCount
  kylasStage?: number;            // raw pipelineStage id — only meaningful while stage === 'New'
  source: 'Website form' | 'WhatsApp' | 'Referral' | 'Walk-in' | 'Google' | 'Other';

  // ── §3.2 Updated by the Inbound Sales team (b2b_lead) ──
  companyName?: string;           // the real company; Kylas ships a phone number
  gstNumber?: string;
  segment?: Segment;
  clientType?: ClientType;
  leadType?: LeadType;
  priority?: Priority;
  location?: InboundLocation;     // defaults from pincode, overridable
  callAttempts?: CallAttempt[];   // attempts 1-4, Connected | RNR

  // ── §3.3 Requirement details ──
  selections?: Selection[];       // Tiles / Plywood / … (Plywood has no Kylas option)
  requirement?: string;           // requirement summary — pushed back to Kylas
  expectedOrderValue?: number;    // the BM's estimate at qualification

  // ── §3.4 Status ──
  stage: InboundStatus;
  /**
   * When the status last changed, ISO. Nothing recorded this before, so the
   * PRD §5.2 "Closed today / PI Shared today" tiles could only ever be answered
   * for the whole loaded window. Rows that pre-date this field have none, and
   * are reported as untimed rather than counted into today.
   */
  statusChangedAt?: string;
  followUpDate?: string;          // 'YYYY-MM-DD'
  followUpTime?: string;          // 'HH:MM'
  enqId?: string;
  orderValue?: number;            // resolved from the matching deal ticket
  orderValueSource?: 'deal' | 'manual';
  lostReason?: string;

  // ── §3.5 Placed under (on Closed) ──
  placedUnder?: PlacedUnder;
  kam?: string;                   // round-robin assignee on order won

  // ── Display / analytics ──
  /** Card headline: `companyName` when the team has filled it, else the Kylas name. */
  company: string;
  /**
   * Realised rupees only — `orderValue` or nothing. Never the estimate:
   * `analytics.ts` sums this as revenue, and folding a BM's guess into it would
   * inflate every target on the Leadership Board.
   */
  value: number;
  calls?: CallStep[];
  notes?: LeadNote[];

  // ── Retained for the shared boards ──
  accountType?: AccountType;      // legacy vocabulary; superseded by clientType
  city?: string;
  timeline?: string;              // = urgency; kept because the list view reads it
  requirementBrief?: string;      // = leadSummary
  categories?: string[];          // = selections, in Kylas labels
  piStatus?: string;
  followUpNote?: string;
  overdueHours?: number;
  /**
   * NOT populated for inbound leads any more. Kylas `expectedClosureOn` is
   * auto-stamped ~14 minutes after lead creation (median of 100 sampled; 45 of
   * them within 10 minutes), so it was never an expected closure date. The PRD
   * defines no such field for inbound — `followUpDate` is the real forward
   * date — and mapping the junk value in put every lead into the Dashboard's
   * "closing in 7 days" list and auto-flipped its status to Followup Required.
   */
  expectedClosure?: string;
}

// The Kylas `cfCategoriesOfInterest` picklist itself lives in `mockApi.ts`
// (id ↔ Kylas label) and the PRD Selection ↔ Kylas label mapping lives in
// `inboundModel.ts`. Nothing needs a third copy here.

// ── Outreach (was "Outbound") ────────────────────────────────────────────────
// The status vocabulary, the meeting loop, the gates and the field registry
// live in `outreachModel.ts`, which implements the B2B Outreach Module PRD.
// Re-exported here because the shared boards (Dashboard / LeadershipBoard /
// analytics) import their types from this file.
//
// The DB `pipeline` column still reads `'outbound'`. That is deliberate: it is
// a stored enum on `b2b_lead` whose allowed values are not tracked in this
// repo, and renaming a column value to match a document's wording is not worth
// a write that starts failing in production. Only the vocabulary a human reads
// changed.
export type OutreachStage = OutreachStatus;
export const OUTREACH_STAGES: OutreachStatus[] = OUTREACH_STATUSES;
export type { OutreachStatus, OutreachMeeting, MeetingStatus, CompanyType };

export interface OutreachLead {
  id: string;

  // ── §3.1 Create Lead ──
  company: string;
  contactPerson: string;
  designation?: string;
  phone?: string;
  gstNumber?: string;             // PRD: "Optional — not mandatory"
  segment?: Segment;              // '1' | '2' | '3'
  leadType?: LeadType;            // Hot | Warm | Cold
  companyType?: CompanyType;      // Architect / Interior Designer / Contractor / Builder / Other
  companyTypeOther?: string;      // the "(specify)" half of Other
  bm: string;                     // the BM who created and owns the lead
  createdAt?: string;             // ISO instant — when the lead was logged in the field

  // ── §3.2 Meetings (up to 4) ──
  meetings?: OutreachMeeting[];

  // ── §3.3 Requirement details ──
  selections?: Selection[];       // Tiles / Plywood / Laminates / …
  requirement?: string;
  /**
   * The BM's estimate at qualification. NEVER summed as revenue — the PRD's
   * §6 "Quote Shared" tile reports it, labelled as an estimate, and nothing
   * else reads it. Same rule as the Inbound board's `expectedOrderValue`.
   */
  expectedOrderValue?: number;

  // ── §3.4 Status ──
  status: OutreachStatus;
  /** When the status last changed, ISO. Drives the "today" halves of §6. */
  statusChangedAt?: string;
  followUpDate?: string;          // 'YYYY-MM-DD'
  followUpTime?: string;          // 'HH:MM'
  quoteSharedAt?: string;         // ISO — when the quote was logged as shared
  enqId?: string;
  /** Resolved from the matching deal ticket. Never typed while a ticket owns it. */
  orderValue?: number;
  orderValueSource?: 'deal' | 'manual';
  dealStatus?: string;            // status on the matched deal ticket
  expectedClosure?: string;       // 'YYYY-MM-DD' — a Leads-tab column
  lostReason?: string;

  // ── §7 KAM handoff ──
  kam?: string;
  spok?: string;                  // whoever is speaking to the lead (Leads tab)
  ecName?: string;                // Experience Centre that assisted, if any
  ecBmName?: string;              // that EC's BM

  notes?: LeadNote[];

  /**
   * Realised rupees only — `orderValue` or nothing. `analytics.ts` sums this as
   * revenue, so folding the BM's estimate into it would inflate every target on
   * the Leadership Board. This is the exact bug the Inbound rollout fixed; the
   * old outreach board had it too, because its single `value` field was typed
   * by the BM on the create form and then counted as revenue on Closed.
   */
  value: number;
}

// ── KAM ──────────────────────────────────────────────────────────────────────
//
// `KamClient` used to live here: one row that was a client and an order at the
// same time, with the seven stages the old board ran on. The KAM PRD splits
// those apart, so both halves moved and neither is restated here:
//
//   The client entity  → `ClientEntity` in `clientModel.ts` (the Client
//                        Database's own type, shared with the KAM module by
//                        KAM PRD §7).
//   The order          → `KamOrder` in `kamModel.ts`, with the PRD's five
//                        statuses and `normalizeKamOrderStatus` mapping the old
//                        seven on every read.
//
// `KamSource` stays, because both new types use it and the stored values on 30
// live rows are its members. Note the DB values are 'Existing' | 'Inbound' |
// 'Outbound' — the reading vocabulary is Outreach, the stored one is not (same
// rule as `b2b_lead.pipeline`).
export type KamSource = 'Existing' | 'Inbound' | 'Outbound';

// Lost reasons for the B2B boards. Deliberately separate from ORDER_LOST_REASONS
// in app/App.tsx — that list is the Django deal vocabulary for the Leads tab and
// is sent to the backend; this one is B2B-board-local.
export const B2B_LOST_REASONS = [
  'Selection Not Liked',
  'Price Issue',
  'Timeline/Delivery Delay',
] as const;

export const KAMS = ['Krishna Bhagavatula', 'Tharun', 'Jadhav', 'Sidhant', 'Hardi', 'Mandeep', 'Vilok', 'Praful'];

export const B2B_ADMINS = ['Krishna Bhagavatula'];

// ── Stage → accent colour (aligned with app STATUS_COLORS vocabulary) ─────────
export const INBOUND_STAGE_COLORS: Record<InboundStatus, string> = INBOUND_STATUS_COLORS;

export const OUTREACH_STAGE_COLORS: Record<OutreachStatus, string> = OUTREACH_STATUS_COLORS;

// KAM order colours live with the statuses, in `kamModel.ts`
// (`KAM_ORDER_STATUS_COLORS`) — one declaration, not a copy here.

export const B2B_REPS = ['Krishna Bhagavatula', 'Tharun', 'Jadhav', 'Sidhant', 'Hardi', 'Mandeep', 'Vilok', 'Praful'];

// ── Targets — per-rep role + goal config (actuals are computed from live data) ─
export type RepRole = 'KAM' | 'Inbound' | 'Outbound';

export interface RepTargetConfig {
  rep: string;
  role: RepRole;
  revenueTargetL: number;       // goal, ₹ lakhs
  clientsTarget: number;        // KAM goal
  onboardingsTarget: number;    // Inbound / Outbound goal
}

export const REP_TARGETS: RepTargetConfig[] = [
  { rep: 'Tharun',  role: 'KAM',      revenueTargetL: 8, clientsTarget: 12, onboardingsTarget: 0 },
  { rep: 'Jadhav',  role: 'KAM',      revenueTargetL: 7, clientsTarget: 10, onboardingsTarget: 0 },
  { rep: 'Sidhant', role: 'KAM',      revenueTargetL: 7, clientsTarget: 10, onboardingsTarget: 0 },
  { rep: 'Hardi',   role: 'Inbound',  revenueTargetL: 5, clientsTarget: 0,  onboardingsTarget: 8 },
  { rep: 'Mandeep', role: 'Inbound',  revenueTargetL: 5, clientsTarget: 0,  onboardingsTarget: 8 },
  { rep: 'Vilok',   role: 'Outbound', revenueTargetL: 6, clientsTarget: 0,  onboardingsTarget: 6 },
  { rep: 'Praful',  role: 'Outbound', revenueTargetL: 6, clientsTarget: 0,  onboardingsTarget: 6 },
];

export const REP_ROLE_COLORS: Record<RepRole, string> = {
  KAM:      '#0F766E',
  Inbound:  '#3B82F6',
  Outbound: '#EAB308',
};

export const B2B_MONTHLY_TARGET_L = 120; // ₹1.20 Cr

export interface TargetStore {
  monthlyTargetL: number;
  reps: Record<string, { revenueTargetL: number; clientsTarget: number; onboardingsTarget: number }>;
}

// Default goals from config; the saved store (Supabase b2b_target) is merged over this.
export function defaultTargetStore(): TargetStore {
  return {
    monthlyTargetL: B2B_MONTHLY_TARGET_L,
    reps: Object.fromEntries(REP_TARGETS.map((r) => [r.rep, {
      revenueTargetL: r.revenueTargetL, clientsTarget: r.clientsTarget, onboardingsTarget: r.onboardingsTarget,
    }])),
  };
}

// ── Formatting helpers (Indian lakh/crore) ────────────────────────────────────
export const fmtL = (n: number): string => {
  if (n >= 1_00_00_000) return '₹' + (n / 1_00_00_000).toFixed(2) + ' Cr';
  return '₹' + (n / 1_00_000).toFixed(2) + ' L';
};

export const fmtINR = (n: number): string => '₹' + Number(n || 0).toLocaleString('en-IN');

export const ordinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
