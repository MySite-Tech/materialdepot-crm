import { ClientEntity, ClientInteraction, ClientOrderMetrics, ClientSource, InteractionType, TemperatureBand, clientStatus } from '../models/clientModel';
import { FollowUpBucket, Segment } from '../models/inboundModel';
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

  estimatedValue?: number;
  status: KamOrderStatus;

  legacyStage?: string;

  statusChangedAt?: string;

  enqId?: string;

  orderValue?: number;
  orderValueSource?: 'deal' | 'manual';

  dealStatus?: string;

  expectedClosure?: string;

  lostReason?: string;
  kam: string;

  source: ClientSource;
  notes?: { ts: string; author: string; text: string }[];

  legacyEscalations?: import('../models/accountHealth').Escalation[];
  createdAt?: string;

  value: number;
}

export interface KamOrderGateInput {
  status: KamOrderStatus;
  enqId?: string;
  lostReason?: string;
  company?: string;
}

export interface InteractionGateInput {
  type: InteractionType;
  date?: string;
  nextFollowUpDate?: string;
}

export interface CallCompliance {
  kam: string;
  logged: number;
  target: number;
  overdueFollowUps: number;
  dueToday: number;
}

export interface CadenceRow {
  client: ClientEntity;
  date: string;

  agedDays: number;
  from: ClientInteraction;
}

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

  previousTemperature?: number;
  upcomingProject?: string;
  nextFollowUpDate?: string;
  followUp: FollowUpBucket;
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

export type KamView = 'clients' | 'today' | 'queue' | 'orders' | 'dashboard';
