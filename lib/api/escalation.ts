import { mdFetch } from './client';

// ---------------------------------------------------------------------------
// Escalation
// ---------------------------------------------------------------------------

export interface EscalationRaisedBy {
  raised_by: string | null;
  raised_at?: string | null;
  reason?: string[] | null;
}

export async function getEscalationRaisedBy(dealId: number | string): Promise<EscalationRaisedBy | null> {
  try {
    return await mdFetch(`/escalation-raised-by/?deal_id=${encodeURIComponent(String(dealId))}`);
  } catch {
    return null;
  }
}
