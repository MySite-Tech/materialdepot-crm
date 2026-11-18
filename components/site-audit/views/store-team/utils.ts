'use client';

import { CITIES, siteAuditRoleFromPermissions } from '../../shared';
import { DAYS_SHORT, MORNING_CUTOFF_MIN, SLOT_DEFS, STORE_CITY } from './constants';
import type { Overrider } from './types';

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

export function fmtSlotId(id: string) {
  const s = SLOT_DEFS.find((x) => x.id === id);
  return s ? s.label : '—';
}

export function previousSlotLabel(id: string): string {
  const i = SLOT_DEFS.findIndex((s) => s.id === id);
  return i > 0 ? SLOT_DEFS[i - 1].label : '';
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
