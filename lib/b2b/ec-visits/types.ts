import type { B2BTeam } from '../team/types';

export type EcVisitStatus = 'Scheduled' | 'Directed' | 'Visited' | 'Cancelled' | 'No show';

export type EcVisitKind = 'visit' | 'redirect';

export interface EcAssisted {
  value: number;
  orders: number;
  enqIds: string[];
  checkedAt: string;
}

export interface EcVisit {
  id: string;
  clientId?: string;
  firm: string;
  contactName?: string;
  phone?: string;
  branch: string;
  kind: EcVisitKind;
  sourceTeam?: B2BTeam;
  leadRef?: string;
  phones: string[];
  note?: string;
  assisted?: EcAssisted;
  visitDate?: string;
  visitTime?: string;
  purpose?: string;
  status: EcVisitStatus;
  bmName?: string;
  outcome?: string;
  enqId?: string;
  scheduledBy?: string;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface EcVisitRow {
  id: string;
  client_id: string | null;
  firm: string;
  contact_name: string | null;
  phone: string | null;
  branch: string;
  kind: EcVisitKind;
  source_team: B2BTeam | null;
  lead_ref: string | null;
  phones: string[];
  note: string | null;
  assisted: EcAssisted | null;
  visit_date: string | null;
  visit_time: string | null;
  purpose: string | null;
  status: EcVisitStatus;
  bm_name: string | null;
  outcome: string | null;
  enq_id: string | null;
  scheduled_by: string;
  created_at: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

export interface EcVisitQuery {
  clientId?: string;
  from?: string;
  to?: string;
  kind?: EcVisitKind;
}
