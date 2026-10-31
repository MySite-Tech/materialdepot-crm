import { contactNumbers, normalizeContactNumber } from '../../utils/client';
import { ClientEntity, SpocLogEntry, SpocRole } from '../../../types/client';
import { dealIsOrder } from './deals';
import { sameRep } from '../../outreach/handover';

export interface InboundLink { id: string; owner?: string; createdAt?: string; phones: string[] }

export interface SpocLinkLead {
  id: string;
  phone?: string;
  altPhone?: string;
  bm?: string;
  createdAt?: string;
  intake?: { inboundLeadId?: string; inboundOwner?: string; assignedAt?: string; acceptedAt?: string; rejectedAt?: string };
}

export interface FirmLinks { inbound?: InboundLink; outreach?: SpocLinkLead }

export interface FirmSpoc {
  role: SpocRole;
  name?: string;
  since?: string;
  detail: string;
}

export interface SpocStage { role: Exclude<SpocRole, 'ec'>; name: string; from: string }

export interface SpocSalesRow extends SpocStage { to?: string; orders: number; value: number; perMonth: number }

export interface SpocSales {
  rows: SpocSalesRow[];
  before: { orders: number; value: number };
  undated: { orders: number; value: number };
  byEc: { name: string; orders: number; value: number }[];
}

interface SalesOrder { orderValue: number; status: string; createdAt?: string; spoc?: string }

const DAY_MS = 86_400_000;

const latestEntry = (client: ClientEntity, role: SpocLogEntry['role']): SpocLogEntry | undefined =>
  (client.spocLog || []).filter((e) => e.role === role).sort((a, b) => b.from.localeCompare(a.from))[0];

export function firmLinks(client: ClientEntity, inbound: InboundLink[], outreach: SpocLinkLead[]): FirmLinks {
  const phones = new Set(contactNumbers(client.contacts));
  const on = (p: string | undefined) => !!p && phones.has(normalizeContactNumber(p));
  const lead = outreach.filter((l) => !l.intake?.rejectedAt && (on(l.phone) || on(l.altPhone)))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
  const linked = lead?.intake?.inboundLeadId;
  const inboundRow = inbound.find((l) => l.id === linked) ?? inbound.find((l) => l.phones.some(on));
  return { inbound: inboundRow, outreach: lead };
}

export function firmSpocs(client: ClientEntity, links: FirmLinks, orders: SalesOrder[]): FirmSpoc[] {
  const logged = (role: SpocLogEntry['role']) => latestEntry(client, role);

  const inLog = logged('inbound');
  const inName = links.inbound?.owner || links.outreach?.intake?.inboundOwner;
  const inbound: FirmSpoc = inLog
    ? { role: 'inbound', name: inLog.name, since: inLog.from, detail: `Set by ${inLog.by || 'a manager'}` }
    : inName
      ? { role: 'inbound', name: inName, since: links.inbound?.createdAt, detail: 'From the Inbound lead' }
      : { role: 'inbound', detail: 'No Inbound lead on these numbers' };

  const outLog = logged('outreach');
  const outBm = links.outreach?.bm;
  const outreach: FirmSpoc = outLog
    ? { role: 'outreach', name: outLog.name, since: outLog.from, detail: `Set by ${outLog.by || 'a manager'}` }
    : outBm
      ? { role: 'outreach', name: outBm, since: links.outreach?.intake?.acceptedAt || links.outreach?.intake?.assignedAt || links.outreach?.createdAt, detail: 'From the Outreach lead' }
      : { role: 'outreach', detail: 'No Outreach lead on these numbers' };

  const held = (client.assignments || []).filter((a) => sameRep(a.kam, client.kam) && a.status !== 'Rejected').slice(-1)[0];
  const kam: FirmSpoc = client.kam
    ? { role: 'kam', name: client.kam, since: held?.at, detail: held?.status === 'Pending' ? 'Waiting for KAM sign-off' : 'Owns the firm' }
    : { role: 'kam', detail: 'No KAM yet' };

  const ecLog = logged('ec');
  const lastOrder = orders.filter((o) => dealIsOrder(o.status) && o.spoc)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
  const ec: FirmSpoc = ecLog
    ? { role: 'ec', name: ecLog.name, since: ecLog.from, detail: `Set by ${ecLog.by || 'a manager'}` }
    : lastOrder
      ? { role: 'ec', name: lastOrder.spoc, since: lastOrder.createdAt, detail: 'BM on the last order' }
      : { role: 'ec', detail: 'No order at an EC yet' };

  return [inbound, outreach, kam, ec];
}

function spocStages(client: ClientEntity, spocs: FirmSpoc[]): SpocStage[] {
  const stages: SpocStage[] = [];
  for (const role of ['inbound', 'outreach'] as const) {
    const log = (client.spocLog || []).filter((e) => e.role === role);
    if (log.length) stages.push(...log.map((e) => ({ role, name: e.name, from: e.from })));
    else {
      const s = spocs.find((x) => x.role === role);
      if (s?.name && s.since) stages.push({ role, name: s.name, from: s.since });
    }
  }
  for (const a of client.assignments || []) {
    if (a.status !== 'Rejected' && a.at) stages.push({ role: 'kam', name: a.kam || 'No KAM', from: a.at });
  }
  return stages.sort((a, b) => a.from.localeCompare(b.from));
}

export function spocSales(client: ClientEntity, spocs: FirmSpoc[], orders: SalesOrder[], nowMs: number): SpocSales {
  const stages = spocStages(client, spocs);
  const starts = stages.map((s) => Date.parse(s.from));
  const totals = stages.map(() => ({ orders: 0, value: 0 }));
  const before = { orders: 0, value: 0 };
  const undated = { orders: 0, value: 0 };
  const ec = new Map<string, { orders: number; value: number }>();
  const add = (t: { orders: number; value: number }, v: number) => { t.orders += 1; t.value += v; };

  for (const o of orders) {
    if (!dealIsOrder(o.status)) continue;
    const value = Number(o.orderValue) || 0;
    if (o.spoc) {
      if (!ec.has(o.spoc)) ec.set(o.spoc, { orders: 0, value: 0 });
      add(ec.get(o.spoc)!, value);
    }
    const at = Date.parse(String(o.createdAt || ''));
    if (Number.isNaN(at)) { add(undated, value); continue; }
    let idx = -1;
    starts.forEach((s, i) => { if (s <= at) idx = i; });
    add(idx < 0 ? before : totals[idx], value);
  }

  const rows = stages.map((s, i) => {
    const end = starts[i + 1] ?? nowMs;
    const months = Math.max((end - starts[i]) / (30 * DAY_MS), 1);
    return { ...s, to: stages[i + 1]?.from, ...totals[i], perMonth: totals[i].value / months };
  });
  const byEc = [...ec.entries()].map(([name, t]) => ({ name, ...t })).sort((a, b) => b.value - a.value);
  return { rows, before, undated, byEc };
}
