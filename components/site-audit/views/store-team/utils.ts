'use client';

import { CITIES } from '../../shared';
import { DAYS_SHORT, MORNING_CUTOFF_MIN, SLOT_DEFS, STORE_CITY } from './constants';
import { SlotDef } from './types';

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

function slotsConflict(slotA: SlotDef, slotB: SlotDef) {
  const gapAB = slotB.startMin - slotA.endMin;
  const gapBA = slotA.startMin - slotB.endMin;
  if (gapAB < 0 && gapBA < 0) return true;
  return (gapAB >= 0 && gapAB < 120) || (gapBA >= 0 && gapBA < 120);
}

export function getAvailability(slotId: string, dayOrders: any[], auditorCount: number, capBlocked: Set<string>) {
  const slot = SLOT_DEFS.find((s) => s.id === slotId);
  if (!slot) return { available: 0, total: auditorCount, used: 0 };
  const blockedAuditors = new Set<string>(capBlocked);
  let reservationConflicts = 0;
  for (const o of dayOrders) {
    if (o.status === 'deleted' || o.status === 'slot_converted') continue;
    if (o.status === 'slot_reserved' && !o.auditor_id) {
      const nm = (o.customer_name || '').trim().toLowerCase();
      const absorbed = dayOrders.some(
        (r) =>
          r.slot === o.slot &&
          r.status !== 'deleted' &&
          r.status !== 'slot_reserved' &&
          r.status !== 'slot_converted' &&
          ((o.po && r.pi === o.po) || (nm && (r.customer_name || '').trim().toLowerCase() === nm))
      );
      if (absorbed) continue;
    }
    const oSlot = SLOT_DEFS.find((s) => s.id === o.slot);
    if (!oSlot || !slotsConflict(slot, oSlot)) continue;
    if (o.auditor_id) {
      blockedAuditors.add(o.auditor_id);
    } else {
      reservationConflicts++;
    }
  }
  const used = blockedAuditors.size + reservationConflicts;
  return { available: Math.max(0, auditorCount - used), total: auditorCount, used };
}

export function genSlotPI(store: string) {
  const ts = Date.now().toString().slice(-9);
  const code = store.replace(/\s+/g, '').toUpperCase().slice(0, 6);
  return 'SRES-' + code + '-' + ts;
}

export function buildDateChips() {
  const t = today;
  const chips: Array<{ ds: string; lbl: string; num: number }> = [];
  for (let i = 0; chips.length < 14 && i < 30; i++) {
    const d = new Date(t);
    d.setDate(t.getDate() + i);
    if (d.getDay() === 0) continue;
    const ds = dstr(d);
    const lbl = i === 0 ? 'Today' : i === 1 ? 'Tmrw' : DAYS_SHORT[d.getDay()];
    chips.push({ ds, lbl, num: d.getDate() });
  }
  return chips;
}
