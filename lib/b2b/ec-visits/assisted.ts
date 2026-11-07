import { dealIsOrder } from '@/components/b2b/models/client';
import { fetchClientTickets } from '@/lib/api';
import { apptBranchesFromCrm } from '@/lib/appointments/appt-shared';
import type { EcAssisted, EcTicket, EcVisit } from './types';

export async function fetchEcTickets(v: EcVisit): Promise<EcTicket[]> {
  const results = await Promise.all(v.phones.map(fetchClientTickets));
  const failed = results.find((r) => r.state === 'failed');
  if (failed) throw new Error(`orders for ${failed.phone} did not load${failed.error ? `: ${failed.error}` : ''}`);
  const since = String(v.createdAt || '').slice(0, 10);
  const sent = String(v.enqId || '').toUpperCase();
  const seen = new Set<string>();
  return results.flatMap((r) => r.rows)
    .filter((t) => {
      const id = String(t.id || '');
      if (!id || seen.has(id)) return false;
      seen.add(id);
      if (sent && id.toUpperCase() === sent) return apptBranchesFromCrm([t.bookedBranch || t.branch])[0] === v.branch;
      return apptBranchesFromCrm([t.branch])[0] === v.branch && String(t.createdAt || '').slice(0, 10) >= since;
    })
    .map((t) => ({
      id: String(t.id),
      status: String(t.status || ''),
      value: Number(t.cartValue) || 0,
      createdAt: String(t.createdAt || ''),
      ordered: dealIsOrder(t.status),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function checkAssisted(v: EcVisit): Promise<EcAssisted> {
  const tickets = await fetchEcTickets(v);
  const orders = tickets.filter((t) => t.ordered);
  return {
    value: orders.reduce((a, t) => a + t.value, 0),
    orders: orders.length,
    enqIds: orders.map((t) => t.id),
    carts: tickets.length,
    checkedAt: new Date().toISOString(),
  };
}
