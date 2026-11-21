import { coeCalls, installReviewRows, mapCoeAudit, mapCoeInstall } from '../../coe-ops';
import type { CoeCall } from '../../coe-ops/types';
import { typeLabel } from '../../data/audit-registry';
import { NPS_DETRACTOR_MAX, NPS_PROMOTER_MIN } from '../constants';
import type { NpsBand, NpsJob, NpsRow, NpsSummary } from '../types';

function latestScored(calls: CoeCall[]): CoeCall | null {
  let best: CoeCall | null = null;
  for (const c of calls) {
    if (!c.ratings || !(Number(c.ratings.q1) > 0)) continue;
    if (!best || String(c.ts) > String(best.ts)) best = c;
  }
  return best;
}

function score(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function avg(vals: Array<number | null>): number | null {
  const vs = vals.filter((v): v is number => v != null);
  return vs.length ? Math.round((vs.reduce((a, b) => a + b, 0) / vs.length) * 10) / 10 : null;
}

export function bandOf(s: number): NpsBand {
  if (s >= NPS_PROMOTER_MIN) return 'promoter';
  if (s <= NPS_DETRACTOR_MAX) return 'detractor';
  return 'neutral';
}

export function auditJobs(raw: any[]): NpsJob[] {
  return raw.map(mapCoeAudit).map((o) => {
    const r = latestScored(coeCalls(o))?.ratings;
    const q1 = score(r?.q1);
    return {
      enq: o.pi || String(o.id), name: o.name, phone: o.phone, city: o.city, date: o.date,
      staff: o.auditorName, q1, q3: score(r?.q3),
      target: { orderId: String(o.id), sjId: null, label: 'Site audit', staffEmail: o.auditorEmail, staffName: o.auditorName, q1 },
    };
  });
}

export function installJobs(raw: any[]): NpsJob[] {
  const cityById = new Map<string, string | null>(raw.map((r) => [String(r.id), r.city || null]));
  return installReviewRows(raw.map(mapCoeInstall)).map(({ order, sj, completedOn, installer }) => {
    const r = latestScored(sj.coe_review?.calls || [])?.ratings;
    const q1 = score(r?.q1);
    return {
      enq: order.pi || String(order.id), name: order.name, phone: order.phone,
      city: cityById.get(String(order.id)) ?? null, date: completedOn,
      staff: installer.name, q1, q3: score(r?.q3),
      target: {
        orderId: String(order.id), sjId: String(sj.id), label: typeLabel(sj.type) + ' installation',
        staffEmail: installer.email, staffName: installer.name, q1,
      },
    };
  });
}

export function groupByEnq(jobs: NpsJob[]): NpsRow[] {
  const groups = new Map<string, NpsJob[]>();
  for (const j of jobs) groups.set(j.enq, [...(groups.get(j.enq) || []), j]);
  const rows: NpsRow[] = [];
  groups.forEach((js, enq) => {
    const scored = js.filter((j) => j.q1 != null);
    const overall = avg(scored.map((j) => j.q1));
    rows.push({
      enq,
      name: js.find((j) => j.name)?.name || '',
      phone: js.find((j) => j.phone)?.phone || '',
      city: js.find((j) => j.city)?.city || null,
      date: js.reduce<string | null>((d, j) => (j.date && (!d || j.date > d) ? j.date : d), null),
      staff: Array.from(new Set(js.map((j) => j.staff).filter((s): s is string => !!s))),
      overall,
      clean: avg(scored.map((j) => j.q3)),
      jobs: js.length,
      scoredJobs: scored.length,
      band: overall == null ? null : bandOf(overall),
      targets: js.map((j) => j.target),
    });
  });
  return rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

export function summarize(rows: NpsRow[]): NpsSummary {
  let prom = 0, neu = 0, det = 0;
  for (const r of rows) {
    if (r.band === 'promoter') prom++;
    else if (r.band === 'neutral') neu++;
    else if (r.band === 'detractor') det++;
  }
  const scored = prom + neu + det;
  return {
    nps: scored ? Math.round(((prom - det) / scored) * 100) : null,
    prom, neu, det, scored,
    unscored: rows.length - scored,
    avgClean: avg(rows.map((r) => r.clean)),
  };
}

export function matchesSearch(r: NpsRow, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [r.enq, r.name, r.phone, ...r.staff].some((v) => String(v || '').toLowerCase().includes(s));
}
