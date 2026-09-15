import { mdFetch } from '../core/client';

export interface EscalationRaisedBy {
  raised_by: string | null;
  raised_at?: string | null;
  reason?: string[] | null;
}

export interface RaiseEscalationStatus {
  request_id: number;
  status: 'pending' | 'retrying' | 'success' | 'failed';
  deal_id: string;
  escalation_deal_id: string | null;
  reason: string[];
  error: string | null;
  requested_at?: string;
}

export async function raiseEscalationDirect(
  dealId: number | string,
  reasons: string[],
  requestType?: string,
): Promise<{ request_id: number }> {
  return mdFetch('/crm/escalation/raise/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deal_id: String(dealId), reasons, request_type: requestType }),
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
