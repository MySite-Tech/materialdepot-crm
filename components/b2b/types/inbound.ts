import { CLIENT_TYPES, LEAD_TYPES, PRIORITIES, SEGMENTS, SELECTIONS } from '../constants/inbound';
export type FieldOwner =
  | 'kylas'
                   // would be overwritten by the next sync.
  | 'kylas-write'
  | 'crm'
  | 'deals'
  | 'derived';

export type InboundStatus =
  | 'New' | 'Connected - Need nurturing' | 'Follow up' | 'PI Shared' | 'Closed' | 'Lost' | 'Invalid';

export type LegacyStage =
  | 'New' | 'Hyderabad' | 'RNR' | 'Followup Required' | 'Quote'
  | 'PI Shared' | 'Closed' | 'Lost' | 'Enquiry Invalid';

export interface LegacyDecomposition {
  status: InboundStatus;
  location?: InboundLocation;
  lostReason?: string;

  rnr?: boolean;
}

export type InboundLocation = 'Bangalore' | 'Hyderabad';

export type Segment = typeof SEGMENTS[number];

export type ClientType = typeof CLIENT_TYPES[number];

export type LeadType = typeof LEAD_TYPES[number];

export type Priority = typeof PRIORITIES[number];

export type Selection = typeof SELECTIONS[number];

export type CallAttemptOutcome = 'Connected' | 'RNR';

export interface CallAttempt {
  n: number;
  outcome: CallAttemptOutcome;
  at: string;
  by?: string;
  byPhone?: string;
  note?: string;
  durationMin?: number;
  followUpDate?: string;
}

export interface ContactPerson {
  name: string;
  role?: string;
  phone: string;
}

export type ClosureReason = 'unreachable' | 'stalled';

export interface ClosureReadiness {
  ready: boolean;
  reason?: ClosureReason;
  rnrInWindow: number;
  ageDays: number;
}

export interface PlacedUnder {
  bmName?: string;
  spok?: string;
  ecName?: string;
  ecBmName?: string;
}

export interface StatusGateInput {
  status: InboundStatus;
  followUpDate?: string;
  enqId?: string;
  lostReason?: string;
  invalidReason?: string;
  invalidNote?: string;
  calls?: number;
  connected?: boolean;
  readiness?: ClosureReadiness;
}

export interface OutreachReferral {
  at: string;
  by: string;
  decisionMaker: string;
  project?: string;
  meetingDate: string;
  meetingTime?: string;
  meetingLocation?: string;
  summary?: string;
  note?: string;
}

export interface EnrichmentInput {
  companyName?: string;
  primaryContactName?: string;
  primaryContactPhone?: string;
  gstNumber?: string;
  segment?: string;
  clientType?: string;
  leadType?: string;
  priority?: string;
  selections?: string[];
  expectedOrderValue?: number;
  location?: string;
}

export interface EnrichmentGap { key: keyof EnrichmentInput; label: string }

export type FollowUpBucket = 'overdue' | 'today' | 'upcoming' | 'none';
