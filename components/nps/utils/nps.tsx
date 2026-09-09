'use client';

import { Bucket, Cat, CatFilter, Metrics, Understood } from '../types/nps';
import { NPSRow } from '@/lib/mockApi';

export const bucketOf = (score: number): Bucket =>
  score >= 9 ? 'Promoter' : score >= 7 ? 'Passive' : 'Detractor';

export const catOf = (score: number): Cat =>
  score >= 9 ? 'promoter' : score >= 7 ? 'passive' : 'detractor';

const isSubmitted = (r: NPSRow) => r.status === 'submitted' && r.score != null;

const customerKey = (r: NPSRow) => (r.contact != null ? `c:${r.contact}` : `f:${r.id}`);

const visitedAt = (r: NPSRow) => `${r.visit_date} ${r.time}`;

export function uniqueCustomers(rows: NPSRow[]): NPSRow[] {
  const latest: Record<string, NPSRow> = {};
  rows.forEach(r => {
    const k = customerKey(r);
    if (!latest[k] || visitedAt(r) > visitedAt(latest[k])) latest[k] = r;
  });
  return Object.values(latest);
}

export const uniqueReviews = (rows: NPSRow[]) => uniqueCustomers(rows.filter(isSubmitted));

export const fmtDate = (d: string) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const fmtPhone = (c: number | null) => (c == null ? '—' : `+91 ${c}`);

export const fmtSigned = (n: number) => `${n > 0 ? '+' : ''}${n}`;

const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const todayISO = () => toISO(new Date());

const monthStartISO = () => { const d = new Date(); return toISO(new Date(d.getFullYear(), d.getMonth(), 1)); };

export const addDaysISO = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return toISO(d); };

export const daysBetweenISO = (a: string, b: string) =>
  Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);

export const daysSince = (visitDate: string) => (visitDate ? daysBetweenISO(visitDate, todayISO()) : 0);

export function presetRange(key: string): { from: string; to: string } {
  const today = todayISO();
  switch (key) {
    case 'today': return { from: today, to: today };
    case 'yesterday': { const y = addDaysISO(today, -1); return { from: y, to: y }; }
    case 'last7': return { from: addDaysISO(today, -6), to: today };
    case 'last30': return { from: addDaysISO(today, -29), to: today };
    case 'thismonth': return { from: monthStartISO(), to: today };
    default: return { from: addDaysISO(today, -29), to: today };
  }
}

export function npsOf(rows: NPSRow[]): number | null {
  const c = uniqueReviews(rows);
  if (!c.length) return null;
  let p = 0, d = 0;
  c.forEach(r => { const b = catOf(r.score!); if (b === 'promoter') p++; else if (b === 'detractor') d++; });
  return Math.round((p / c.length - d / c.length) * 100);
}

export const okSearch = (r: NPSRow, q: string) => {
  if (!q) return true;
  return (`${r.name || ''} ${fmtPhone(r.contact)}`).toLowerCase().includes(q.toLowerCase());
};

export const okBm = (r: NPSRow, bms: string[]) => (bms.length ? bms.includes(r.bm) : true);

export const okUnderstood = (r: NPSRow, u: Understood) => {
  if (u === 'all') return true;
  if (!isSubmitted(r)) return false;
  return u === 'yes' ? r.understood === true : r.understood === false;
};

export const okCategory = (r: NPSRow, c: CatFilter) => {
  if (c === 'all') return true;
  if (!isSubmitted(r)) return false;
  return catOf(r.score!) === c;
};

export function computeMetrics(base: NPSRow[], u: Understood, c: CatFilter): Metrics {
  const analysis = base.filter(r => okUnderstood(r, u) && okCategory(r, c));
  const completed = uniqueReviews(analysis);
  const total = completed.length;
  const customers = uniqueCustomers(base).length;
  return {
    nps: npsOf(analysis),
    total,
    responseRate: customers ? Math.round(uniqueReviews(base).length / customers * 100) : null,
    promoterPct: total ? Math.round(completed.filter(r => catOf(r.score!) === 'promoter').length / total * 100) : null,
    detractorPct: total ? Math.round(completed.filter(r => catOf(r.score!) === 'detractor').length / total * 100) : null,
    avg: total ? completed.reduce((a, r) => a + r.score!, 0) / total : null,
  };
}

export function exportCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
