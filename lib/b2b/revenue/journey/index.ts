import { B2B_TEAM_LABEL } from '../../team/constants';
import type { FlowFrom } from '../clients/types';
import type { HolderKind, RevenueOrder } from '../types';
import { isStudioChannel } from '../utils/rollup';
import type {
  BridgeKey, BridgeStep, CategoryShift, FirmMonth, FirmRow, FirmSide, FlowLink, Journey, JourneyFirm, JourneyLens,
  JourneyPath, JourneySide, Lifecycle, MonthStat, RetentionCell, SourceSplit,
} from './types';

export type {
  BridgeKey, BridgeStep, CategoryShift, FirmRow, FirmSide, FlowLink, Journey, JourneyLens, JourneyPath, JourneySide,
  Lifecycle, MonthStat, RetentionCell, SourceSplit,
} from './types';

export const BRIDGE_ORDER: BridgeKey[] = [
  'lostStudio', 'lostEc', 'stayedStudioDown', 'stayedEcDown', 'studioToEc',
  'stayedEcUp', 'stayedStudioUp', 'ecToStudio', 'new', 'revived', 'returning', 'storeBuyer',
];

export const ENTRY_PATHS = new Set<JourneyPath>(['new', 'revived', 'returning', 'storeBuyer']);

const HOLDER_SOURCE: Partial<Record<HolderKind, string>> = {
  firm: 'KAM firm',
  inbound: 'Inbound lead',
  outreach: 'Outreach lead',
  studio: 'Studio Space firm',
  redirect: 'Logged redirect',
};

export function orderSource(o: RevenueOrder): string {
  if (o.ecReferral) return 'EC B2B referral';
  if (o.type === 5) return 'Referred client';
  const held = o.heldBy ? HOLDER_SOURCE[o.heldBy] : undefined;
  if (held) return held;
  if (o.type === 1 || o.type === 2) return o.team ? `${B2B_TEAM_LABEL[o.team]} rep on the cart` : 'B2B rep on the cart';
  if (o.heldBy === 'b2bOrder') return 'Earlier B2B order';
  if (o.type === 8) return 'Known firm, no tie-up yet';
  return 'Number B2B holds';
}

export function orderDayOfMonth(o: RevenueOrder): number {
  const ms = Date.parse(o.ticket.placedAt || o.ticket.createdAt || '');
  return Number.isNaN(ms) ? 0 : new Date(ms + 330 * 60_000).getUTCDate();
}

export const throughDay = (orders: RevenueOrder[], day: number | null): RevenueOrder[] =>
  day === null ? orders : orders.filter((o) => orderDayOfMonth(o) <= day);

export function lifecycleOf(months: { key: string; clients: { key: string; from: FlowFrom }[] }[]): Lifecycle {
  return new Map(months.map((m) => [m.key, new Map(m.clients.map((c) => [c.key, c.from]))]));
}

export function orderCategories(o: RevenueOrder): string[] {
  const names = o.ticket.cart.flatMap((c) => c.name.split(/,\s*/)).map((n) => n.trim()).filter(Boolean);
  return [...new Set(names)];
}

const emptyMonth = (): FirmMonth & { studioCategories: Record<string, number> } => ({
  value: 0, studioValue: 0, orders: 0, studioOrders: 0, categories: {}, studioCategories: {}, sources: {}, owner: '', team: null,
});

type Month = ReturnType<typeof emptyMonth>;
type Firm = Omit<JourneyFirm, 'months'> & { months: Record<string, Month> };

const add = (rec: Record<string, number>, k: string, v: number) => { rec[k] = (rec[k] ?? 0) + v; };

