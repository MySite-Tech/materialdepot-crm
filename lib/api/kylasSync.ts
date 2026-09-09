import { kylasFetch } from './kylasClient';
import { API_BASE_URL, getToken } from './client';

export interface SyncEstimateResult {
  success: boolean;
  mode?: string;
  estimate_id?: number;
  lead_id?: string;
  estimate_status?: string;
  deal_id?: number | string;
  message?: string;
  queued?: boolean;
  error?: string;
}

export interface KylasDealInfo {
  id: number;
  name: string;
  ownerName: string | null;
  stageName: string | null;
  pipelineName: string | null;
}

function detectInputType(value: string): { lead_id?: string; estimate_id?: number; user_id?: string; cart_number?: string } {
  const trimmed = value.trim();

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return { user_id: trimmed };
  }
  if (/^CT/i.test(trimmed)) {
    return { cart_number: trimmed };
  }

  if (/^\d+$/.test(trimmed)) {
    return { estimate_id: parseInt(trimmed, 10) };
  }

  return { lead_id: trimmed };
}

export async function syncEstimate(value: string): Promise<SyncEstimateResult> {
  const payload = detectInputType(value);
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE_URL}/kylas/sync-estimate/`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    const msg =
      data?.error || data?.message || data?.detail || `API error: ${res.status}`;
    return { success: false, error: msg };
  }
  return data ?? { success: false, error: `API error: ${res.status}` };
}

export async function fetchKylasDealInfo(dealId: number | string): Promise<KylasDealInfo | null> {
  try {
    const data = await kylasFetch(`/deals/${dealId}`);
    return {
      id: Number(dealId),
      name: data.name ?? `Deal #${dealId}`,
      ownerName: data.ownedBy?.name ?? null,
      stageName: data.pipelineStage?.name ?? null,
      pipelineName: data.pipeline?.name ?? null,
    };
  } catch {
    return null;
  }
}

