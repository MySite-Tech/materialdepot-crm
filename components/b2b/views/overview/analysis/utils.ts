import { CHANNEL_LABELS } from '../../../../../lib/b2b/revenue/constants';
import { revenueTotal } from '../../../../../lib/b2b/revenue/utils/rollup';
import { B2B_TEAM_LABEL } from '../../../../../lib/b2b/team/constants';
import type { HolderKind, RevenueOrder } from '../../../../../lib/b2b/revenue/types';
import { DIM_ORDER, NOT_SET, SIZE_BANDS } from './constants';
import type { AnalysisFilter, Bridge, ChangeRow, ChangeSort, DimKey, HeatRow, Option, Totals } from './types';

const HELD_SOURCE: Partial<Record<HolderKind, string>> = {
  firm: 'KAM firm',
  inbound: 'Inbound lead',
  outreach: 'Outreach lead',
  redirect: 'Logged redirect',
  studio: 'Studio Space firm',
  b2bOrder: 'Earlier B2B order',
};

function sourceOf(o: RevenueOrder): string {
  if (o.type === 1 || o.type === 2) return 'B2B rep on the cart';
  if (o.type === 5) return 'Studio Space referral';
  if (o.type === 8) return 'Known firm, before B2B';
  return (o.heldBy && HELD_SOURCE[o.heldBy]) || 'Number B2B holds';
}

const sizeOf = (value: number): string => (SIZE_BANDS.find((b) => value < b.below) ?? SIZE_BANDS[SIZE_BANDS.length - 1]).label;

function categoriesOf(o: RevenueOrder): string[] {
  const names = o.ticket.cart.flatMap((c) => c.name.split(/,\s*/)).map((n) => n.trim()).filter(Boolean);
  return names.length ? [...new Set(names)] : [NOT_SET.category];
}

export function valuesOf(o: RevenueOrder, dim: DimKey): string[] {
  switch (dim) {
    case 'channel': return [CHANNEL_LABELS[o.channel]];
    case 'source': return [sourceOf(o)];
    case 'branch': return [o.store || 'Unknown'];
    case 'rep': return [o.placedBy || NOT_SET.rep];
    case 'category': return categoriesOf(o);
    case 'team': return [o.team ? B2B_TEAM_LABEL[o.team] : NOT_SET.team];
    case 'person': return [o.person || NOT_SET.person];
    case 'clientType': return [o.ticket.clientType || NOT_SET.clientType];
    case 'size': return [sizeOf(o.value)];
    case 'firm': return [o.firm || NOT_SET.firm];
  }
}

export const filterCount = (f: AnalysisFilter): number => DIM_ORDER.reduce((n, d) => n + (f[d]?.length ?? 0), 0);

export function matches(o: RevenueOrder, f: AnalysisFilter, skip?: DimKey): boolean {
  for (const d of DIM_ORDER) {
    const want = f[d];
    if (d === skip || !want?.length) continue;
    if (!valuesOf(o, d).some((v) => want.includes(v))) return false;
  }
  return true;
}

export function istDay(o: RevenueOrder): number {
  const ms = Date.parse(o.ticket.placedAt || o.ticket.createdAt || '');
  return Number.isNaN(ms) ? 0 : new Date(ms + 330 * 60_000).getUTCDate();
}

export const throughDay = (orders: RevenueOrder[], day: number | null): RevenueOrder[] =>
  day === null ? orders : orders.filter((o) => istDay(o) <= day);

export function totals(orders: RevenueOrder[]): Totals {
  const value = revenueTotal(orders);
  return { value, orders: orders.length, firms: new Set(orders.map((o) => o.firm)).size, aov: orders.length ? value / orders.length : 0 };
}

export const pctChange = (now: number, before: number): number | null =>
  before > 0 ? ((now - before) / before) * 100 : null;

export function bridge(f: Totals, c: Totals): Bridge {
  return { volume: (f.orders - c.orders) * c.aov, ticket: f.orders * (f.aov - c.aov) };
}

function groupBy(orders: RevenueOrder[], dim: DimKey): Map<string, RevenueOrder[]> {
  const groups = new Map<string, RevenueOrder[]>();
  for (const o of orders) {
    for (const v of valuesOf(o, dim)) {
      const group = groups.get(v);
      if (group) group.push(o);
      else groups.set(v, [o]);
    }
  }
  return groups;
}

export const ordersFor = (orders: RevenueOrder[], dim: DimKey, key: string): RevenueOrder[] =>
  orders.filter((o) => valuesOf(o, dim).includes(key)).sort((a, b) => b.value - a.value);

export function changeRows(focus: RevenueOrder[], compare: RevenueOrder[], dim: DimKey): ChangeRow[] {
  const f = groupBy(focus, dim);
  const c = groupBy(compare, dim);
  return [...new Set([...f.keys(), ...c.keys()])].map((key) => {
    const ft = totals(f.get(key) ?? []);
    const ct = totals(c.get(key) ?? []);
    return { key, focus: ft, compare: ct, delta: ft.value - ct.value };
  });
}

export function sortChanges(rows: ChangeRow[], by: ChangeSort): ChangeRow[] {
  return [...rows].sort((a, b) => by === 'change'
    ? Math.abs(b.delta) - Math.abs(a.delta) || b.focus.value - a.focus.value
    : b.focus.value - a.focus.value || b.compare.value - a.compare.value);
}

export function moversByDim(focus: RevenueOrder[], compare: RevenueOrder[], f: AnalysisFilter): { dim: DimKey; gain: ChangeRow | null; drop: ChangeRow | null }[] {
  return DIM_ORDER.filter((d) => !f[d]?.length).map((dim) => {
    const rows = changeRows(focus, compare, dim);
    const gain = rows.reduce<ChangeRow | null>((best, r) => (r.delta > 0 && (!best || r.delta > best.delta) ? r : best), null);
    const drop = rows.reduce<ChangeRow | null>((worst, r) => (r.delta < 0 && (!worst || r.delta < worst.delta) ? r : worst), null);
    return { dim, gain, drop };
  });
}

export function heatRows(months: (RevenueOrder[] | null)[], dim: DimKey, limit: number): HeatRow[] {
  const sums = new Map<string, number[]>();
  months.forEach((orders, i) => {
    for (const o of orders ?? []) {
      for (const v of valuesOf(o, dim)) {
        const row = sums.get(v) ?? months.map(() => 0);
        row[i] += o.value;
        sums.set(v, row);
      }
    }
  });
  return [...sums.entries()]
    .map(([key, row]) => ({ key, cells: row.map((v, i) => (months[i] ? v : null)), total: row.reduce((s, v) => s + v, 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export function optionsOf(focus: RevenueOrder[], compare: RevenueOrder[], dim: DimKey): Option[] {
  const sums = new Map<string, number>();
  for (const o of compare) for (const v of valuesOf(o, dim)) if (!sums.has(v)) sums.set(v, 0);
  for (const o of focus) for (const v of valuesOf(o, dim)) sums.set(v, (sums.get(v) ?? 0) + o.value);
  return [...sums.entries()].map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
}

export const signedL = (n: number, fmt: (n: number) => string): string => `${n >= 0 ? '+' : '−'}${fmt(Math.abs(n))}`;
