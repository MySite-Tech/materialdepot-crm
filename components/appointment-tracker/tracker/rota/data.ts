'use client';

import { Branch } from '@/lib/appointments/appt-shared';

import { ROTA_FUTURE_DAYS, ROTA_PAST_DAYS, SHIFT_HOURS } from '../constants';
import { FootfallMap, RotaBranchData, RotaMember, RotaPlan, ShiftCode } from '../../types';
import { defaultPlan, emptyBranchData, isWeekend, mondayKeyOf, mondayOf, planBranchKeys } from '../utils';

function pruneBranchData(data: RotaBranchData): RotaBranchData {
  const memberIds = new Set(data.members.map((m) => m.id));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const minMonday = mondayOf(new Date(today.getTime() - ROTA_PAST_DAYS * 86400000));
  const maxMonday = mondayOf(new Date(today.getTime() + ROTA_FUTURE_DAYS * 86400000));
  const weeks: Record<string, Record<string, string>> = {};
  for (const [weekKey, byMember] of Object.entries(data.weeks)) {
    const weekDate = new Date(weekKey + "T00:00:00");
    if (weekDate.getTime() < minMonday.getTime() || weekDate.getTime() > maxMonday.getTime()) continue;
    const kept: Record<string, string> = {};
    for (const [memberId, code] of Object.entries(byMember)) {
      if (memberIds.has(memberId)) kept[memberId] = code;
    }
    if (Object.keys(kept).length > 0) weeks[weekKey] = kept;
  }
  return { members: data.members, weeks };
}

function mergeWithDefaults(partial: unknown): RotaPlan {
  const base = defaultPlan();
  if (!partial || typeof partial !== "object") return base;
  const parsed = partial as Partial<RotaPlan>;
  for (const b of planBranchKeys(parsed)) {
    const raw = parsed.branches?.[b];
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.members)) continue;
    const members: RotaMember[] = raw.members
      .filter((m): m is RotaMember => !!m && typeof m.id === "string" && typeof m.name === "string");
    const weeks: Record<string, Record<string, string>> = {};
    if (raw.weeks && typeof raw.weeks === "object") {
      for (const [weekKey, byMember] of Object.entries(raw.weeks)) {
        if (!byMember || typeof byMember !== "object") continue;
        const kept: Record<string, string> = {};
        for (const [memberId, code] of Object.entries(byMember as Record<string, unknown>)) {
          if (typeof code === "string") kept[memberId] = code;
        }
        weeks[weekKey] = kept;
      }
    }
    base.branches[b] = pruneBranchData({ members, weeks });
  }
  return base;
}

export async function fetchPlan(): Promise<RotaPlan> {
  try {
    const res = await fetch("/api/resource-plan", { cache: "no-store" });
    if (!res.ok) return defaultPlan();
    const data = await res.json();
    return mergeWithDefaults(data?.plan);
  } catch { return defaultPlan(); }
}

export async function savePlan(p: RotaPlan, branch: Branch): Promise<void> {
  const branches = { [branch]: pruneBranchData(p.branches[branch] ?? emptyBranchData()) };
  const res = await fetch("/api/resource-plan", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan: { version: 2, branches } }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.error ?? `Save failed: ${res.status}`);
  }
}

function headcountForSlot(data: RotaBranchData, date: Date, slot: { startH: number; endH: number }): number {
  const week = data.weeks[mondayKeyOf(date)];
  if (!week) return 0;
  const dayIdx = (date.getDay() + 6) % 7;
  const weekend = isWeekend(date);
  const slotDur = slot.endH - slot.startH;
  let total = 0;
  for (const m of data.members) {
    const code = week[m.id]?.[dayIdx] as ShiftCode | "-" | undefined;
    if (!code || code === "-" || code === "o" || code === "l" || code === "c") continue;
    const hours = SHIFT_HOURS[code as "1" | "2" | "g"];
    if (!hours) continue;
    const [start, end] = weekend ? hours.weekend : hours.weekday;
    const overlap = Math.max(0, Math.min(end, slot.endH) - Math.max(start, slot.startH));
    total += overlap / slotDur;
  }
  return total;
}

export function capacityForDate(data: RotaBranchData, date: Date, slot: { startH: number; endH: number }): number {
  const factor = isWeekend(date) ? 0.5 : 0.8;
  return Math.round(headcountForSlot(data, date, slot) * factor);
}

export async function fetchFootfall(_branch: Branch, _from: string, _to: string): Promise<FootfallMap> {
  try {
    const params = new URLSearchParams({ branch: _branch, from: _from, to: _to });
    const res = await fetch(`/api/footfall?${params}`);
    if (!res.ok) return {};
    const data = (await res.json()) as { buckets?: FootfallMap };
    return data.buckets ?? {};
  } catch { return {}; }
}
