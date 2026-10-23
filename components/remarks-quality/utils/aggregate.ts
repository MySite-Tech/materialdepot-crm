import type { Group, Remark, ScoreCtx } from '../types';
import { addLead, bucketOf, isCopy, leadStats } from './scoring';

export function aggregate<K extends number | string>(rows: Remark[], keyFn: (r: Remark) => K, ctx: ScoreCtx): Group<K>[] {
  const m = new Map<K, Group<K>>();
  for (const r of rows) {
    const k = keyFn(r);
    let g = m.get(k);
    if (!g) {
      g = { k, n: 0, b: [0, 0, 0, 0], cp: 0, len: 0, leads: new Set(), br: new Map(), lm: new Map(), L: leadStats(new Map()) };
      m.set(k, g);
    }
    g.n++;
    g.b[bucketOf(r, ctx)]++;
    if (isCopy(r, ctx.thresholds)) g.cp++;
    g.len += r.len;
    g.leads.add(r.lead);
    addLead(g.lm, r, ctx);
    g.br.set(r.branch, (g.br.get(r.branch) || 0) + 1);
  }
  for (const g of m.values()) g.L = leadStats(g.lm);
  return [...m.values()];
}

export const topBranch = (g: Group) => [...g.br.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1;

export type SortKey = 'name' | 'n' | 'avg' | 'leads' | 'pc' | 'ln' | 'avgp' | 'all4' | 'zero' | 'v0' | 'v1' | 'v2' | 'v3' | 'p0' | 'p1' | 'p2' | 'p3';
export interface Sort<K extends string = SortKey> { k: K; dir: 1 | -1 }

export function groupSortValue(g: Group & { name?: string }, k: SortKey): number | string {
  if (k === 'name') return g.name ?? '';
  if (k === 'n') return g.n;
  if (k === 'avg') return g.len / g.n;
  if (k === 'leads') return g.leads.size;
  if (k === 'pc') return g.cp / g.n;
  if (k === 'ln') return g.L.n;
  if (k === 'avgp') return g.L.avg;
  if (k === 'all4') return g.L.n ? g.L.d[4] / g.L.n : 0;
  if (k === 'zero') return g.L.n ? g.L.d[0] / g.L.n : 0;
  if (k[0] === 'v') return g.L.n ? g.L.cov[+k[1]] / g.L.n : 0;
  return g.b[+k[1]] / g.n;
}

export function sortBy<T>(arr: T[], val: (x: T) => number | string, dir: 1 | -1): T[] {
  return [...arr].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    return (typeof x === 'string' ? x.localeCompare(String(y)) : x - (y as number)) * dir;
  });
}

export const nextSort = <K extends string>(cur: Sort<K>, k: K, ascKeys: K[]): Sort<K> =>
  ({ k, dir: cur.k === k ? (cur.dir === 1 ? -1 : 1) : ascKeys.includes(k) ? 1 : -1 });