export function firmsByMonth(reports: Record<string, RevenueOrder[]>): Map<string, Firm> {
  const firms = new Map<string, Firm>();
  for (const key of Object.keys(reports).sort()) {
    for (const o of reports[key]) {
      const id = o.clientKey || `p:${o.phone || o.id}`;
      const firm = firms.get(id) ?? { key: id, name: '', months: {} };
      firm.name = o.firm || o.client || firm.name || 'Unnamed';
      const m = (firm.months[key] ??= emptyMonth());
      const studio = isStudioChannel(o.channel);
      m.value += o.value;
      m.orders += 1;
      if (studio) {
        m.studioValue += o.value;
        m.studioOrders += 1;
      }
      for (const c of orderCategories(o)) {
        add(m.categories, c, o.value);
        if (studio) add(m.studioCategories, c, o.value);
      }
      add(m.sources, orderSource(o), o.value);
      if (o.person) {
        m.owner = o.person;
        m.team = o.team;
      }
      firms.set(id, firm);
    }
  }
  return firms;
}

export const lensValue = (m: Month | undefined, lens: JourneyLens): number => (!m ? 0 : lens === 'studio' ? m.studioValue : m.value);
const lensOrders = (m: Month | undefined, lens: JourneyLens): number => (!m ? 0 : lens === 'studio' ? m.studioOrders : m.orders);
const lensCats = (m: Month | undefined, lens: JourneyLens): Record<string, number> => (!m ? {} : lens === 'studio' ? m.studioCategories : m.categories);
const active = (m: Month | undefined, lens: JourneyLens): boolean => lensOrders(m, lens) > 0;
const sideOf = (m: Month | undefined): JourneySide => (!m ? 'none' : m.studioOrders ? 'studio' : 'ec');

function pathOf(f: Firm, a: string, b: string, between: string[], lifecycle: Lifecycle): JourneyPath | null {
  const sa = sideOf(f.months[a]);
  const sb = sideOf(f.months[b]);
  if (sa === 'none' && sb === 'none') return null;
  if (sa === 'studio') return sb === 'studio' ? 'stayedStudio' : sb === 'ec' ? 'studioToEc' : 'lostStudio';
  if (sa === 'ec') return sb === 'studio' ? 'ecToStudio' : sb === 'ec' ? 'stayedEc' : 'lostEc';
  const entry = [...between, b].find((k) => f.months[k]);
  const from = entry ? lifecycle.get(entry)?.get(f.key) : undefined;
  return from === 'new' ? 'new' : from === 'revived' ? 'revived' : from === 'retail' ? 'storeBuyer' : 'returning';
}

function sideStats(m: Month | undefined, lens: JourneyLens): FirmSide {
  const value = lensValue(m, lens);
  const orders = lensOrders(m, lens);
  const cats = lensCats(m, lens);
  return { value, orders, aov: orders ? value / orders : 0, categories: Object.keys(cats).sort((x, y) => cats[y] - cats[x]) };
}

const topKey = (rec: Record<string, number> | undefined): string =>
  Object.entries(rec ?? {}).sort((x, y) => y[1] - x[1])[0]?.[0] ?? '';

function bridgeKey(path: JourneyPath, delta: number): BridgeKey {
  if (path === 'stayedStudio') return delta >= 0 ? 'stayedStudioUp' : 'stayedStudioDown';
  if (path === 'stayedEc') return delta >= 0 ? 'stayedEcUp' : 'stayedEcDown';
  return path;
}

export const rowBridgeKey = (r: FirmRow): BridgeKey => bridgeKey(r.path, r.delta);

export interface JourneyInput {
  reports: Record<string, RevenueOrder[]>;
  a: string;
  b: string;
  lens: JourneyLens;
  lifecycle: Lifecycle;
}

