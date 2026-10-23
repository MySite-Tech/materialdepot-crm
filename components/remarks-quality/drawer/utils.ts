import { PNAME } from '../constants';
import type { DrillGroup, Remark, ScoreCtx, ScoreMode } from '../types';
import { avg1, fmt, pct } from '../utils/format';
import { addLead, bits, bucketOf, isCopy, leadKey, leadStats } from '../utils/scoring';

export function drawerSummary(all: Remark[], ctx: ScoreCtx, mode: ScoreMode) {
  const b = [0, 0, 0, 0];
  let cp = 0;
  const lm = new Map<string, number>();
  for (const r of all) {
    b[bucketOf(r, ctx)]++;
    if (isCopy(r, ctx.thresholds)) cp++;
    addLead(lm, r, ctx);
  }
  const LS = leadStats(lm);
  const n = all.length;
  const tabs: Array<[number, string, number]> = mode === 'pt'
    ? [[-1, 'All', LS.n], ...[4, 3, 2, 1, 0].map(s => [100 + s, `Leads ${s}/4`, LS.d[s]] as [number, string, number]), [9, 'Copy-pasted', cp]]
    : [[-1, 'All', n], [0, 'Nothing', b[0]], [1, 'Minimal', b[1]], [2, 'Sufficient', b[2]], [3, 'Detailed', b[3]], [9, 'Copy-pasted', cp]];
  const line = mode === 'pt'
    ? `${fmt(LS.n)} leads · ${fmt(n)} remarks · avg ${avg1(LS.avg)} / 4 · all 4: ${pct(LS.d[4], LS.n)}% · none: ${pct(LS.d[0], LS.n)}% · ${PNAME.map((x, i) => `${x} ${pct(LS.cov[i], LS.n)}%`).join(' · ')}`
    : `${fmt(n)} remarks · Nothing ${pct(b[0], n)}% · Minimal ${pct(b[1], n)}% · Sufficient ${pct(b[2], n)}% · Detailed ${pct(b[3], n)}% · Copy-pasted ${pct(cp, n)}%`;
  return { lm, tabs, line };
}

export function rowsForTab(all: Remark[], tab: number, lm: Map<string, number>, ctx: ScoreCtx) {
  if (tab < 0) return all;
  if (tab === 9) return all.filter(r => isCopy(r, ctx.thresholds));
  if (tab >= 100) return all.filter(r => bits(lm.get(leadKey(r)) ?? 0) === tab - 100);
  return all.filter(r => bucketOf(r, ctx) === tab);
}

export const groupKey = (r: Remark, group: DrillGroup): string | number =>
  group === 'bm' ? r.author : group === 'lead' ? r.lead : r.day;

export function groupRows(rows: Remark[], group: DrillGroup, personName: (k: number) => string) {
  if (group === 'bm') return [...rows].sort((a, b) => personName(a.author).localeCompare(personName(b.author)) || b.id - a.id);
  if (group === 'lead') return [...rows].sort((a, b) => a.lead.localeCompare(b.lead) || b.id - a.id);
  return rows;
}
