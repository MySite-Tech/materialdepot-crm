import { ClientEntity } from '../client';
import { istToday } from '../inbound';
import { KAM_OPEN_STATUSES, KAM_PIPELINE_STATUSES, STATUS_RANK } from '../../constants/kam';
import { AssignedClientRow, CohortMonth, KamAccountSplit, KamFunnel, KamOrder, KamPipelineSplit, NewVsRepeat } from '../../types/kam';
import { sum } from '../utils/kam';
export function kamPipeline(orders: KamOrder[]): KamPipelineSplit {
  const live = orders.filter((o) => KAM_PIPELINE_STATUSES.includes(o.status));
  return {
    pipeline: sum(live.map((o) => o.orderValue)),
    estimatedPipeline: sum(live.map((o) => o.estimatedValue)),
    count: live.length,
  };
}

export function kamPipelineToday(orders: KamOrder[], today: string = istToday()): KamPipelineSplit {
  const day = (iso: string | undefined) => String(iso || '').slice(0, 10);
  const live = orders.filter((o) =>
    KAM_PIPELINE_STATUSES.includes(o.status)
    && (day(o.statusChangedAt) === today || day(o.createdAt) === today));
  return {
    pipeline: sum(live.map((o) => o.orderValue)),
    estimatedPipeline: sum(live.map((o) => o.estimatedValue)),
    count: live.length,
  };
}

export function kamFunnel(
  orders: KamOrder[],
  range?: { from?: string; to?: string },
): KamFunnel {
  const day = (iso: string | undefined) => String(iso || '').slice(0, 10);
  let untimed = 0;
  const inRange = orders.filter((o) => {
    const d = day(o.statusChangedAt) || day(o.createdAt);
    if (!d) { untimed++; return !range?.from && !range?.to; }
    if (range?.from && d < range.from) return false;
    if (range?.to && d > range.to) return false;
    return true;
  });

  const atOrBeyond = (rank: number) => inRange.filter((o) => STATUS_RANK[o.status] >= rank && o.status !== 'Lost');
  const closed = inRange.filter((o) => o.status === 'Closed');
  const lost = inRange.filter((o) => o.status === 'Lost');

  const steps = [
    { label: 'Quote Shared', rows: atOrBeyond(1) },
    { label: 'PI Shared',    rows: atOrBeyond(2) },
    { label: 'Closed',       rows: closed },
    { label: 'Lost',         rows: lost },
  ].map(({ label, rows }) => ({
    label,
    count: rows.length,
    value: sum(rows.map((o) => o.orderValue)),
  }));

  const decided = closed.length + lost.length;

  const cycles = closed
    .map((o) => {
      const from = day(o.createdAt);
      const to = day(o.statusChangedAt);
      if (!from || !to) return undefined;
      const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
      return Number.isNaN(ms) ? undefined : Math.max(0, Math.round(ms / 86_400_000));
    })
    .filter((n): n is number => n !== undefined);

  return {
    steps,
    untimed,
    winRate: decided ? closed.length / decided : undefined,
    averageCycleDays: cycles.length ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length) : undefined,
  };
}

export function clientCohort(
  clients: ClientEntity[],
  range?: { from?: string; to?: string },
): CohortMonth[] & { undated?: number } {
  const byMonth = new Map<string, CohortMonth>();
  let undated = 0;
  for (const c of clients) {
    const day = String(c.createdAt || '').slice(0, 10);
    if (!day) { undated++; continue; }
    if (range?.from && day < range.from) continue;
    if (range?.to && day > range.to) continue;
    const month = day.slice(0, 7);
    const row = byMonth.get(month) || { month, inbound: 0, outreach: 0, existing: 0, total: 0 };
    if (c.source === 'Inbound') row.inbound++;
    else if (c.source === 'Outreach') row.outreach++;
    else row.existing++;
    row.total++;
    byMonth.set(month, row);
  }
  const out = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)) as CohortMonth[] & { undated?: number };
  out.undated = undated;
  return out;
}

export function kamAccountSplit(
  rows: AssignedClientRow[],
  orders: KamOrder[],
  kams: string[],
): KamAccountSplit[] {
  return kams.map((kam) => {
    const mine = rows.filter((r) => r.client.kam === kam);
    const myOrders = orders.filter((o) => o.kam === kam);
    const p = kamPipeline(myOrders);
    return {
      kam,
      clients: mine.length,
      active: mine.filter((r) => r.status === 'Active').length,
      inactive: mine.filter((r) => r.status === 'Inactive').length,
      unknown: mine.filter((r) => r.status === 'Unknown').length,
      revenue: sum(myOrders.filter((o) => o.status === 'Closed').map((o) => o.orderValue)),
      pipeline: p.pipeline,
      estimatedPipeline: p.estimatedPipeline,
      openOrders: myOrders.filter((o) => KAM_OPEN_STATUSES.includes(o.status)).length,
    };
  }).sort((a, b) => b.revenue - a.revenue || b.clients - a.clients);
}

export function lostReasonBreakdown(
  orders: KamOrder[],
): { reason: string; count: number; estimatedValue: number }[] {
  const byReason = new Map<string, { count: number; estimatedValue: number }>();
  for (const o of orders.filter((x) => x.status === 'Lost')) {
    const reason = String(o.lostReason || '').trim() || 'No reason recorded';
    const row = byReason.get(reason) || { count: 0, estimatedValue: 0 };
    row.count++;

    row.estimatedValue += Number(o.estimatedValue) || 0;
    byReason.set(reason, row);
  }
  return [...byReason.entries()]
    .map(([reason, v]) => ({ reason, ...v }))
    .sort((a, b) => b.count - a.count);
}

export function newVsRepeat(
  rows: AssignedClientRow[],
  firstOrderValueFor: (c: ClientEntity) => number | undefined,
): NewVsRepeat {
  let newRevenue = 0, repeatRevenue = 0, newOrders = 0, repeatOrders = 0, unknownClients = 0;
  for (const r of rows) {
    const orders = r.metrics.orders;
    const total = r.metrics.totalRevenue;
    if (orders === undefined || total === undefined) { unknownClients++; continue; }
    if (orders === 0) continue;
    const first = firstOrderValueFor(r.client);
    if (first === undefined) { unknownClients++; continue; }
    newRevenue += first;
    newOrders += 1;
    repeatRevenue += Math.max(0, total - first);
    repeatOrders += Math.max(0, orders - 1);
  }
  return { newRevenue, repeatRevenue, newOrders, repeatOrders, unknownClients };
}

export function segmentRevenue(rows: AssignedClientRow[]): { segment: string; revenue: number; clients: number }[] {
  const out = new Map<string, { revenue: number; clients: number }>();
  for (const r of rows) {
    const key = r.segment ? `Segment ${r.segment}` : 'No segment set';
    const row = out.get(key) || { revenue: 0, clients: 0 };
    row.revenue += Number(r.metrics.totalRevenue) || 0;
    row.clients += 1;
    out.set(key, row);
  }
  return [...out.entries()].map(([segment, v]) => ({ segment, ...v })).sort((a, b) => b.revenue - a.revenue);
}

