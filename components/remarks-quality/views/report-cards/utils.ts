import { SKIPPED_CARD_BRANCHES } from '../../constants';
import type { Dataset, Filters, LeadStats, Remark, ScoreCtx } from '../../types';
import { aggregate } from '../../utils/aggregate';
import { addDays, istHour, today } from '../../utils/dates';
import { makePredicate } from '../../utils/filtering';
import { bits, leadKey, ptOf, statsFor } from '../../utils/scoring';

export interface Coverage { n: number; rem: number; own: Map<number, [number, number]> }

export interface CardBm { k: number; name: string; L: LeadStats | null; att: number; rem: number; cov: number | null }

export interface Card {
  br: number;
  name: string;
  L: LeadStats;
  L7: LeadStats;
  trend: Array<{ d: string; L: LeadStats | null }>;
  first: LeadStats;
  fol: LeadStats;
  bms: CardBm[];
  best?: Remark;
  skipped: number;
  cv: Coverage;
  cov: number;
  cov7: number | null;
  qr: number;
  cr: number;
}

export function defaultCardDay(ds: Dataset, filters: Filters) {
  const t = today();
  const pass = makePredicate(ds, filters, 'date');
  return istHour() >= 18 && ds.remarks.some(r => r.day === t && pass(r)) ? t : addDays(t, -1);
}

function groupBy<T, K>(rows: T[], key: (x: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of rows) { const k = key(x); let l = m.get(k); if (!l) { l = []; m.set(k, l); } l.push(x); }
  return m;
}

export function firstFullDays(ds: Dataset, ctx: ScoreCtx) {
  const done4 = new Map<string, string>();
  for (const r of ds.remarks) {
    if (r.auto || bits(ptOf(r, ctx)) < 4) continue;
    const k = leadKey(r);
    if (!done4.has(k) || r.day < done4.get(k)!) done4.set(k, r.day);
  }
  return done4;
}

export function buildCards(ds: Dataset, filters: Filters, ctx: ScoreCtx, d: string, done4: Map<string, string> | null) {
  const pass = makePredicate(ds, filters, 'date');
  const prev7 = [...Array(7)].map((_, i) => addDays(d, -7 + i));
  const trendDays = [...prev7.slice(1), d];
  const inWindow = (x: string) => x >= prev7[0] && x <= d;

  const byBr = groupBy(ds.remarks.filter(r => inWindow(r.day) && pass(r)), r => r.branch);

  const skip = (r: Remark) => !!done4 && done4.has(leadKey(r)) && done4.get(leadKey(r))! < r.day;

  const attByDay = groupBy(ds.walkins, w => w.day);
  const remByDay = groupBy(ds.remarks.filter(r => !r.auto && inWindow(r.day)), r => r.day);
  const covDay = (x: string) => {
    const leads = new Map<string, { br: number; owner: number; rem: boolean }>();
    for (const a of attByDay.get(x) || []) leads.set(a.lead, { br: a.branch, owner: a.owner, rem: false });
    for (const r of remByDay.get(x) || []) { const e = leads.get(r.lead); if (e) e.rem = true; }
    const out = new Map<number, Coverage>();
    for (const e of leads.values()) {
      let g = out.get(e.br);
      if (!g) { g = { n: 0, rem: 0, own: new Map() }; out.set(e.br, g); }
      g.n++;
      if (e.rem) g.rem++;
      const o = g.own.get(e.owner) || [0, 0];
      o[0]++;
      if (e.rem) o[1]++;
      g.own.set(e.owner, o);
    }
    return out;
  };
  const covToday = covDay(d);
  const cov7 = prev7.map(covDay);

  const cards: Card[] = [];
  for (const br of new Set([...byBr.keys(), ...covToday.keys()])) {
    const name = ds.dicts.branch[br];
    if (!name || SKIPPED_CARD_BRANCHES.includes(name)) continue;
    const rows = byBr.get(br) || [];
    const allDay = rows.filter(r => r.day === d);
    const dayRows = allDay.filter(r => !skip(r));
    const cv = covToday.get(br) || { n: 0, rem: 0, own: new Map() };
    if (!dayRows.length && !cv.n) continue;

    const c7 = cov7.reduce((t, m) => { const g = m.get(br); return g ? [t[0] + g.n, t[1] + g.rem] : t; }, [0, 0]);
    const sc = new Map(aggregate(dayRows, r => r.author, ctx).map(g => [g.k, g]));
    const bms = [...new Set([...sc.keys(), ...cv.own.keys()])]
      .map(k => {
        const g = sc.get(k);
        const o = cv.own.get(k) || [0, 0];
        return { k, name: ds.dicts.person[k] || '', L: g ? g.L : null, att: o[0], rem: o[1], cov: o[0] ? o[1] / o[0] : null };
      })
      .filter(x => x.name)
      .sort((a, b) => ((b.L?.avg ?? 0) * (b.cov ?? 1)) - ((a.L?.avg ?? 0) * (a.cov ?? 1)) || (b.att + (b.L?.n ?? 0)) - (a.att + (a.L?.n ?? 0)));

    cards.push({
      br, name, cv, bms,
      L: statsFor(dayRows, ctx),
      L7: statsFor(rows.filter(r => r.day < d && !skip(r)), ctx),
      trend: trendDays.map(x => { const rr = rows.filter(r => r.day === x && !skip(r)); return { d: x, L: rr.length ? statsFor(rr, ctx) : null }; }),
      first: statsFor(dayRows.filter(r => ds.dicts.rk[r.rk] === 'first'), ctx),
      fol: statsFor(dayRows.filter(r => ds.dicts.rk[r.rk] !== 'first'), ctx),
      best: [...dayRows].sort((a, b) => bits(ptOf(b, ctx)) - bits(ptOf(a, ctx)) || b.len - a.len)[0],
      skipped: new Set(allDay.filter(skip).map(leadKey)).size,
      cov: cv.n ? cv.rem / cv.n : 0,
      cov7: c7[0] ? c7[1] / c7[0] : null,
      qr: 0, cr: 0,
    });
  }

  [...cards].sort((a, b) => b.L.avg - a.L.avg || b.L.n - a.L.n).forEach((c, i) => { c.qr = i + 1; });
  [...cards].sort((a, b) => b.cov - a.cov || b.cv.n - a.cv.n).forEach((c, i) => { c.cr = i + 1; });
  return cards.sort((a, b) => a.qr + a.cr - (b.qr + b.cr) || a.cr - b.cr);
}
