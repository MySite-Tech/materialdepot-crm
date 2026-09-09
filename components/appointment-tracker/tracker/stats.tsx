'use client';

import { FootfallMap } from '../types/appointments';
import { EcReadyMap, ApptLead as Lead, ymd } from '@/lib/appointments/appt-shared';

export function computeStats(leads: Lead[], ec: EcReadyMap) {
  const todayStr = ymd(new Date());
  let total = 0, today = 0, ready = 0, notReady = 0, unmarked = 0, visited = 0;
  for (const l of leads) {
    if (!l.cfVisitScheduled) continue;
    total++;
    if (ymd(new Date(l.cfVisitScheduled)) === todayStr) today++;
    if (l.convertedAt) visited++;
    const s = ec[l.id]?.state;
    if (s === "ready") ready++;
    else if (s === "not_ready") notReady++;
    else unmarked++;
  }
  return { total, today, ready, notReady, unmarked, visited };
}

export function bookedVsVisitedByDate(leads: Lead[]): { date: string; booked: number; visited: number }[] {
  const map = new Map<string, { booked: number; visited: number }>();
  for (const l of leads) {
    if (!l.cfVisitScheduled) continue;
    const key = ymd(new Date(l.cfVisitScheduled));
    const row = map.get(key) ?? { booked: 0, visited: 0 };
    row.booked++;
    if (l.convertedAt) row.visited++;
    map.set(key, row);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, ...v }));
}

export function sumFootfallForDate(footfall: FootfallMap, dateStr: string): number {
  let total = 0;
  for (const [key, count] of Object.entries(footfall)) {
    if (key.startsWith(`${dateStr}|`)) total += count;
  }
  return total;
}

export function footfallBySlot(footfall: FootfallMap, from: string, to: string): Record<string, number> {
  const bySlot: Record<string, number> = {};
  for (const [key, count] of Object.entries(footfall)) {
    const [date, slotKey] = key.split("|");
    if (!slotKey || date < from || date > to) continue;
    bySlot[slotKey] = (bySlot[slotKey] ?? 0) + count;
  }
  return bySlot;
}
