import { ClientEntity, ClientInteraction, ClientOrderMetrics, ClientSource, ClientStatus, FollowUpFor, InteractionType, TemperatureBand, TicketFollowUp } from '../models/client';
import type { OpenDeal } from '@/lib/b2b/inbound-deals/types';
import { FollowUpBucket, Segment } from '../models/inbound';
import type { RequirementVersion } from '../models/requirement';
export type KamOrderStatus =
  | 'Requirement Logged' | 'Quote Shared' | 'PI Shared' | 'Closed' | 'Lost';

export type LegacyKamStage =
  | 'No Active Enquiry' | 'Quote Approval Pending' | 'Awaiting Payment' | 'Order Placed';

export interface KamOrder {
  id: string;

  clientId?: string;
  company: string;
  contactName?: string;
  phone?: string;

  requirement?: string;
  requirementHistory?: RequirementVersion[];

  estimatedValue?: number;
  status: KamOrderStatus;

  legacyStage?: string;

  statusChangedAt?: string;

  enqId?: string;

  orderValue?: number;
  orderValueSource?: 'deal' | 'manual';

  dealStatus?: string;

  expectedClosure?: string;
  followUpDate?: string;
  followUpTime?: string;

  lostReason?: string;
  kam: string;

  source: ClientSource;
  notes?: { ts: string; author: string; text: string }[];

  legacyEscalations?: import('../models/account-health').Escalation[];
  createdAt?: string;

  value: number;
}

export interface InteractionGateInput {
  type: InteractionType;
  date?: string;
  nextFollowUpDate?: string;
  summary?: string;
  checkIn?: unknown;
}

export interface CallCompliance {
  kam: string;
  logged: number;
  target: number;
  overdueFollowUps: number;
  dueToday: number;
}

export interface AssignedClientRow {
  client: ClientEntity;
  company: string;
  source: ClientSource;
  contactPerson: string;
  contactNumber: string;
  metrics: ClientOrderMetrics;
  status: ClientStatus;
  segment?: Segment;
  temperature?: number;
  temperatureAt?: string;
  temperatureBand?: TemperatureBand;

  previousTemperature?: number;
  upcomingProject?: string;
  nextFollowUpDate?: string;
  nextFollowUpTime?: string;
  followUpFor: FollowUpFor;
  followUp: FollowUpBucket;
  gaps: { key: string; label: string }[];
  tickets: OpenDeal[];
  lastInteraction?: ClientInteraction;
  daysSinceContact?: number;
}

export interface TemperatureMismatch {
  kind: 'hot-but-cold' | 'hot-but-silent' | 'cold-but-buying';
  message: string;
}

export interface KamPipelineSplit {

  pipeline: number;

  estimatedPipeline: number;
  count: number;
}

export interface KamFunnel {
  steps: { label: string; count: number; value: number }[];
  untimed: number;
  winRate?: number;
  averageCycleDays?: number;
}

export interface CohortMonth {

  month: string;
  inbound: number;
  outreach: number;
  existing: number;
  total: number;
}

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

export interface NewVsRepeat {
  newRevenue: number;
  repeatRevenue: number;
  newOrders: number;
  repeatOrders: number;

  unknownClients: number;
}


export type KamDealLens = 'deals' | 'cartOpen' | 'piOpen' | 'cartFollow' | 'piFollow';

export type KamFirmLens =
  | 'signoff' | 'assigned' | 'work' | 'overdue' | 'due' | 'meetings' | 'nofollow' | 'called' | 'upcoming'
  | 'active' | 'lapsing' | 'inactive' | 'never' | 'details';

export type KamReferralLens = 'referred' | 'refNone' | 'refCart' | 'refOrdered';

export type KamLens = KamFirmLens | KamDealLens | KamReferralLens;

export interface KamTicketRow {
  key: string;
  firm: AssignedClientRow;
  deal: OpenDeal;
  followUp?: TicketFollowUp;
  touched: boolean;
  due: FollowUpBucket;
}

export type ReferralStage = 'none' | 'cart' | 'ordered' | 'unknown';

export interface KamReferralRow {
  key: string;
  name: string;
  phone: string;
  note?: string;
  referredOn?: string;
  via: 'crm' | 'studio';
  addedBy?: string;
  firm: AssignedClientRow;
  stage: ReferralStage;
  orders: number;
  enquiries: number;
  lastOrder?: string;
  open: OpenDeal[];
}

export interface KamLensGroup {
  title: string;
  head?: KamLens;
  lenses: KamLens[];
  row: 1 | 2;
}

export interface KamLensMeta {
  title: string;
  rule: string;
  empty: string;
  accent: string;
}
