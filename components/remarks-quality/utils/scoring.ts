import type { PointerPatternKey } from '@/lib/api';

import type { LeadStats, Remark, ScoreCtx, Thresholds } from '../types';

export const bits = (p: number) => (p & 1) + ((p >> 1) & 1) + ((p >> 2) & 1) + ((p >> 3) & 1);

export const leadKey = (r: Remark) => r.lead || `#${r.id}`;

export const isCopy = (r: Remark, t: Thresholds) => r.copies >= 2 && r.len > t[0];

export const ptOf = (r: Remark, ctx: ScoreCtx) => (ctx.copyNothing && isCopy(r, ctx.thresholds) ? 0 : r.pt);

export const bucket = (len: number, t: Thresholds) => (len <= t[0] ? 0 : len <= t[1] ? 1 : len <= t[2] ? 2 : 3);

export const bucketOf = (r: Remark, ctx: ScoreCtx) =>
  ctx.copyNothing && isCopy(r, ctx.thresholds) ? 0 : bucket(r.len, ctx.thresholds);

export function addLead(lm: Map<string, number>, r: Remark, ctx: ScoreCtx) {
  const k = leadKey(r);
  const p = ptOf(r, ctx);
  const v = lm.get(k);
  lm.set(k, ctx.leadMode === 'union' ? (v ?? 0) | p : v === undefined || bits(p) > bits(v) ? p : v);
}

export function leadStats(lm: Map<string, number>): LeadStats {
  const L: LeadStats = { n: lm.size, sum: 0, d: [0, 0, 0, 0, 0], cov: [0, 0, 0, 0], avg: 0 };
  for (const p of lm.values()) {
    const s = bits(p);
    L.sum += s;
    L.d[s]++;
    for (let i = 0; i < 4; i++) if ((p >> i) & 1) L.cov[i]++;
  }
  L.avg = L.n ? L.sum / L.n : 0;
  return L;
}

export function statsFor(rows: Remark[], ctx: ScoreCtx) {
  const lm = new Map<string, number>();
  for (const r of rows) addLead(lm, r, ctx);
  return leadStats(lm);
}

export function markCopies(remarks: Remark[]) {
  const seen = new Map<string, Set<string>>();
  const key = (r: Remark) => `${r.author}|${r.day}|${r.th}`;
  for (const r of remarks) {
    if (r.auto) continue;
    let s = seen.get(key(r));
    if (!s) { s = new Set(); seen.set(key(r), s); }
    s.add(r.lead);
  }
  for (const r of remarks) r.copies = r.auto ? 0 : seen.get(key(r))!.size;
}

const SYSTEM_PREFIX = /^(deal marked lost:|order_lost:)/i;
const SYSTEM_SLUG = /^[a-z]+(_[a-z]+)+$/;

export const isSystemText = (t: string) => SYSTEM_PREFIX.test(t.trim()) || SYSTEM_SLUG.test(t.trim());

export type PointerRegexes = Record<PointerPatternKey, RegExp>;

export const compilePointers = (rx: Record<PointerPatternKey, string>): PointerRegexes =>
  Object.fromEntries(
    Object.entries(rx).map(([k, v]) => [k, new RegExp(v.split('\\y').join('\\b'), 'i')]),
  ) as PointerRegexes;

export const pointersOfText = (t: string, rx: PointerRegexes) =>
  (rx.need.test(t) ? 1 : 0)
  | (rx.stuck.test(t) ? 2 : 0)
  | (rx.who.test(t) ? 4 : 0)
  | ((rx.date.test(t) && rx.act.test(t)) || rx.nextl.test(t) ? 8 : 0);
