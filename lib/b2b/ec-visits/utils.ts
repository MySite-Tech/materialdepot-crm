import type { EcVisit, EcVisitQuery, EcVisitRow } from './types';

const opt = (v: string | null | undefined) => (v == null || v === '' ? undefined : v);

export const rowToEcVisit = (r: EcVisitRow): EcVisit => ({
  id: r.id,
  clientId: opt(r.client_id),
  firm: r.firm,
  contactName: opt(r.contact_name),
  phone: opt(r.phone),
  branch: r.branch,
  kind: r.kind || 'visit',
  sourceTeam: r.source_team ?? undefined,
  leadRef: opt(r.lead_ref),
  phones: Array.isArray(r.phones) ? r.phones : [],
  note: opt(r.note),
  assisted: r.assisted ?? undefined,
  visitDate: r.visit_date ? String(r.visit_date).slice(0, 10) : undefined,
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
  kind: v.kind,
  source_team: v.sourceTeam ?? null,
  lead_ref: v.leadRef ?? null,
  phones: v.phones,
  note: v.note ?? null,
  assisted: v.assisted ?? null,
  visit_date: v.visitDate ?? null,
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
  if (q.kind) p.set('kind', q.kind);
  const s = p.toString();
  return s ? `?${s}` : '';
}
