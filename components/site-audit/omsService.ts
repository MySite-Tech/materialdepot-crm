/* Telling OMS that a service leg was performed.

   A site audit / installation line is a SERVICE OperationStage in OMS, and it stays HELD until
   someone confirms the work happened — that confirmation is what raises its invoice in Zoho (a
   service has no dispatch, so it is the billing trigger). Marking the job complete here is that
   moment, so the completion writes fire this too.

   Orders that predate the OMS cutover carry a legacy PO number and have no leg to confirm; those
   are skipped, not failed. Failures are queued in localStorage and retried on the next app load,
   the same recovery shape the audit app already uses for its own pending completions — an
   unnoticed failure would mean an unbilled order. */

import { getToken } from '@/lib/mockApi';

const QUEUE_PREFIX = 'md_oms_svc_';

// "SO417-S2562" → stage 2562 (the synthetic po_number the backend hands out for an OMS service leg).
const STAGE_REF = /^SO(\d+)-S(\d+)$/;

/* The PO string to store for an imported OMS job: the allotment number the ops team recognises
   (MD8…, what the row displays) plus the leg ref built from the same row's `sales_order_id` /
   `stage_id`. Both live in one comma-separated field because that is what the CRM already persists —
   `confirmServicePerformed` picks whichever token identifies the leg, so no second column and no new
   endpoint are needed. A legacy PO row has no stage and contributes only its own number. */
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

/* Confirm the leg behind this order's PO numbers. Never throws and never blocks the caller: the job
   IS complete in the CRM whatever OMS says, so a failure queues for retry instead of failing the
   completion the installer just signed off. Returns true when OMS has it (or there was nothing to
   send). */
export async function confirmServicePerformed(
  po: string[] | string | null | undefined,
  notes = '',
): Promise<boolean> {
  const stageId = stageIdFrom(po);
  if (!stageId) return true;   // legacy PO or manually added order — no OMS leg
  try {
    if (await post(stageId, notes)) return true;
  } catch { /* fall through to the queue */ }
  try {
    localStorage.setItem(QUEUE_PREFIX + stageId, JSON.stringify({ stageId, notes }));
  } catch {}
  return false;
}

/* Drain whatever failed earlier. Safe to call on every app load — the backend is idempotent, so a
   double confirmation records nothing new and cannot double-bill. */
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
