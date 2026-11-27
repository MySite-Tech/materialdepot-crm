import { H, SB_URL, sbPatch } from '../shared';

const JOBCARD_KEYS = ['jobcard', 'jobcard_history'] as const;

async function storedSubjobs(id: string): Promise<any[]> {
  const r = await fetch(SB_URL + '/rest/v1/install_orders?id=eq.' + encodeURIComponent(id) + '&select=subjobs', { headers: H, cache: 'no-store' });
  if (!r.ok) throw new Error('Could not re-read this order (' + r.status + ')');
  const rows = await r.json();
  if (!Array.isArray(rows) || !rows[0]) throw new Error('Could not re-read this order');
  return Array.isArray(rows[0].subjobs) ? rows[0].subjobs : [];
}

function withStoredJobcards(next: any[], stored: any[]): any[] {
  const byId = new Map(stored.map((sj) => [sj && sj.id, sj]));
  return next.map((sj) => {
    const prev = sj && byId.get(sj.id);
    if (!prev) return sj;
    const out = { ...sj };
    for (const k of JOBCARD_KEYS) {
      if (k in prev) out[k] = prev[k];
      else delete out[k];
    }
    return out;
  });
}

export async function patchInstallOrder(id: string, patch: Record<string, any>): Promise<void> {
  if (!Array.isArray(patch.subjobs)) return sbPatch('install_orders', id, patch);
  const stored = await storedSubjobs(id);
  return sbPatch('install_orders', id, { ...patch, subjobs: withStoredJobcards(patch.subjobs, stored) });
}
