import { REVENUE_CHANNELS } from '../constants';
import type { ChannelSplit, OrderBucket, RevenueChannel, RevenueFilter, RevenueOrder, RollupRow } from '../types';

export const isCounted = (o: RevenueOrder): boolean => (REVENUE_CHANNELS as string[]).includes(o.bucket);

export const countedValue = (orders: RevenueOrder[]): number =>
  orders.reduce((s, o) => (isCounted(o) ? s + o.value : s), 0);

export const matchesFilter = (o: RevenueOrder, f: RevenueFilter): boolean => {
  if (f.bucket !== 'all' && o.bucket !== f.bucket) return false;
  if (f.bucket === 'all' && !isCounted(o)) return false;
  if (f.team !== 'all' && o.team !== f.team) return false;
  if (f.person !== 'all' && o.person !== f.person) return false;
  if (f.store !== 'all' && o.store !== f.store) return false;
  const q = f.search.trim().toLowerCase();
  return !q || `${o.firm} ${o.client} ${o.person} ${o.placedBy}`.toLowerCase().includes(q);
};

export function bucketSplit(orders: RevenueOrder[], bucket: OrderBucket): ChannelSplit {
  const rows = orders.filter((o) => o.bucket === bucket);
  const sum = (keep: (o: RevenueOrder) => boolean) => rows.reduce((s, o) => (keep(o) ? s + o.value : s), 0);
  return {
    value: sum(() => true),
    orders: rows.length,
    firms: new Set(rows.map((o) => o.firm)).size,
    kam: sum((o) => o.team === 'kam'),
    field: sum((o) => o.team === 'inbound' || o.team === 'outreach'),
  };
}

export function channelSplits(orders: RevenueOrder[]): Record<RevenueChannel, ChannelSplit> {
  return {
    direct: bucketSplit(orders, 'direct'),
    ec: bucketSplit(orders, 'ec'),
    referred: bucketSplit(orders, 'referred'),
  };
}

export function rollupBy(orders: RevenueOrder[], keyOf: (o: RevenueOrder) => string, detailOf: (o: RevenueOrder) => string): RollupRow[] {
  const rows = new Map<string, RollupRow & { details: Set<string> }>();
  for (const o of orders) {
    const key = keyOf(o) || 'Not assigned';
    const row = rows.get(key) ?? { key, value: 0, orders: 0, direct: 0, ec: 0, referred: 0, uncounted: 0, detail: '', details: new Set<string>() };
    row.value += o.value;
    row.orders += 1;
    if (o.bucket === 'direct' || o.bucket === 'ec' || o.bucket === 'referred') row[o.bucket] += o.value;
    else row.uncounted += o.value;
    const d = detailOf(o);
    if (d) row.details.add(d);
    rows.set(key, row);
  }
  return [...rows.values()]
    .map(({ details, ...row }) => ({ ...row, detail: [...details].join(', ') }))
    .sort((a, b) => b.value - a.value);
}
