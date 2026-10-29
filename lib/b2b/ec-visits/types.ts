export type EcVisitStatus = 'Scheduled' | 'Visited' | 'Cancelled' | 'No show';

export interface EcVisit {
  id: string;
  clientId?: string;
  firm: string;
  contactName?: string;
  phone?: string;
  branch: string;
  visitDate: string;
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
  visit_date: string;
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
}
