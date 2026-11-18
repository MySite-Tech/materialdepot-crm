import { JOB_STATUS, fmtDateA } from '../../shared';
import { categoryFor } from '../../data/audit-registry';
import { loadSlots, slotLabel } from '../../install-ops/utils';
import type { EcState, Job, JobCategory } from './types';

export const JOB_CATEGORIES = ['flooring', 'wallpaper', 'wallpanel'] as const;

export const catLabel = (t?: string | null) => categoryFor(t).label;

export function skuCategories(skus: any[] | null | undefined): JobCategory[] {
  const ids = [...new Set((skus || []).map((s: any) => s && s.type).filter((t: string) => (JOB_CATEGORIES as readonly string[]).includes(t)))] as string[];
  return ids.map((id) => ({ id, label: catLabel(id), installer: null }));
}

export function jobLeadKey(pi: string): string {
  return String(pi || '').trim().replace(/\s*-\s*(R|\d+)$/i, '');
}

export function ecName(ec: EcState, j: Job): string {
  if (ec.status === 'loading') return '…';
  if (ec.status === 'error') return 'Unknown';
  const raw = ec.byLead[j.leadKey];
  return raw ? raw.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : '—';
}

export function slotText(ids: Array<string | null | undefined>): string {
  const fl = loadSlots('fl'), wp = loadSlots('wp');
  const labels = [...new Set(ids.filter(Boolean).map((id) => slotLabel(id, fl, wp)))];
  return labels.join(' + ');
}

export function installBooking(subjobs: any[]): { date: string | null; slot: string; dates: string[] } {
  const bookings: Array<{ date: string; slots: string[] }> = [];
  (subjobs || []).forEach((sj: any) => {
    const asgns = sj.assignments && sj.assignments.length ? sj.assignments : (sj.date ? [{ date: sj.date, mode: 'standard', slots: [sj.slot] }] : []);
    asgns.forEach((a: any) => {
      const slots = a.slots && a.slots.length ? a.slots : [sj.slot];
      const days = a.mode === 'custom' ? a.dates || [] : a.date ? [a.date] : [];
      days.forEach((d: string) => bookings.push({ date: d, slots }));
    });
  });
  const dates = [...new Set(bookings.map((b) => b.date))].sort();
  const first = dates[0] || null;
  return { date: first, slot: first ? slotText(bookings.filter((b) => b.date === first).flatMap((b) => b.slots)) : '', dates };
}

export function whenText(j: Job): string {
  if (!j.date) return '—';
  return fmtDateA(j.date) + (j.slot ? ' · ' + j.slot : '');
}

export function downloadJobsCsv(rows: Job[], ec: EcState, from: string, to: string) {
  const head = ['Job ID', 'Type', 'Customer', 'EC', 'Categories', 'Category — Installer', 'Assigned To', 'Status', 'Date', 'Slot', 'Install Dates', 'City'];
  const cell = (v: any) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const body = rows.map((j) => [
    j.id, j.type === 'audit' ? 'Audit' : 'Install', j.customer, ecName(ec, j),
    [...new Set(j.cats.map((c) => c.label))].join(' + '),
    j.cats.filter((c) => c.installer).map((c) => c.label + ' — ' + c.installer).join('; '),
    j.assignee || 'Unassigned', JOB_STATUS[j.status]?.l || j.status, j.date || '', j.slot,
    (j.installDates || []).join(' '), j.city || '',
  ].map(cell).join(','));
  const blob = new Blob([[head.map(cell).join(',')].concat(body).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'jobs' + (from || to ? '_' + (from || 'start') + '_to_' + (to || 'today') : '') + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}
