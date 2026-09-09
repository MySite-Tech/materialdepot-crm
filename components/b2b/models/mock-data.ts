import {
  INBOUND_STATUSES, INBOUND_STATUS_COLORS,
  type InboundStatus, type InboundLocation, type Segment, type ClientType,
  type LeadType, type Priority, type Selection, type CallAttempt, type PlacedUnder,
} from './inbound';
import {
  type OutreachStatus, type OutreachMeeting, type MeetingStatus, type CompanyType,
} from './outreach';

type AccountType = 'Interior Designer' | 'Architect' | 'Builder' | 'Modular Factory' | 'OSR' | 'Contractor' | 'Retailer';

export type InboundStage = InboundStatus;
export const INBOUND_STAGES: InboundStatus[] = INBOUND_STATUSES;
export type { InboundStatus };

export const NEW_KYLAS_STAGES: { id: number; label: string }[] = [
  { id: 220515, label: 'B2B Qualified' },
  { id: 220290, label: 'Won' },
];

type CallOutcome = 'Connected' | 'RNR' | null;
interface CallStep {
  label: string;
  outcome: CallOutcome;
  ts?: string;
  overdueHours?: number;
}

export interface LeadNote { ts: string; author: string; text: string }

export interface CallLogEntry {
  id: string;
  ts: string;
  direction: string;
  status: string;
  durationSec?: number;
  by?: string;
  note?: string;
}

export interface LeadDeal {
  id: string;
  ticketId?: number;
  status: string;
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

  phone: string;
  contactName: string;
  owner: string;
  ownerId?: number;
  leadCreatedAt?: string;
  qualificationTag?: string;
  presalesOwner?: string;
  leadSummary?: string;
  urgency?: string;
  pincode?: string;
  presalesClientType?: string;
  presalesMissedCalls?: number;
  kylasStage?: number;
  source: 'Website form' | 'WhatsApp' | 'Referral' | 'Walk-in' | 'Google' | 'Other';

  companyName?: string;
  gstNumber?: string;
  segment?: Segment;
  clientType?: ClientType;
  leadType?: LeadType;
  priority?: Priority;
  location?: InboundLocation;
  callAttempts?: CallAttempt[];

  selections?: Selection[];
  requirement?: string;
  expectedOrderValue?: number;

  stage: InboundStatus;

  statusChangedAt?: string;
  followUpDate?: string;
  followUpTime?: string;
  enqId?: string;
  orderValue?: number;
  orderValueSource?: 'deal' | 'manual';
  lostReason?: string;

  placedUnder?: PlacedUnder;
  kam?: string;

  company: string;

  value: number;
  calls?: CallStep[];
  notes?: LeadNote[];

  accountType?: AccountType;
  city?: string;
  timeline?: string;
  requirementBrief?: string;
  categories?: string[];
  piStatus?: string;
  followUpNote?: string;
  overdueHours?: number;

  expectedClosure?: string;
}
export type { OutreachStatus, OutreachMeeting, MeetingStatus, CompanyType };

export interface OutreachLead {
  id: string;

  company: string;
  contactPerson: string;
  designation?: string;
  phone?: string;
  gstNumber?: string;
  segment?: Segment;
  leadType?: LeadType;
  companyType?: CompanyType;
  companyTypeOther?: string;
  bm: string;
  createdAt?: string;

  meetings?: OutreachMeeting[];

  selections?: Selection[];
  requirement?: string;

  expectedOrderValue?: number;

  status: OutreachStatus;

  statusChangedAt?: string;
  followUpDate?: string;
  followUpTime?: string;
  quoteSharedAt?: string;
  enqId?: string;

  orderValue?: number;
  orderValueSource?: 'deal' | 'manual';
  dealStatus?: string;
  expectedClosure?: string;
  lostReason?: string;

  kam?: string;
  spok?: string;
  ecName?: string;
  ecBmName?: string;

  notes?: LeadNote[];

  value: number;
}

export const KAMS = ['Krishna Bhagavatula', 'Tharun', 'Jadhav', 'Sidhant', 'Hardi', 'Mandeep', 'Vilok', 'Praful'];

export const B2B_ADMINS = ['Krishna Bhagavatula'];

export const INBOUND_STAGE_COLORS: Record<InboundStatus, string> = INBOUND_STATUS_COLORS;

export const B2B_REPS = ['Krishna Bhagavatula', 'Tharun', 'Jadhav', 'Sidhant', 'Hardi', 'Mandeep', 'Vilok', 'Praful'];

export type RepRole = 'KAM' | 'Inbound' | 'Outbound';

interface RepTargetConfig {
  rep: string;
  role: RepRole;
  revenueTargetL: number;
  clientsTarget: number;
  onboardingsTarget: number;
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

const B2B_MONTHLY_TARGET_L = 120;

export interface TargetStore {
  monthlyTargetL: number;
  reps: Record<string, { revenueTargetL: number; clientsTarget: number; onboardingsTarget: number }>;
}

export function defaultTargetStore(): TargetStore {
  return {
    monthlyTargetL: B2B_MONTHLY_TARGET_L,
    reps: Object.fromEntries(REP_TARGETS.map((r) => [r.rep, {
      revenueTargetL: r.revenueTargetL, clientsTarget: r.clientsTarget, onboardingsTarget: r.onboardingsTarget,
    }])),
  };
}

export const fmtL = (n: number): string => {
  if (n >= 1_00_00_000) return '₹' + (n / 1_00_00_000).toFixed(2) + ' Cr';
  return '₹' + (n / 1_00_000).toFixed(2) + ' L';
};

export const fmtINR = (n: number): string => '₹' + Number(n || 0).toLocaleString('en-IN');
