import { dealIsOrder } from '@/components/b2b/models/client';
import { fetchClientTickets } from '@/lib/api';
import { apptBranchesFromCrm } from '@/lib/appointments/appt-shared';
import type { EcAssisted, EcVisit } from './types';

export async function checkAssisted(v: EcVisit): Promise<EcAssisted> {
  const results = await Promise.all(v.phones.map(fetchClientTickets));
  const failed = results.find((r) => r.state === 'failed');
  if (failed) throw new Error(`orders for ${failed.phone} did not load${failed.error ? `: ${failed.error}` : ''}`);
  const since = String(v.createdAt || '').slice(0, 10);
  const seen = new Set<string>();
  const hits = results.flatMap((r) => r.rows).filter((t) => {
    const id = String(t.id || '');
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return dealIsOrder(t.status) && apptBranchesFromCrm([t.branch])[0] === v.branch && String(t.createdAt || '').slice(0, 10) >= since;
  });
  return {
    value: hits.reduce((a, t) => a + (Number(t.cartValue) || 0), 0),
    orders: hits.length,
    enqIds: hits.map((t) => String(t.id)),
    checkedAt: new Date().toISOString(),
  };
}
