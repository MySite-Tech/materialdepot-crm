import { DATE_PRESETS } from '../constants/coe';
import { DatePresetKey, DateRange, ReviewProgress } from '../types/coe';
export function todayStr(): string {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function addDays(ds: string, n: number): string {
  const d = new Date(ds + 'T00:00');
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00').getTime() - new Date(a + 'T00:00').getTime()) / 86400000);
}

export function fmtRangeLabel(preset: DatePresetKey, r: DateRange): string {
  const named = DATE_PRESETS.find((p) => p.k === preset);
  if (named) return named.l;
  if (r.from && r.to) return r.from === r.to ? fmtDateShort(r.from) : fmtDateShort(r.from) + ' → ' + fmtDateShort(r.to);
  return 'All time';
}

function fmtDateShort(ds: string): string {
  const d = new Date(ds + 'T00:00');
  if (Number.isNaN(d.getTime())) return ds;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export function mapUrl(a: string): string {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a);
}

export const emptyProgress = (): ReviewProgress => ({ due: 0, called: 0, scored: 0 });
