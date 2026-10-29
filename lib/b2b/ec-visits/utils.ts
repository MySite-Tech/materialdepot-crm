import type { EcVisit, EcVisitQuery, EcVisitRow } from './types';

const opt = (v: string | null | undefined) => (v == null || v === '' ? undefined : v);

export const rowToEcVisit = (r: EcVisitRow): EcVisit => ({
  id: r.id,
  clientId: opt(r.client_id),
  firm: r.firm,
  contactName: opt(r.contact_name),
  phone: opt(r.phone),
  branch: r.branch,
  visitDate: String(r.visit_date).slice(0, 10),
  visitTime: opt(r.visit_time),
  purpose: opt(r.purpose),
  status: r.status,
  bmName: opt(r.bm_name),
  outcome: opt(r.outcome),
  enqId: opt(r.enq_id),
  scheduledBy: r.scheduled_by,
  createdAt: opt(r.created_at),
  updatedAt: opt(r.updated_at),
  updatedBy: opt(r.updated_by),
});

export const ecVisitToRow = (v: EcVisit): Omit<EcVisitRow, 'scheduled_by' | 'created_at' | 'updated_at' | 'updated_by'> => ({
  id: v.id,
  client_id: v.clientId ?? null,
  firm: v.firm,
  contact_name: v.contactName ?? null,
  phone: v.phone ?? null,
  branch: v.branch,
  visit_date: v.visitDate,
  visit_time: v.visitTime ?? null,
  purpose: v.purpose ?? null,
  status: v.status,
  bm_name: v.bmName ?? null,
  outcome: v.outcome ?? null,
  enq_id: v.enqId ?? null,
});

export function ecVisitQueryString(q: EcVisitQuery): string {
  const p = new URLSearchParams();
  if (q.clientId) p.set('client_id', q.clientId);
  if (q.from) p.set('from', q.from);
  if (q.to) p.set('to', q.to);
  const s = p.toString();
  return s ? `?${s}` : '';
}
