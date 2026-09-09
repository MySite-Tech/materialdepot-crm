import { Selection } from '@/components/b2b/models/inbound';
import { CRMLeadRow } from '../api/crm/leads';
export interface KylasIdentity {

  phone: string;

  contactName: string;

  displayName: string;
}

export interface B2BInboundPage {
  leads: import('../../components/b2b/models/mock-data').InboundLead[];
  page: number;
  hasMore: boolean;
  total: number;
}

export interface ClientTicketResult {
  phone: string;
  state: 'ok' | 'failed';
  rows: CRMLeadRow[];

  rejected: number;
  error?: string;
}

export type CallOutcome = 'connected' | 'busy' | 'rejected' | 'no_answer' | 'missed_call';

export interface InboundLeadEdit {
  requirement?: string;

  selections?: string[];
}

export interface KylasWriteResult {
  ok: boolean;
  error?: string;

  dropped?: string[];
}

export interface InboundLeadDetail extends InboundLeadEdit {

  selections?: Selection[];

  kylasName?: string;

  contactName?: string;
  leadSummary?: string;
  urgency?: string;
  pincode?: string;
  presalesOwner?: string;
  presalesClientType?: string;
  presalesMissedCalls?: number;
  qualificationTag?: string;
  leadCreatedAt?: string;
  phoneId?: number;
  phone?: string;

  loaded: boolean;
}
