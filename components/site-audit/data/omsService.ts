import { getToken } from '@/lib/mockApi';

const QUEUE_PREFIX = 'md_oms_svc_';

const STAGE_REF = /^SO(\d+)-S(\d+)$/;

export function poFieldFor(r: any): string {
  const ref = r && r.stage_id && r.sales_order_id ? `SO${r.sales_order_id}-S${r.stage_id}` : '';
  return [r && r.po_number, ref].filter(Boolean).join(', ');
}

export function stageIdFrom(po: string[] | string | null | undefined): number | null {
  const candidates = Array.isArray(po) ? po : typeof po === 'string' ? po.split(',') : [];
  for (const raw of candidates) {
    const m = STAGE_REF.exec(String(raw).trim());
    if (m) return Number(m[2]);
  }
  return null;
}

async function post(stageId: number, notes: string): Promise<boolean> {
  const token = getToken();
  const res = await fetch('/api/site-audit/service-performed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify({ stage_id: stageId, notes }),
  });
  const data = await res.json().catch(() => null);
  return !!(res.ok && data && data.ok);
}

export async function confirmServiceStage(stageId: number, notes = ''): Promise<boolean> {
  try {
    if (await post(stageId, notes)) return true;
  } catch { /* fall through to the queue */ }
  try {
    localStorage.setItem(QUEUE_PREFIX + stageId, JSON.stringify({ stageId, notes }));
  } catch {}
  return false;
}

export async function confirmServicePerformed(
  po: string[] | string | null | undefined,
  notes = '',
): Promise<boolean> {
  if (po == null) {
    console.warn('[site-audit] no PO on the order — cannot confirm its OMS service leg');
    return false;
  }
  const stageId = stageIdFrom(po);
  if (!stageId) return true;
  return confirmServiceStage(stageId, notes);
}

export async function retryQueuedServiceConfirms(): Promise<void> {
  let keys: string[] = [];
  try {
    keys = Object.keys(localStorage).filter((k) => k.startsWith(QUEUE_PREFIX));
  } catch { return; }
  for (const k of keys) {
    try {
      const d = JSON.parse(localStorage.getItem(k) || 'null');
      if (d && d.stageId && (await post(Number(d.stageId), String(d.notes || '')))) {
        localStorage.removeItem(k);
      }
    } catch { /* leave it queued for the next load */ }
  }
}
