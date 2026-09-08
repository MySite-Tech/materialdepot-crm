// ── B2B Sales CRM — shared types ─────────────────────────────────────────────
// Types and vocabularies for the B2B Sales CRM module (Dashboard, Inbound,
// Outbound, KAM). The Inbound half now follows the Inbound CRM Module PRD v1.0
// and its field registry, status machine and provenance rules live in
// `inboundModel.ts` — this file re-exports what the shared boards import.

import {
  INBOUND_STATUSES, INBOUND_STATUS_COLORS,
  type InboundStatus, type InboundLocation, type Segment, type ClientType,
  type LeadType, type Priority, type Selection, type CallAttempt, type PlacedUnder,
} from './inboundModel';

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

// ── Outbound ─────────────────────────────────────────────────────────────────
export type OutboundStage =
  | 'Yet to Meet' | 'In Progress' | 'Samples/Catalogues Shared' | 'PI Shared' | 'Closed' | 'Lost';

export const OUTBOUND_STAGES: OutboundStage[] = [
  'Yet to Meet', 'In Progress', 'Samples/Catalogues Shared', 'PI Shared', 'Closed', 'Lost',
];

export interface OutboundLead {
  id: string;
  company: string;
  contactName: string;
  phone?: string;
  accountType: AccountType;
  city?: string;
  stage: OutboundStage;
  bda: string;              // assigned BDA
  segment: string;         // "Seg 1" | "Seg 2" | "Seg 3"
  visitCount: number;      // -> "2nd Visit"
  value: number;           // proposal / cart value in ₹
  expectedClosure?: string;
  nextMeetingDate?: string;
  nextMeetingTime?: string;
  requirement?: string;           // detailed requirement, edited by BDA
  categories?: ProductCategory[];
  notes?: LeadNote[];
  // ── stage-specific working fields ──
  enqId?: string;                 // PI Shared / Closed
  piValue?: number;               // PI Shared / Closed
  piStatus?: string;              // PI Shared / Closed
  lostReason?: string;            // Lost
}

// ── KAM (existing clients & converted leads) ─────────────────────────────────
// Quote Approval Pending / Awaiting Payment / Order Placed are driven by the
// client's Django deal status (see kamAutoStage.ts). PI Shared is retained
// rather than replaced: existing rows already carry that stage string, and
// analytics.ts reads it.
export type KamStage =
  | 'No Active Enquiry' | 'Quote Approval Pending'
  | 'PI Shared' | 'Awaiting Payment' | 'Order Placed' | 'Closed' | 'Lost';
export const KAM_STAGES: KamStage[] = [
  'No Active Enquiry', 'Quote Approval Pending',
  'PI Shared', 'Awaiting Payment', 'Order Placed', 'Closed', 'Lost',
];

export type KamSource = 'Existing' | 'Inbound' | 'Outbound';

export interface KamClient {
  id: string;
  company: string;
  contactName: string;
  phone: string;
  enqId?: string;
  value: number;            // PI value in ₹
  expectedClosure?: string; // ISO date
  stage: KamStage;
  kam: string;              // assigned KAM
  source: KamSource;
  notes?: LeadNote[];
  // Logged client issues driving the account health meter. See accountHealth.ts.
  escalations?: import('./accountHealth').Escalation[];
}

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

export const OUTBOUND_STAGE_COLORS: Record<OutboundStage, string> = {
  'Yet to Meet':               '#3B82F6',
  'In Progress':               '#F59E0B',
  'Samples/Catalogues Shared': '#6366F1',
  'PI Shared':                 '#8B5CF6',
  'Closed':                    '#22C55E',
  'Lost':                      '#EF4444',
};

export const KAM_STAGE_COLORS: Record<KamStage, string> = {
  'No Active Enquiry':      '#9CA3AF',
  'Quote Approval Pending': '#F59E0B',
  'PI Shared':         '#EAB308',
  'Awaiting Payment':  '#3B82F6',
  'Order Placed':      '#FB923C',
  'Closed':            '#22C55E',
  'Lost':              '#EF4444',
};

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
