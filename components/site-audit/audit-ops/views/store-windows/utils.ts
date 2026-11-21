import { sbGet } from '../../../shared';
import { STORE_WINDOWS_SETTING } from './constants';
import type { StoreWindowsValue, WindowRow } from './types';

export function minutesOf(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || '');
  if (!m) return null;
  const h = Number(m[1]), mm = Number(m[2]);
  return h > 23 || mm > 59 ? null : h * 60 + mm;
}

export function hhmm(min: number): string {
  const c = Math.max(0, Math.min(23 * 60 + 59, min));
  return String(Math.floor(c / 60)).padStart(2, '0') + ':' + String(c % 60).padStart(2, '0');
}

export function clockLabel(t: string): string {
  const min = minutesOf(t);
  if (min == null) return t;
  const h = Math.floor(min / 60);
  return (h % 12 || 12) + ':' + String(min % 60).padStart(2, '0') + ' ' + (h < 12 ? 'AM' : 'PM');
}

export function windowsError(rows: WindowRow[]): string | null {
  if (!rows.length) return 'Keep at least one window.';
  const sorted = [...rows].sort((a, b) => (minutesOf(a.start) ?? 0) - (minutesOf(b.start) ?? 0));
  for (let i = 0; i < sorted.length; i++) {
    const s = minutesOf(sorted[i].start), e = minutesOf(sorted[i].end);
    if (s == null || e == null) return `Window ${i + 1}: set both a start and an end time.`;
    if (e <= s) return `${clockLabel(sorted[i].start)} window: the end must be after the start.`;
    const prevEnd = i ? minutesOf(sorted[i - 1].end) : null;
    if (prevEnd != null && s < prevEnd) return `${clockLabel(sorted[i - 1].start)} and ${clockLabel(sorted[i].start)} windows overlap.`;
  }
  return null;
}

export function sortWindows(rows: WindowRow[]): WindowRow[] {
  return [...rows].sort((a, b) => (minutesOf(a.start) ?? 0) - (minutesOf(b.start) ?? 0));
}

export async function readStoreWindows(): Promise<{ id: string | null; value: StoreWindowsValue } | null> {
  const r = await sbGet('app_settings?key=eq.' + STORE_WINDOWS_SETTING + '&select=id,value');
  if (!Array.isArray(r)) return null;
  const v = r[0]?.value;
  return { id: r[0]?.id || null, value: v && typeof v === 'object' && !Array.isArray(v) ? v : {} };
}
