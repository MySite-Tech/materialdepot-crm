import { CHURN_GAP, FLOW_LOOKBACK } from '../constants';
import { isStudioChannel } from '../utils/rollup';
import type { ChurnedClient, ClientGroup, FlowClient, FlowFrom, FlowMonth, FlowSide, MonthDigest } from './types';

export type { ChurnedClient, ClientFlowReport, ClientGroup, DigestOrder, FlowClient, FlowFrom, FlowMonth, FlowSide, MonthDigest } from './types';

interface Seen {
  name: string;
  side: FlowSide;
  value: number;
  studioValue: number;
  orders: number;
}

type Groups = Map<string, ClientGroup>;

const clientKey = (phone: string, groups: Groups): string => groups.get(phone)?.key ?? (phone ? `n:${phone}` : '');

export const monthsBefore = (key: string, n: number): string => {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 - n, 1)).toISOString().slice(0, 7);
};

function b2bClients(d: MonthDigest, groups: Groups): Map<string, Seen> {
  const out = new Map<string, Seen>();
  d.orders.forEach((o, i) => {
    const key = clientKey(o.phone, groups) || `o:${d.key}:${i}`;
    const seen = out.get(key) ?? { name: groups.get(o.phone)?.name || o.name || 'Unnamed', side: 'ec', value: 0, studioValue: 0, orders: 0 };
    seen.value += o.value;
    seen.orders += 1;
    if (isStudioChannel(o.channel)) {
      seen.side = 'studio';
      seen.studioValue += o.value;
    }
    out.set(key, seen);
  });
  return out;
}

export function flowPhones(digests: MonthDigest[], groups: Groups, analysed: number): string[] {
  const keys = new Set(digests.slice(-analysed).flatMap((d) => d.orders.map((o) => clientKey(o.phone, groups))));
  const phones = new Set<string>();
  for (const [phone, g] of groups) if (keys.has(g.key)) phones.add(phone);
  for (const k of keys) if (k.startsWith('n:')) phones.add(k.slice(2));
  return [...phones];
}

function firstOrders(groups: Groups, firsts: Map<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  const keep = (key: string, day: string) => {
    const held = out.get(key);
    if (!held || day < held) out.set(key, day);
  };
  for (const [phone, day] of firsts) if (day) keep(clientKey(phone, groups), day);
  return out;
}

export function clientFlow(digests: MonthDigest[], groups: Groups, analysed: number, firsts: Map<string, string>): Omit<FlowMonth, 'label' | 'partial'>[] {
  const clients = digests.map((d) => b2bClients(d, groups));
  const bought = digests.map((d, i) => {
    const keys = new Set(d.buyers.map((p) => clientKey(p, groups)).filter(Boolean));
    for (const k of clients[i].keys()) keys.add(k);
    return keys;
  });
  const firstOf = firstOrders(groups, firsts);
  const sideIn = (i: number, key: string): FlowFrom => clients[i].get(key)?.side ?? 'retail';

  const unseenFrom = (i: number, key: string): FlowFrom => {
    if (i - FLOW_LOOKBACK >= 0) return 'new';
    const first = firstOf.get(key)?.slice(0, 7);
    if (!first) return 'earlier';
    if (first >= digests[i].key) return 'new';
    return first >= monthsBefore(digests[i].key, FLOW_LOOKBACK) ? 'revived' : 'earlier';
  };

  const out: Omit<FlowMonth, 'label' | 'partial'>[] = [];
  for (let i = Math.max(0, digests.length - analysed); i < digests.length; i++) {
    const flow: FlowClient[] = [...clients[i]].map(([key, seen]) => {
      let gap = 1;
      while (gap <= FLOW_LOOKBACK && i - gap >= 0 && !bought[i - gap].has(key)) gap++;
      const found = gap <= FLOW_LOOKBACK && i - gap >= 0;
      const from: FlowFrom = !found ? unseenFrom(i, key) : gap > CHURN_GAP ? 'revived' : sideIn(i - gap, key);
      return { key, ...seen, from, lastBefore: found ? digests[i - gap].key : null, firstOrder: firstOf.get(key) ?? null };
    });
    const lapsed = i - CHURN_GAP;
    const churned: ChurnedClient[] = lapsed < 0 ? [] : [...clients[lapsed]]
      .filter(([key]) => Array.from({ length: CHURN_GAP }, (_, j) => i - j).every((m) => !bought[m].has(key)))
      .map(([key, seen]) => ({ key, name: seen.name, side: seen.side, lastMonth: digests[lapsed].key, value: seen.value }));
    out.push({ key: digests[i].key, truncated: digests[i].truncated, clients: flow, churned });
  }
  return out;
}
