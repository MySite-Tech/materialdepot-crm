// ── B2B Sales CRM — mock data + types ────────────────────────────────────────
// Standalone in-memory data for the B2B Sales CRM module (Dashboard, Inbound
// Leads, Outbound Leads). No backend yet — mirrors the PRD v1.0 field model.

export type AccountType = 'Interior Designer' | 'Architect' | 'Builder' | 'Modular Factory' | 'OSR' | 'Contractor' | 'Retailer';

// ── Inbound ──────────────────────────────────────────────────────────────────
export type InboundStage =
  | 'New' | 'RNR' | 'Followup Required' | 'Quote' | 'PI Shared' | 'Closed' | 'Lost' | 'Enquiry Invalid';

export const INBOUND_STAGES: InboundStage[] = [
  'New', 'RNR', 'Followup Required', 'Quote', 'PI Shared', 'Closed', 'Lost', 'Enquiry Invalid',
];

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
  company: string;
  contactName: string;
  phone: string;
  ownerId?: number;          // Kylas owner id (for notes lookup)
  accountType?: AccountType;
  city?: string;
  stage: InboundStage;
  kylasStage?: number;      // raw Kylas pipelineStage id — only meaningful while stage === 'New'
  owner: string;
  source: 'Website form' | 'WhatsApp' | 'Referral' | 'Walk-in' | 'Google' | 'Other';
  urgency: 'Immediate need' | 'Planning' | 'Just browsing';
  value: number;             // cart/PI value in ₹
  followUpNote?: string;     // e.g. "Call 1"
  overdueHours?: number;     // hours overdue on follow-up, if any
  expectedClosure?: string;  // ISO date
  // ── pre-sales brief (via Kylas) + working detail ──
  timeline?: string;              // "1 month"
  requirementBrief?: string;      // "Plywood for 3 residential projects"
  requirement?: string;           // detailed requirement, edited by rep
  categories?: string[];          // Kylas cfCategoriesOfInterest labels
  calls?: CallStep[];
  notes?: LeadNote[];
  // ── stage-specific working fields (CRM-owned) ──
  followUpDate?: string;          // Followup Required
  followUpTime?: string;          // Followup Required
  enqId?: string;                 // PI Shared
  piStatus?: string;              // PI Shared
  lostReason?: string;            // Lost
}

// Kylas custom field `cfCategoriesOfInterest` picklist (id ↔ display label)
export const KYLAS_LEAD_CATEGORIES: { id: number; label: string }[] = [
  { id: 2689623, label: 'Tiles' },
  { id: 2689624, label: 'Panels' },
  { id: 2689625, label: 'Laminates' },
  { id: 2689626, label: 'Wallpapers' },
  { id: 2689627, label: 'Wooden Flooring' },
  { id: 2689628, label: 'Others' },
];

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
export type KamStage = 'No Active Enquiry' | 'PI Shared' | 'Awaiting Payment' | 'Closed' | 'Lost';
export const KAM_STAGES: KamStage[] = ['No Active Enquiry', 'PI Shared', 'Awaiting Payment', 'Closed', 'Lost'];

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
}

export const KAMS = ['Krishna Bhagavatula', 'Tharun', 'Jadhav', 'Sidhant', 'Hardi', 'Mandeep', 'Vilok', 'Praful'];

export const B2B_ADMINS = ['Krishna Bhagavatula'];

// ── Stage → accent colour (aligned with app STATUS_COLORS vocabulary) ─────────
export const INBOUND_STAGE_COLORS: Record<InboundStage, string> = {
  'New':               '#3B82F6',
  'RNR':               '#EF4444',
  'Followup Required': '#F59E0B',
  'Quote':             '#6366F1',
  'PI Shared':         '#8B5CF6',
  'Closed':            '#22C55E',
  'Lost':              '#9CA3AF',
  'Enquiry Invalid':   '#6B7280',
};

export const OUTBOUND_STAGE_COLORS: Record<OutboundStage, string> = {
  'Yet to Meet':               '#3B82F6',
  'In Progress':               '#F59E0B',
  'Samples/Catalogues Shared': '#6366F1',
  'PI Shared':                 '#8B5CF6',
  'Closed':                    '#22C55E',
  'Lost':                      '#EF4444',
};

export const KAM_STAGE_COLORS: Record<KamStage, string> = {
  'No Active Enquiry': '#9CA3AF',
  'PI Shared':         '#EAB308',
  'Awaiting Payment':  '#3B82F6',
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
