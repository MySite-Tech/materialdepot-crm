import { REVENUE_CHANNELS } from '../constants';
import type { ChannelSplit, RevenueChannel, RevenueFilter, RevenueOrder, RollupRow } from '../types';

export const revenueTotal = (orders: RevenueOrder[]): number => orders.reduce((s, o) => s + o.value, 0);

export const matchesFilter = (o: RevenueOrder, f: RevenueFilter): boolean => {
  if (f.channel !== 'all' && o.channel !== f.channel) return false;
  if (f.type !== 'all' && o.type !== f.type) return false;
  if (f.team !== 'all' && o.team !== f.team) return false;
  if (f.person !== 'all' && o.person !== f.person) return false;
  if (f.store !== 'all' && o.store !== f.store) return false;
  const q = f.search.trim().toLowerCase();
  return !q || `${o.id} ${o.phone} ${o.firm} ${o.client} ${o.person} ${o.placedBy}`.toLowerCase().includes(q);
};

function splitOf(rows: RevenueOrder[]): ChannelSplit {
  const types: ChannelSplit['types'] = {};
  for (const o of rows) types[o.type] = (types[o.type] ?? 0) + o.value;
  return { value: revenueTotal(rows), orders: rows.length, firms: new Set(rows.map((o) => o.firm)).size, types };
}

export const channelSplits = (orders: RevenueOrder[]): Record<RevenueChannel, ChannelSplit> =>
  Object.fromEntries(REVENUE_CHANNELS.map((c) => [c, splitOf(orders.filter((o) => o.channel === c))])) as Record<RevenueChannel, ChannelSplit>;

const rollupKey = (o: RevenueOrder, keyOf: (o: RevenueOrder) => string): string => keyOf(o) || 'Not assigned';

export const rollupOrders = (orders: RevenueOrder[], keyOf: (o: RevenueOrder) => string, key: string): RevenueOrder[] =>
  orders.filter((o) => rollupKey(o, keyOf) === key).sort((a, b) => b.value - a.value);

export function rollupBy(orders: RevenueOrder[], keyOf: (o: RevenueOrder) => string, detailOf: (o: RevenueOrder) => string): RollupRow[] {
  const rows = new Map<string, RollupRow & { details: Set<string> }>();
  for (const o of orders) {
    const key = rollupKey(o, keyOf);
    const row = rows.get(key) ?? { key, value: 0, orders: 0, direct: 0, redirected: 0, ecDirect: 0, referred: 0, detail: '', details: new Set<string>() };
    row.value += o.value;
    row.orders += 1;
    row[o.channel] += o.value;
    const d = detailOf(o);
    if (d) row.details.add(d);
    rows.set(key, row);
  }
  return [...rows.values()]
    .map(({ details, ...row }) => ({ ...row, detail: [...details].join(', ') }))
    .sort((a, b) => b.value - a.value);
}
