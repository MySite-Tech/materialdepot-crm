import { Escalation } from '../models/account-health';
import { Segment } from '../models/inbound';
import type { MeetingCheckIn } from '../models/outreach';
import { CLIENT_ENTITY_TYPES, CLIENT_SOURCES, INTERACTION_TYPES, TEMPERATURE_BANDS } from '../constants/client';
export type ClientEntityType = typeof CLIENT_ENTITY_TYPES[number];

export type ClientSource = typeof CLIENT_SOURCES[number];

export interface ClientContact {

  number: string;
  name?: string;

  label?: string;
  primary?: boolean;
}

export type StudioAccess = 'power' | 'non-power';

export interface StudioLogin {
  phone: string;
  firmName?: string;
  role: string;
  visibleTabs: string[] | null;
  power: boolean;
}

export type StudioLogins = Record<string, StudioLogin>;

export interface FirmStudioState {
  numbers: number;
  onboarded: number;
  power: number;
  unclassified: number;
}

type GstCheck = 'valid' | 'bad-format' | 'bad-checksum' | 'unknown-state' | 'empty';

export interface ClientGst {

  number: string;

  registeredName?: string;

  validatedAt?: string;
}

export interface GstValidation {
  check: GstCheck;
  normalized: string;
  stateCode?: string;
  stateName?: string;

  pan?: string;
  message?: string;

  storable: boolean;
}

export interface ClientMergeRecord {

  id: string;
  company: string;
  mergedAt: string;
  mergedBy?: string;
}

export type FirmHandoverStatus = 'Pending' | 'Accepted' | 'Rejected';

export interface KamAssignment {
  kam: string;
  kamPhone?: string;

  at: string;
  by?: string;
  how?: 'manual' | 'round-robin';
  status?: FirmHandoverStatus;
  respondedAt?: string;
  respondedBy?: string;
  rejectReason?: string;
  reason?: string;
}

export interface ClientEntity {
  id: string;

  company: string;
  contacts: ClientContact[];
  gsts: ClientGst[];
  segment?: Segment;
  clientType?: ClientEntityType;

  clientTypeRaw?: string;
  source: ClientSource;

  kam?: string;

  assignments?: KamAssignment[];
  remarks?: string;

  interactions?: ClientInteraction[];

  escalations?: Escalation[];
  mergedFrom?: ClientMergeRecord[];
  createdAt?: string;
  updatedAt?: string;
}

export type InteractionType = typeof INTERACTION_TYPES[number];

export interface ClientInteraction {
  id: string;
  type: InteractionType;

  date: string;
  summary?: string;

  temperature?: number;
  upcomingProject?: string;

  nextFollowUpDate?: string;
  loggedBy?: string;
  checkIn?: MeetingCheckIn;

  createdAt?: string;
}

export type TemperatureBand = typeof TEMPERATURE_BANDS[number]['key'];

export interface ClientOrderMetrics {

  orders?: number;
  totalRevenue?: number;

  averageOrderValue?: number;

  enquiries?: number;
  openValue?: number;

  lastOrderPlaced?: string;

  dateState: 'ok' | 'pending' | 'unavailable' | 'no-phone' | 'no-orders';
}

export type ClientStatus = 'Active' | 'Inactive 1 month' | 'Inactive' | 'Never ordered' | 'Unknown';

export interface StatusScale {
  colors: Record<string, string>;
  hint: Record<string, string>;
}

export type DuplicateEvidence = 'contact' | 'gst' | 'pan' | 'name';

export interface DuplicateSuggestion {
  a: ClientEntity;
  b: ClientEntity;
  evidence: DuplicateEvidence[];

  shared: string[];
}

export type MergeField = 'company' | 'segment' | 'clientType' | 'kam' | 'source';

export interface MergeConflict {
  field: MergeField;

  options: { value: string; from: string[] }[];
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

  absorbed: ClientEntity[];
}
