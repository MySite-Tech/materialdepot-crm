import { SCORECARD_STRIP_DAYS } from '../../constants';
import type { Dataset, Filters, LeadStats, Remark, ScoreCtx } from '../../types';
import { aggregate, topBranch } from '../../utils/aggregate';
import { addDays, dayList, today } from '../../utils/dates';
import { makePredicate } from '../../utils/filtering';
import { addLead, leadStats } from '../../utils/scoring';

export interface ScoreRow {
  k: number;
  name: string;
  ec: string;
  L: LeadStats;
  avg: number;
  prev: number | null;
  all4: number;
  none: number;
  cov: number[];
  wa: number;
  wr: number;
  wp: number | null;
  qr?: number;
}

export type ScoreSortKey = 'qr' | 'name' | 'ec' | 'leads' | 'avg' | 'delta' | 'all4' | 'none' | 'c0' | 'c1' | 'c2' | 'c3' | 'wp';

export function scoreSortValue(x: ScoreRow, k: ScoreSortKey): number | string {
  if (k === 'qr') return x.qr ?? 1e9;
  if (k === 'name') return x.name;
  if (k === 'ec') return x.ec;
  if (k === 'leads') return x.L.n;
  if (k === 'delta') return x.prev === null ? -9 : x.avg - x.prev;
  if (k === 'wp') return (x.wp ?? -1) + x.wa * 1e-6;
  if (k[0] === 'c') return x.cov[+k[1]];
  return x[k as 'avg' | 'all4' | 'none'];
}

const remarkedCache = new WeakMap<Dataset, Set<string>>();
function remarkedSet(ds: Dataset) {
  let s = remarkedCache.get(ds);
  if (!s) { s = new Set(ds.remarks.filter(r => !r.auto).map(r => `${r.day}|${r.lead}`)); remarkedCache.set(ds, s); }
  return s;
}

export function buildScorecard(ds: Dataset, filters: Filters, ctx: ScoreCtx, cur: Remark[], rankMin: number) {
  const rng: [string, string] = [filters.date[0] || ds.minDay, filters.date[1] || today()];
  const span = Math.round((new Date(rng[1]).getTime() - new Date(rng[0]).getTime()) / 864e5) + 1;
  const prev: [string, string] = [addDays(rng[0], -span), addDays(rng[0], -1)];
  const prevPass = makePredicate(ds, filters, 'date', prev);
  const prevRows = ds.remarks.filter(r => r.day >= prev[0] && r.day <= prev[1] && prevPass(r));

  const G = new Map(aggregate(cur, r => r.author, ctx).map(g => [g.k, g]));
  const P = new Map(aggregate(prevRows, r => r.author, ctx).map(g => [g.k, g]));

  const remarked = remarkedSet(ds);
  const branchSet = new Set(filters.branch);
  const W = new Map<number, [number, number]>();
  let walkinsFrom = '9999';
  for (const a of ds.walkins) {
    if (a.day < walkinsFrom) walkinsFrom = a.day;
    if (a.day < rng[0] || a.day > rng[1] || (branchSet.size && !branchSet.has(a.branch))) continue;
    const w = W.get(a.owner) || [0, 0];
    w[0]++;
    if (remarked.has(`${a.day}|${a.lead}`)) w[1]++;
    W.set(a.owner, w);
  }

  const days = dayList(rng[0], rng[1]).slice(-SCORECARD_STRIP_DAYS);
  const daily = new Map<string, Map<string, number>>();
  for (const r of cur) {
    if (r.day < days[0]) continue;
    const k = `${r.author}|${r.day}`;
    let lm = daily.get(k);
    if (!lm) { lm = new Map(); daily.set(k, lm); }
    addLead(lm, r, ctx);
  }

  const bmSet = new Set(filters.bm);
  const keys = new Set([...G.keys(), ...[...W.keys()].filter(k => !bmSet.size || bmSet.has(k))]);
  let list: ScoreRow[] = [...keys].map(k => {
    const g = G.get(k);
    const pg = P.get(k);
    const w = W.get(k) || [0, 0];
    const L = g ? g.L : leadStats(new Map());
    return {
      k, name: ds.dicts.person[k] || '', ec: g ? ds.dicts.branch[topBranch(g)] || '' : '', L, avg: L.avg,
      prev: pg && pg.L.n >= 3 ? pg.L.avg : null,
      all4: L.n ? L.d[4] / L.n : 0, none: L.n ? L.d[0] / L.n : 0, cov: L.cov.map(x => (L.n ? x / L.n : 0)),
      wa: w[0], wr: w[1], wp: w[0] ? w[1] / w[0] : null,
    };
  }).filter(x => x.name && x.name !== 'None');
  if (branchSet.size) list = list.filter(x => x.L.n || x.wa);

  const ranked = list.filter(x => x.L.n >= rankMin).sort((a, b) => b.avg - a.avg);
  ranked.forEach((x, i) => { x.qr = i + 1; });

  const total = aggregate(cur, () => 'all', ctx)[0]?.L ?? leadStats(new Map());
  const walkTotal = list.reduce((t, x) => [t[0] + x.wa, t[1] + x.wr], [0, 0]);

  return { list, rankedCount: ranked.length, rng, span, days, daily, total, walkTotal, walkinsFrom };
}
