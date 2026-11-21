'use client';

import type { StoreSlotCalendar } from '@/lib/api';
import { CITIES, siteAuditRoleFromPermissions } from '../../shared';
import { DAYS_SHORT, MORNING_CUTOFF_MIN, SLOT_DEFS, STORE_CITY } from './constants';
import type { Overrider, SlotDef } from './types';

export const cityOfStore = (store: string | null) => (store && STORE_CITY[store]) || CITIES[0];

export function dstr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export const today = (() => {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
})();

export function morningCutoffHit(date: string): boolean {
  const tmr = new Date(today);
  tmr.setDate(tmr.getDate() + 1);
  if (date !== dstr(tmr)) return false;
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes() >= MORNING_CUTOFF_MIN;
}

export function windowsOf(cal: StoreSlotCalendar | null): SlotDef[] {
  if (!cal || !cal.windows.length) return SLOT_DEFS;
  return cal.windows.map((w) => ({ id: w.id, label: w.label, rangeEnd: w.range_end, startMin: w.start_min, endMin: w.end_min, group: w.group }));
}

export function fmtSlotId(id: string, windows: SlotDef[]) {
  const s = windows.find((x) => x.id === id) || SLOT_DEFS.find((x) => x.id === id);
  if (s) return s.label;
  const m = /^(\d{1,2}):(\d{2})$/.exec(id || '');
  if (!m) return '—';
  const h = Number(m[1]);
  return (h % 12 || 12) + ':' + m[2] + ' ' + (h < 12 ? 'AM' : 'PM');
}

export function previousSlotLabel(id: string, windows: SlotDef[]): string {
  const i = windows.findIndex((s) => s.id === id);
  return i > 0 ? windows[i - 1].label : '';
}

export function genSlotPI(store: string) {
  const ts = Date.now().toString().slice(-9);
  const code = store.replace(/\s+/g, '').toUpperCase().slice(0, 6);
  return 'SRES-' + code + '-' + ts;
}

export function readOverrider(): Overrider {
  try {
    const raw = localStorage.getItem('materialdepot_user');
    const user = raw ? JSON.parse(raw) : null;
    if (!user) return { level: null, name: '' };
    const role = siteAuditRoleFromPermissions(user.individualPermissions);
    const level = role === 'admin' || user.role === 'admin' ? 'admin' : role === 'service_mgr' ? 'sm' : null;
    return { level, name: user.name || '' };
  } catch {
    return { level: null, name: '' };
  }
}

export function buildDateChips(openDates: string[], withClosedDays: boolean) {
  const open = new Set(openDates);
  const last = openDates[openDates.length - 1];
  const chips: Array<{ ds: string; lbl: string; num: number; closed: boolean }> = [];
  if (!last) return chips;
  for (let i = 0; i < 60; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const ds = dstr(d);
    if (ds > last) break;
    if (!open.has(ds) && !withClosedDays) continue;
    const lbl = i === 0 ? 'Today' : i === 1 ? 'Tmrw' : DAYS_SHORT[d.getDay()];
    chips.push({ ds, lbl, num: d.getDate(), closed: !open.has(ds) });
  }
  return chips;
}
