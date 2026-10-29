import {
  INBOUND_STATUSES, INBOUND_STATUS_COLORS,
  type InboundStatus, type InboundLocation, type Segment, type ClientType,
  type LeadType, type Priority, type Selection, type CallAttempt, type PlacedUnder, type OutreachReferral, type ContactPerson,
} from './inbound';
import {
  type OutreachStatus, type OutreachMeeting, type MeetingStatus, type CompanyType,
  type OutreachSource, type TeamSize, type OutreachContact, type OutreachIntake, type OutreachHandover, type JourneyEvent,
} from './outreach';
import type { RequirementVersion } from './requirement';

type AccountType = 'Interior Designer' | 'Architect' | 'Builder' | 'Modular Factory' | 'OSR' | 'Contractor' | 'Retailer';

export type InboundStage = InboundStatus;
export const INBOUND_STAGES: InboundStatus[] = INBOUND_STATUSES;

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
  primaryContactName?: string;
  primaryContactPhone?: string;
  additionalContacts?: ContactPerson[];
  gstNumber?: string;
  segment?: Segment;
  clientType?: ClientType;
  leadType?: LeadType;
  priority?: Priority;
  location?: InboundLocation;
  callAttempts?: CallAttempt[];

  selections?: Selection[];
  requirement?: string;
  requirementHistory?: RequirementVersion[];
  expectedOrderValue?: number;

  stage: InboundStatus;

  statusChangedAt?: string;
  followUpDate?: string;
  followUpTime?: string;
  enqId?: string;
  orderValue?: number;
  orderValueSource?: 'deal' | 'manual';
  lostReason?: string;
  invalidReason?: string;
  invalidNote?: string;
  piSharedAt?: string;

  officeLocation?: string;
  outreachReferral?: OutreachReferral;

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
  requirementHistory?: RequirementVersion[];

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

  bmPhone?: string;
  altPhone?: string;
  altName?: string;
  altRole?: string;
  contacts?: OutreachContact[];
  source?: OutreachSource;
  email?: string;
  city?: string;
  officeAddress?: string;
  teamSize?: TeamSize;
  whatsappGroupLink?: string;
  convertedAt?: string;
  newOnboarding?: boolean;
  intake?: OutreachIntake;
  handover?: OutreachHandover;
  journey?: JourneyEvent[];

  value: number;
}

export {
  B2B_ROSTER, B2B_ADMINS, ASSIGNABLE_REPS, KAMS, B2B_REPS,
  DEFAULT_ASSIGNEE, DEFAULT_KAM, B2B_VERTICALS, REP_ROLE_COLORS,
} from './roster';
export type { RepRole, B2BRep } from './roster';

export const INBOUND_STAGE_COLORS: Record<InboundStatus, string> = INBOUND_STATUS_COLORS;

export const fmtL = (n: number): string => {
  if (n >= 1_00_00_000) return '₹' + (n / 1_00_00_000).toFixed(2) + ' Cr';
  return '₹' + (n / 1_00_000).toFixed(2) + ' L';
};

export const fmtINR = (n: number): string => '₹' + Number(n || 0).toLocaleString('en-IN');

export const fmtShortINR = (n: number): string => {
  const v = Number(n) || 0;
  if (v >= 1_00_00_000) return '₹' + (v / 1_00_00_000).toFixed(2) + ' Cr';
  if (v >= 1_00_000) return '₹' + (v / 1_00_000).toFixed(2) + ' L';
  if (v >= 1_000) return '₹' + (v / 1_000).toFixed(1) + 'K';
  return '₹' + Math.round(v);
};
