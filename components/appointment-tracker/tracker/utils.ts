'use client';

import { PRESET_LABELS, SHIFT_ORDER, SLOTS } from './constants';
import { DatePreset, DateRange, RotaBranchData, RotaPlan, ShiftCode } from '../types/appointments';
import { BRANCHES, Branch, ApptLead as Lead, ymd } from '@/lib/appointments/appt-shared';

export function isWeekend(d: Date): boolean {
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

function toLocalDate(input: string | Date): Date {
  return input instanceof Date ? input : new Date(input);
}

export function shortDate(d: Date | string): string {
  const dt = toLocalDate(d);
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function timeOnly(iso: string): string {
  const dt = new Date(iso);
  return dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function slotIndexFor(iso: string): number {
  const dt = new Date(iso);
  const h = dt.getHours();
  return SLOTS.findIndex((s) => h >= s.startH && h < s.endH);
}

export function customerName(l: Lead): string {
  return [l.firstName, l.lastName].filter(Boolean).join(" ").trim() || `Lead #${l.id}`;
}

export function phoneOf(l: Lead): string {
  return l.phoneNumbers?.[0]?.value ?? "";
}

export function link3d(l: Lead): string | null {
  const raw = l.companyWebsite;
  if (!raw) return null;
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

export function ageLabel(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "updated just now";
  if (mins === 1) return "updated 1 min ago";
  if (mins < 60) return `updated ${mins} mins ago`;
  const hrs = Math.floor(mins / 60);
  return `updated ${hrs} hr${hrs === 1 ? "" : "s"} ago`;
}

export function requirement(l: Lead): string {
  return l.requirementName ?? "—";
}

export function newMemberId(): string {
  return "m_" + Math.random().toString(36).slice(2, 10);
}

export function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = x.getDay();
  x.setDate(x.getDate() + (dow === 0 ? -6 : 1 - dow));
  return x;
}

export function mondayKeyOf(d: Date): string {
  return ymd(mondayOf(d));
}

export function emptyBranchData(): RotaBranchData {
  return { members: [], weeks: {} };
}

export function defaultPlan(): RotaPlan {
  const p: RotaPlan = { version: 2, branches: {} as Record<Branch, RotaBranchData> };
  for (const b of BRANCHES) p.branches[b] = emptyBranchData();
  return p;
}

export function planBranchKeys(parsed: Partial<RotaPlan> | undefined): Branch[] {
  const keys = new Set<Branch>(BRANCHES);
  for (const k of Object.keys(parsed?.branches ?? {})) keys.add(k);
  return [...keys];
}

export function codeAt(codeStr: string | undefined, dayIdx: number): ShiftCode | "-" {
  const c = (codeStr ?? "").padEnd(7, "-")[dayIdx];
  return (SHIFT_ORDER as string[]).includes(c) ? (c as ShiftCode) : "-";
}

export function withCodeAt(codeStr: string | undefined, dayIdx: number, value: ShiftCode | "-"): string {
  const arr = (codeStr ?? "").padEnd(7, "-").split("");
  arr[dayIdx] = value;
  return arr.join("");
}

export function rangeForPreset(preset: DatePreset): [string, string] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dow = (today.getDay() + 6) % 7;
  const monThisWeek = new Date(today); monThisWeek.setDate(today.getDate() - dow);
  switch (preset) {
    case "today": return [ymd(today), ymd(today)];
    case "tomorrow": {
      const t = new Date(today); t.setDate(today.getDate() + 1);
      return [ymd(t), ymd(t)];
    }
    case "next_7": {
      const t = new Date(today); t.setDate(today.getDate() + 6);
      return [ymd(today), ymd(t)];
    }
    case "next_week": {
      const mon = new Date(monThisWeek); mon.setDate(monThisWeek.getDate() + 7);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return [ymd(mon), ymd(sun)];
    }
    case "this_month": {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return [ymd(first), ymd(last)];
    }
    case "next_month": {
      const first = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 2, 0);
      return [ymd(first), ymd(last)];
    }
    default: return [ymd(today), ymd(today)];
  }
}

export function inRange(iso: string, from: string, to: string): boolean {
  const t = new Date(iso).getTime();
  const f = new Date(from + "T00:00:00").getTime();
  const T = new Date(to + "T23:59:59").getTime();
  return t >= f && t <= T;
}

export function defaultRange(): DateRange {
  const [f, t] = rangeForPreset("next_7");
  return { preset: "next_7", from: f, to: t };
}

export function rangeLabel(r: DateRange): string {
  return r.preset === "custom" ? `${shortDate(r.from)} – ${shortDate(r.to)}` : PRESET_LABELS[r.preset];
}
