// ── B2B Sales CRM — mock data + types ────────────────────────────────────────
// Standalone in-memory data for the B2B Sales CRM module (Dashboard, Inbound
// Leads, Outbound Leads). No backend yet — mirrors the PRD v1.0 field model.

export type AccountType = 'Interior Designer' | 'Architect' | 'Builder' | 'Modular Factory' | 'OSR' | 'Contractor' | 'Retailer';
export type Priority = 'High' | 'Medium' | 'Low';

// ── Inbound ──────────────────────────────────────────────────────────────────
export type InboundStage =
  | 'New' | 'RNR' | 'Followup Required' | 'Quote' | 'PI Shared' | 'Closed' | 'Lost' | 'Enquiry Invalid';

export const INBOUND_STAGES: InboundStage[] = [
  'New', 'RNR', 'Followup Required', 'Quote', 'PI Shared', 'Closed', 'Lost', 'Enquiry Invalid',
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

export interface InboundLead {
  id: string;
  company: string;
  contactName: string;
  phone: string;
  ownerId?: number;          // Kylas owner id (for notes lookup)
  accountType: AccountType;
  city?: string;
  stage: InboundStage;
  priority: Priority;
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

export const PRIORITY_COLORS: Record<Priority, string> = {
  High:   '#EF4444',
  Medium: '#F59E0B',
  Low:    '#6B7280',
};

// ── Seed data (mirrors the reference designs verbatim) ────────────────────────
export const INBOUND_LEADS: InboundLead[] = [
  { id: 'IB-01', company: 'Ramesh Traders', contactName: 'Ramesh', phone: '9876543210', accountType: 'Retailer', city: 'Bengaluru', stage: 'New', priority: 'High', owner: 'Krishna Bhagavatula', source: 'Website form', urgency: 'Immediate need', value: 412000, followUpNote: 'Call 1', overdueHours: 122.0,
    timeline: '2 weeks', requirementBrief: 'Bulk tiles for showroom', categories: ['Tiles'],
    calls: [{ label: 'Call 1', outcome: null, overdueHours: 122.0 }, { label: 'Call 2', outcome: null }, { label: 'Call 3', outcome: null }, { label: 'Call 4', outcome: null }] },
  { id: 'IB-02', company: 'Shree Interiors', contactName: 'Shree', phone: '9876500021', accountType: 'Interior Designer', city: 'Bengaluru', stage: 'RNR', priority: 'Medium', owner: 'Krishna Bhagavatula', source: 'WhatsApp', urgency: 'Planning', value: 0, followUpNote: 'Call 2', overdueHours: 122.3,
    timeline: '1 month', requirementBrief: 'Plywood for 3 residential projects', categories: [],
    calls: [{ label: 'Call 1', outcome: 'RNR', ts: '12 Jul 11:37 am' }, { label: 'Call 2', outcome: null, overdueHours: 122.3 }, { label: 'Call 3', outcome: null }, { label: 'Call 4', outcome: null }] },
  { id: 'IB-03', company: 'Vasavi Constructions', contactName: 'Vasavi', phone: '9876511122', accountType: 'Contractor', city: 'Bengaluru', stage: 'Followup Required', priority: 'High', owner: 'Krishna Bhagavatula', source: 'Referral', urgency: 'Planning', value: 0,
    timeline: '3 weeks', requirementBrief: 'Laminates for office fit-out', categories: ['Laminate'],
    calls: [{ label: 'Call 1', outcome: 'Connected', ts: '10 Jul 4:12 pm' }, { label: 'Call 2', outcome: null }, { label: 'Call 3', outcome: null }, { label: 'Call 4', outcome: null }] },
  { id: 'IB-04', company: 'Om Sai Builders', contactName: 'Om Sai', phone: '9876522233', accountType: 'Builder', city: 'Bengaluru', stage: 'PI Shared', priority: 'High', owner: 'Krishna Bhagavatula', source: 'Google', urgency: 'Immediate need', value: 412000, expectedClosure: '2026-07-20',
    timeline: '1 week', requirementBrief: 'Panels + tiles for 2 towers', categories: ['Panel', 'Tiles'],
    calls: [{ label: 'Call 1', outcome: 'Connected', ts: '8 Jul 10:02 am' }, { label: 'Call 2', outcome: 'Connected', ts: '11 Jul 3:40 pm' }, { label: 'Call 3', outcome: null }, { label: 'Call 4', outcome: null }] },
  { id: 'IB-05', company: 'Nova Homes', contactName: 'Nova', phone: '9876533344', accountType: 'Builder', city: 'Bengaluru', stage: 'Lost', priority: 'Low', owner: 'Krishna Bhagavatula', source: 'Walk-in', urgency: 'Just browsing', value: 0,
    timeline: 'No timeline', requirementBrief: 'Just browsing options', categories: [],
    calls: [{ label: 'Call 1', outcome: 'RNR', ts: '5 Jul 1:15 pm' }, { label: 'Call 2', outcome: 'RNR', ts: '7 Jul 6:30 pm' }, { label: 'Call 3', outcome: null }, { label: 'Call 4', outcome: null }] },
];

export const B2B_REPS = ['Krishna Bhagavatula', 'Tharun', 'Jadhav', 'Sidhant', 'Hardi', 'Mandeep', 'Vilok', 'Praful'];

// ── Dashboard summary (mirrors the reference design) ──────────────────────────
export const DASHBOARD = {
  revenueGenerated: 1780000,     // ₹17.80 L
  monthlyTarget: 12000000,       // ₹1.20 Cr
  runRate: 3941000,              // ₹39.41 L
  monthProjection: 3941000,      // ₹39.41 L
  pipelineByStage: [
    { label: 'New',         count: 1 },
    { label: 'In Progress', count: 3 },
    { label: 'PI Shared',   count: 2 },
    { label: 'Won',         count: 1 },
  ],
  pipelineByVertical: {
    inbound:  412000,   // ₹4.12 L
    outbound: 920000,   // ₹9.20 L
    kam:      677000,   // ₹6.77 L
  },
  clients: { active: 3, inactive: 1 },
  revenueBySource: [
    { source: 'Inbound',    value: 0 },
    { source: 'Outbound',   value: 890000 },
    { source: 'KAM Direct', value: 890000 },
  ],
};

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
