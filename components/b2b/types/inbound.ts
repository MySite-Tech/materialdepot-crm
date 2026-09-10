import { CLIENT_TYPES, LEAD_TYPES, PRIORITIES, SEGMENTS, SELECTIONS } from '../constants/inbound';
export type FieldOwner =
  | 'kylas'
                   // would be overwritten by the next sync.
  | 'kylas-write'
  | 'crm'
  | 'deals'
  | 'derived';

export type InboundStatus = 'New' | 'Follow up' | 'PI Shared' | 'Closed' | 'Lost';

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
  note?: string;
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
}

export interface EnrichmentInput {
  companyName?: string;
  gstNumber?: string;
  segment?: string;
  clientType?: string;
  leadType?: string;
  priority?: string;
  selections?: string[];
  expectedOrderValue?: number;
}

export interface EnrichmentGap { key: keyof EnrichmentInput; label: string }

export type FollowUpBucket = 'overdue' | 'today' | 'upcoming' | 'none';
