import { mdFetch } from '../core/client';
import { Deal } from '@/lib/types';

export interface EscalationRaisedBy {
  raised_by: string | null;
  raised_at?: string | null;
  reason?: string[] | null;
}

export type RaiseStepState = 'pending' | 'running' | 'retrying' | 'done' | 'failed';

export interface RaiseEscalationStatus {
  request_id: number;
  status: 'pending' | 'retrying' | 'success' | 'failed';
  deal_id: string | null;
  steps?: { deal: RaiseStepState; ticket: RaiseStepState };
  escalation_deal_id: string | null;
  reason: string[];
  error: string | null;
  requested_at?: string;
}

export async function raiseEscalationDirect(
  dealId: number | string | null,
  reasons: string[],
  requestType?: string,
  notes?: string,
  leadId?: string,
): Promise<{ request_id: number }> {
  return mdFetch('/crm/escalation/raise/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deal_id: dealId ? String(dealId) : undefined, lead_id: leadId, reasons, request_type: requestType, notes: notes || undefined }),
  });
}

export async function retryRaiseEscalation(requestId: number): Promise<RaiseEscalationStatus> {
  return mdFetch('/crm/escalation/raise-retry/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request_id: requestId }),
  });
}

export async function getRaiseEscalationStatus(requestId: number): Promise<RaiseEscalationStatus> {
  // `_t` defeats mdFetch's 8s GET cache — a poll that reads a cached body can
  // never observe the transition it is polling for.
  return mdFetch(`/crm/escalation/raise-status/?request_id=${requestId}&_t=${Date.now()}`);
}

export async function getEscalationRaisedBy(dealId: number | string): Promise<EscalationRaisedBy | null> {
  try {
    return await mdFetch(`/escalation-raised-by/?deal_id=${encodeURIComponent(String(dealId))}`);
  } catch {
    return null;
  }
}

export interface OrderSearchTicket {
  id: number;
  name: string;
  stage: string;
  pipeline: string;
  rca: string;
  resolution: string;
  closed: boolean;
  updatedAt: string | null;
  reasonIds: number[];
}

export interface OrderSearchDeal extends Omit<Deal, 'id'> {
  id: number | null;
  leadId: string;
  estimateId: number;
}

export async function searchOrderDeals(q: string): Promise<{ content: OrderSearchDeal[]; tickets: OrderSearchTicket[] }> {
  return mdFetch(`/crm/escalation/order-search/?q=${encodeURIComponent(q)}`);
}