export function buildJourney({ reports, a, b, lens, lifecycle }: JourneyInput): Journey {
  const monthKeys = Object.keys(reports).sort();
  const firms = firmsByMonth(reports);
  const between = monthKeys.filter((k) => k > a && k < b);
  const span = monthKeys.filter((k) => k >= a && k <= b);

  const rows: FirmRow[] = [];
  for (const f of firms.values()) {
    const path = pathOf(f, a, b, between, lifecycle);
    if (!path) continue;
    const ma = f.months[a];
    const mb = f.months[b];
    const sa = sideStats(ma, lens);
    const sb = sideStats(mb, lens);
    const ownerMonth = [...span].reverse().map((k) => f.months[k]).find((m) => m?.owner);
    rows.push({
      key: f.key,
      name: f.name,
      path,
      sideA: sideOf(ma),
      sideB: sideOf(mb),
      source: topKey(mb?.sources) || topKey(ma?.sources),
      owner: ownerMonth ? `${ownerMonth.owner}${ownerMonth.team ? ` · ${B2B_TEAM_LABEL[ownerMonth.team]}` : ''}` : '',
      a: sa,
      b: sb,
      delta: sb.value - sa.value,
      spark: monthKeys.map((k) => lensValue(f.months[k], lens)),
      stopped: sa.categories.filter((c) => !sb.categories.includes(c)),
      started: sb.categories.filter((c) => !sa.categories.includes(c)),
    });
  }

  const steps = new Map<BridgeKey, BridgeStep>();
  for (const r of rows) {
    const key = rowBridgeKey(r);
    const step = steps.get(key) ?? { key, value: 0, firms: 0 };
    step.value += r.delta;
    if (r.delta !== 0) step.firms += 1;
    steps.set(key, step);
  }
  const bridge = BRIDGE_ORDER.map((k) => steps.get(k)).filter((s): s is BridgeStep => !!s && s.firms > 0);

  const linkMap = new Map<string, FlowLink>();
  for (const r of rows) {
    const from = r.sideA;
    const to = r.sideB;
    const id = `${from}|${to}|${ENTRY_PATHS.has(r.path) ? r.path : ''}`;
    const link = linkMap.get(id) ?? { from, to, firms: 0, valueA: 0, valueB: 0, path: r.path };
    link.firms += 1;
    link.valueA += r.a.value;
    link.valueB += r.b.value;
    linkMap.set(id, link);
  }

  const cats = new Map<string, CategoryShift>();
  for (const f of firms.values()) {
    for (const [side, key] of [['a', a], ['b', b]] as const) {
      for (const [name, v] of Object.entries(lensCats(f.months[key], lens))) {
        const c = cats.get(name) ?? { name, a: 0, b: 0, firmsA: 0, firmsB: 0 };
        c[side] += v;
        if (side === 'a') c.firmsA += 1; else c.firmsB += 1;
        cats.set(name, c);
      }
    }
  }

  const months: MonthStat[] = monthKeys.map((k) => {
    let value = 0;
    let orders = 0;
    let count = 0;
    for (const f of firms.values()) {
      const m = f.months[k];
      value += lensValue(m, lens);
      orders += lensOrders(m, lens);
      if (active(m, lens)) count += 1;
    }
    return { key: k, value, orders, firms: count, aov: orders ? value / orders : 0 };
  });

  const retention: RetentionCell[] = [];
  monthKeys.forEach((from, i) => {
    const base = [...firms.values()].filter((f) => active(f.months[from], lens));
    for (const to of monthKeys.slice(i + 1)) {
      const kept = base.filter((f) => active(f.months[to], lens));
      retention.push({
        from, to, base: base.length, kept: kept.length,
        baseValue: base.reduce((n, f) => n + lensValue(f.months[from], lens), 0),
        keptValue: base.reduce((n, f) => n + lensValue(f.months[to], lens), 0),
      });
    }
  });

  const sourceMap = new Map<string, SourceSplit>();
  for (const r of rows) {
    if (!(ENTRY_PATHS.has(r.path) || r.path === 'ecToStudio') || !r.b.value) continue;
    const s = sourceMap.get(r.source) ?? { source: r.source, firms: 0, value: 0 };
    s.firms += 1;
    s.value += r.b.value;
    sourceMap.set(r.source, s);
  }

  return {
    a, b, lens,
    startValue: rows.reduce((n, r) => n + r.a.value, 0),
    endValue: rows.reduce((n, r) => n + r.b.value, 0),
    bridge,
    links: [...linkMap.values()],
    firms: rows.sort((x, y) => x.delta - y.delta),
    categories: [...cats.values()].sort((x, y) => (y.b - y.a) - (x.b - x.a)),
    months,
    retention,
    sources: [...sourceMap.values()].sort((x, y) => y.value - x.value),
  };
}
