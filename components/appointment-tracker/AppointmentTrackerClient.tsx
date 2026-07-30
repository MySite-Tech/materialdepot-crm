"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BRANCHES, Branch, Role, LS,
  apptBranchesFor, branchFrom, fetchApptFeed, loadEcReady,
  resolveApptRole, saveEcReady, ymd,
} from "@/lib/appt-shared";
import type { ApptLead as Lead, EcReadyEntry, EcReadyMap } from "@/lib/appt-shared";
import type { AppUser } from "@/types/crm";
import AdminOverview from "./AdminOverview";

// ── Types & constants ─────────────────────────────────────────
// Branch/Role/AccessMap types, BRANCHES seed, and the fetch/save helpers live in
// @/lib/appt-shared so the branch list and the Kylas field mapping can't drift.

// Slots covering 10 AM – 9 PM. Five 2-hour slots + a final 1-hour late-evening slot.
const SLOTS: { key: string; label: string; startH: number; endH: number }[] = [
  { key: "s1", label: "10 AM – 12 PM", startH: 10, endH: 12 },
  { key: "s2", label: "12 PM – 2 PM",  startH: 12, endH: 14 },
  { key: "s3", label: "2 PM – 4 PM",   startH: 14, endH: 16 },
  { key: "s4", label: "4 PM – 6 PM",   startH: 16, endH: 18 },
  { key: "s5", label: "6 PM – 8 PM",   startH: 18, endH: 20 },
  { key: "s6", label: "8 PM – 9 PM",   startH: 20, endH: 21 },
];

const DOW_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; // index 0=Mon..6=Sun, matches rota day-code strings

// Shift codes a rota cell can hold. "1"/"2"/"g" contribute headcount hours;
// "o"/"l"/"c" (and unset "-") contribute none.
type ShiftCode = "1" | "2" | "g" | "o" | "l" | "c";
const SHIFT_META: Record<ShiftCode, { label: string; short: string; dot: string; bg: string }> = {
  "1": { label: "1st Shift",     short: "1st",  dot: "bg-indigo-500",  bg: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  "2": { label: "2nd Shift",     short: "2nd",  dot: "bg-sky-500",     bg: "bg-sky-50 text-sky-700 border-sky-200" },
  "g": { label: "General Shift", short: "Gen",  dot: "bg-amber-500",   bg: "bg-amber-50 text-amber-700 border-amber-200" },
  "o": { label: "Week Off",      short: "Off",  dot: "bg-gray-400", bg: "bg-gray-100 text-gray-600 border-gray-200" },
  "l": { label: "Leave",         short: "Leave",dot: "bg-rose-500",    bg: "bg-rose-50 text-rose-700 border-rose-200" },
  "c": { label: "Comp Off",      short: "Comp", dot: "bg-emerald-500", bg: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};
const SHIFT_ORDER: ShiftCode[] = ["1", "2", "g", "o", "l", "c"];

// Working-hours windows per shift. Index 0 = weekday start/end, 1 = weekend start/end
// (in fractional hours, e.g. 9.5 = 9:30 AM). Week off / Leave / Comp off have no hours.
const SHIFT_HOURS: Record<"1" | "2" | "g", { weekday: [number, number]; weekend: [number, number] }> = {
  "1": { weekday: [10, 19],   weekend: [10, 20] },   // 10 AM – 7 PM weekday / 10 AM – 8 PM weekend
  "2": { weekday: [12, 21],   weekend: [11, 21] },   // 12 PM – 9 PM weekday / 11 AM – 9 PM weekend
  "g": { weekday: [9.5, 21],  weekend: [9.5, 21] },  // 9:30 AM – 9 PM — spans the whole day
};

function isWeekend(d: Date): boolean {
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

// ── Small helpers ─────────────────────────────────────────────
// The Lead shape, the paged Kylas fetch, ymd() and the EC-ready store are all
// imported from @/lib/appt-shared so AdminOverview reads the same data.
function toLocalDate(input: string | Date): Date {
  return input instanceof Date ? input : new Date(input);
}
function shortDate(d: Date | string): string {
  const dt = toLocalDate(d);
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
function timeOnly(iso: string): string {
  const dt = new Date(iso);
  return dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}
function slotIndexFor(iso: string): number {
  const dt = new Date(iso);
  const h = dt.getHours();
  return SLOTS.findIndex((s) => h >= s.startH && h < s.endH);
}
// branchFrom now imported from @/lib/appt-shared — takes the raw field value.
function customerName(l: Lead): string {
  return [l.firstName, l.lastName].filter(Boolean).join(" ").trim() || `Lead #${l.id}`;
}
function phoneOf(l: Lead): string {
  return l.phoneNumbers?.[0]?.value ?? "";
}
function link3d(l: Lead): string | null {
  const raw = l.companyWebsite;
  if (!raw) return null;
  return raw.startsWith("http") ? raw : `https://${raw}`;
}
// How old the cached appointment feed is — the tracker no longer re-sweeps Kylas
// on every interaction, so the age is worth showing next to Refresh.
function ageLabel(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "updated just now";
  if (mins === 1) return "updated 1 min ago";
  if (mins < 60) return `updated ${mins} mins ago`;
  const hrs = Math.floor(mins / 60);
  return `updated ${hrs} hr${hrs === 1 ? "" : "s"} ago`;
}
function requirement(l: Lead): string {
  return l.requirementName ?? "—";
}

// ── Rota Plan store ────────────────────────────────────────────
// Per branch: a roster of members, plus per-ISO-week (keyed by that week's Monday
// ymd) a 7-char shift-code string per member (index 0=Mon..6=Sun; "-" = unset).
type RotaMember = { id: string; name: string };
type RotaBranchData = { members: RotaMember[]; weeks: Record<string, Record<string, string>> };
type RotaPlan = { version: 2; branches: Record<Branch, RotaBranchData> };

function newMemberId(): string {
  return "m_" + Math.random().toString(36).slice(2, 10);
}

function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = x.getDay();
  x.setDate(x.getDate() + (dow === 0 ? -6 : 1 - dow));
  return x;
}
function mondayKeyOf(d: Date): string {
  return ymd(mondayOf(d));
}

function emptyBranchData(): RotaBranchData {
  return { members: [], weeks: {} };
}

function defaultPlan(): RotaPlan {
  const p: RotaPlan = { version: 2, branches: {} as Record<Branch, RotaBranchData> };
  for (const b of BRANCHES) p.branches[b] = emptyBranchData();
  return p;
}

// Drop week keys far outside the useful planning window, and shift entries for
// members no longer on the roster, so the stored JSON stays well under the
// server's 60KB cap however long the tool stays in use.
const ROTA_PAST_DAYS = 60;
const ROTA_FUTURE_DAYS = 180;
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

// Merge/sanitize a partial plan onto empty defaults so newly-added branches don't
// leave gaps and malformed/legacy (old numeric) data is tolerated as empty.
function mergeWithDefaults(partial: unknown): RotaPlan {
  const base = defaultPlan();
  if (!partial || typeof partial !== "object") return base;
  const parsed = partial as Partial<RotaPlan>;
  for (const b of BRANCHES) {
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

// Fetch shared rota from Kylas (via /api/resource-plan). Falls back to empty
// defaults if the API is unreachable or the settings lead's field is empty.
async function fetchPlan(): Promise<RotaPlan> {
  try {
    const res = await fetch("/api/resource-plan", { cache: "no-store" });
    if (!res.ok) return defaultPlan();
    const data = await res.json();
    return mergeWithDefaults(data?.plan);
  } catch { return defaultPlan(); }
}

async function savePlan(p: RotaPlan): Promise<void> {
  const pruned: RotaPlan = { version: 2, branches: {} as Record<Branch, RotaBranchData> };
  for (const b of BRANCHES) pruned.branches[b] = pruneBranchData(p.branches[b] ?? emptyBranchData());
  const res = await fetch("/api/resource-plan", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan: pruned }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.error ?? `Save failed: ${res.status}`);
  }
}

// Fractional headcount for one slot on one date: each rostered member contributes
// (their shift's overlap with the slot ÷ the slot's own duration), so someone whose
// shift only covers half a slot counts as half a head.
function headcountForSlot(data: RotaBranchData, date: Date, slot: { startH: number; endH: number }): number {
  const week = data.weeks[mondayKeyOf(date)];
  if (!week) return 0;
  const dayIdx = (date.getDay() + 6) % 7; // Mon=0..Sun=6
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

// Final bookable capacity for a slot: 80% of scheduled headcount on weekdays,
// 50% on weekends, rounded to the nearest whole slot.
function capacityForDate(data: RotaBranchData, date: Date, slot: { startH: number; endH: number }): number {
  const factor = isWeekend(date) ? 0.5 : 0.8;
  return Math.round(headcountForSlot(data, date, slot) * factor);
}

// ── Live footfall (walk-ins) — stub for now ───────────────────
// The footfall service-account JWT is not yet wired in; when it is, this route
// will query /apiV1/footfall-record/ per branch+day and bucket into slots.
// Until then returns an empty map so the UI renders 0 walk-ins.
type FootfallMap = Record<string, number>; // key = `${ymd(date)}|${slotKey}`
async function fetchFootfall(_branch: Branch, _from: string, _to: string): Promise<FootfallMap> {
  try {
    const params = new URLSearchParams({ branch: _branch, from: _from, to: _to });
    const res = await fetch(`/api/footfall?${params}`);
    if (!res.ok) return {};
    const data = (await res.json()) as { buckets?: FootfallMap };
    return data.buckets ?? {};
  } catch { return {}; }
}

// ── Date range ────────────────────────────────────────────────
// One range for the whole tracker. Every view used to carry its own date filter
// (the calendar had from/to inputs, reception + summary each had a preset card,
// admin overview a third), which meant a full-width card per view showing one
// dropdown, and a range that silently reset when you switched sub-tabs.
type DatePreset = "today" | "tomorrow" | "next_7" | "this_month" | "next_week" | "next_month" | "custom";
const PRESET_LABELS: Record<DatePreset, string> = {
  today: "Today",
  tomorrow: "Tomorrow",
  next_7: "Next 7 days",
  this_month: "Current month",
  next_week: "Next week",
  next_month: "Next month",
  custom: "Custom",
};

function rangeForPreset(preset: DatePreset): [string, string] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dow = (today.getDay() + 6) % 7; // Mon=0..Sun=6
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

function inRange(iso: string, from: string, to: string): boolean {
  const t = new Date(iso).getTime();
  const f = new Date(from + "T00:00:00").getTime();
  const T = new Date(to + "T23:59:59").getTime();
  return t >= f && t <= T;
}

export type DateRange = { preset: DatePreset; from: string; to: string };

export function defaultRange(): DateRange {
  const [f, t] = rangeForPreset("next_7");
  return { preset: "next_7", from: f, to: t };
}

/** Label for the active range, for use in view headings. */
function rangeLabel(r: DateRange): string {
  return r.preset === "custom" ? `${shortDate(r.from)} – ${shortDate(r.to)}` : PRESET_LABELS[r.preset];
}

// A native <select> dressed as one of the CRM's filter chips: same pill shape,
// height, type scale and leading dot as FilterChip/DateChip in the dashboards,
// with the browser's arrow swapped for the chip caret. The dot colours are the
// CRM's own per-filter colours (date = amber, branch = blue).
const CHIP_DOTS = { date: "#F59E0B", branch: "#3B82F6" } as const;

function SelectChip<T extends string>({ dot, value, onChange, options, title }: {
  dot: keyof typeof CHIP_DOTS;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  title: string;
}) {
  return (
    <div className="relative inline-flex">
      <span
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
        style={{ background: CHIP_DOTS[dot] }}
      />
      <select
        value={value}
        title={title}
        aria-label={title}
        onChange={(e) => onChange(e.target.value as T)}
        className="appearance-none rounded-full border border-gray-300 bg-white pl-7 pr-7 py-1.5 text-[12px] font-semibold text-gray-700 leading-[16px] cursor-pointer outline-none hover:border-gray-400 hover:text-gray-800 focus:border-yellow-400 transition-all"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">▾</span>
    </div>
  );
}

// Sits in the tracker's top control bar, next to the branch picker — one date
// control for every sub-tab. Custom swaps the resolved-dates caption for two
// day inputs, in place, so the bar never changes height.
function DateRangeControl({ value, onChange }: {
  value: DateRange;
  onChange: (v: DateRange) => void;
}) {
  const setPreset = (p: DatePreset) => {
    if (p === "custom") { onChange({ ...value, preset: p }); return; }
    const [f, t] = rangeForPreset(p);
    onChange({ preset: p, from: f, to: t });
  };
  return (
    <>
      <SelectChip<DatePreset>
        dot="date"
        title="Date range"
        value={value.preset}
        onChange={setPreset}
        options={(Object.keys(PRESET_LABELS) as DatePreset[]).map((k) => ({ value: k, label: PRESET_LABELS[k] }))}
      />
      {value.preset === "custom" && (
        <div className="inline-flex items-center gap-1.5">
          <input type="date" value={value.from} max={value.to} onChange={(e) => onChange({ ...value, from: e.target.value })} className="rounded-full border border-gray-300 bg-white px-3 py-1 text-[12px] text-gray-700 outline-none focus:border-yellow-400 cursor-pointer" />
          <span className="text-[11px] text-gray-400">–</span>
          <input type="date" value={value.to} min={value.from} onChange={(e) => onChange({ ...value, to: e.target.value })} className="rounded-full border border-gray-300 bg-white px-3 py-1 text-[12px] text-gray-700 outline-none focus:border-yellow-400 cursor-pointer" />
        </div>
      )}
    </>
  );
}

// ── Root component ────────────────────────────────────────────
export default function AppointmentTrackerClient({ currentUser }: { currentUser: AppUser | null }) {
  // Identity comes from the CRM session — no separate sign-in, and no access
  // list: the CRM role decides the view, its branch list decides the scope.
  const role: Role = resolveApptRole(currentUser);
  const allowedBranches = useMemo(() => apptBranchesFor(currentUser), [currentUser]);
  const [branch, setBranch] = useState<Branch>(() => allowedBranches[0] ?? "JP Nagar");
  const userName = currentUser?.name ?? "";
  const [hydrated, setHydrated] = useState(false);

  // Keep the selection inside what this user is allowed to see (their CRM
  // CRM branch list can change under them on a permission sync).
  useEffect(() => {
    if (allowedBranches.length > 0 && !allowedBranches.includes(branch)) {
      setBranch(allowedBranches[0]);
    }
  }, [allowedBranches, branch]);

  // Admin's view toggle — lets an admin see every role-specific view without
  // changing role, plus the two screens that were their own admin-only pages in
  // the standalone app (cross-branch overview, role overrides).
  type AdminView = "calendar" | "reception" | "manager" | "overview";
  const [adminView, setAdminView] = useState<AdminView>("calendar");
  const showBranchBar = !(role === "admin" && adminView === "overview");

  // Data
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  // One date range shared by every view, owned here and driven by the control in
  // the top bar. Survives sub-tab switches, which the per-view filters didn't.
  const [range, setRange] = useState<DateRange>(defaultRange);
  const { from: fromDate, to: toDate } = range;

  // Receptionist EC Ready map
  const [ec, setEc] = useState<EcReadyMap>({});
  const [savingEc, setSavingEc] = useState<Record<number, boolean>>({});

  // Resource plan (manager-editable) + live footfall
  const [plan, setPlan] = useState<RotaPlan>(() => defaultPlan());
  const [footfall, setFootfall] = useState<FootfallMap>({});

  // ── Which view is on screen, and therefore what data it needs ──
  // Non-admins have exactly one view; admins switch between four. Only the
  // calendar (slot capacity) and the manager screens (planner + walk-ins) need
  // the rota plan or footfall, so the reception list and admin overview don't
  // pay for either.
  const view: AdminView = role === "admin"
    ? adminView
    : role === "receptionist" ? "reception"
    : role === "manager" ? "manager"
    : "calendar";
  const needsPlan = view === "calendar" || view === "manager";
  const needsFootfall = view === "calendar" || view === "manager";

  // Hydrate last-viewed branch + the EC-ready map on mount (both local)
  useEffect(() => {
    try {
      const b = localStorage.getItem(LS.BRANCH) as Branch | null;
      if (b && (BRANCHES as readonly string[]).includes(b)) setBranch(b);
    } catch { /* ignore */ }
    setEc(loadEcReady());
    setHydrated(true);
  }, []);

  // Rota plan (Kylas settings lead) — fetched the first time a view needs it,
  // then kept. `planLoaded` stops us re-requesting it on every view switch.
  const [planLoaded, setPlanLoaded] = useState(false);
  useEffect(() => {
    if (!needsPlan || planLoaded) return;
    let cancelled = false;
    fetchPlan().then((p) => {
      if (cancelled) return;
      setPlan(p);
      setPlanLoaded(true);
    });
    return () => { cancelled = true; };
  }, [needsPlan, planLoaded]);

  useEffect(() => { if (hydrated) localStorage.setItem(LS.BRANCH, branch); }, [branch, hydrated]);

  // Appointments: one request for every branch and date, so this must NOT depend
  // on branch/fromDate/toDate — switching either only re-slices what we already
  // have. Kylas is only re-swept when the user asks (Refresh) or the server
  // cache has expired.
  const loadLeads = useCallback(async (force = false) => {
    setLoading(true); setError(null);
    try {
      const feed = await fetchApptFeed(force);
      setLeads(feed.leads);
      setFetchedAt(feed.fetchedAt);
      setStale(!!feed.stale);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load appointments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  // Walk-ins come from the Django footfall API and ARE branch/date scoped, so
  // this one legitimately re-runs when either changes — but only for the views
  // that display walk-ins.
  useEffect(() => {
    if (!needsFootfall) return;
    let cancelled = false;
    fetchFootfall(branch, fromDate, toDate).then((w) => { if (!cancelled) setFootfall(w); });
    return () => { cancelled = true; };
  }, [needsFootfall, branch, fromDate, toDate]);

  const load = useCallback(() => loadLeads(true), [loadLeads]);

  // Derived: scoped leads for the selected branch (admin sees per-branch views too)
  const scopedLeads = useMemo(() => {
    return leads.filter((l) => branchFrom(l.companyBusinessType) === branch);
  }, [leads, branch]);

  const handleEcToggle = async (l: Lead, state: "ready" | "not_ready") => {
    const entry: EcReadyEntry = { state, by: userName || "Receptionist", at: new Date().toISOString() };
    const next = { ...ec, [l.id]: entry };
    setEc(next); saveEcReady(next);
    setSavingEc((s) => ({ ...s, [l.id]: true }));
    // Post a note in Kylas so the CRM record shows it too
    try {
      const label = state === "ready" ? "[EC_READY]" : "[EC_NOT_READY]";
      const stampIST = new Date().toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      await fetch("/api/notes/relation/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceEntity: { description: `<div><b>${label}</b> Experience Centre marked ${state === "ready" ? "READY" : "NOT READY"} by ${entry.by} · ${stampIST}</div>` },
          targetEntityId: String(l.id),
          targetEntityType: "LEAD",
        }),
      });
    } catch { /* silent — localStorage still has the state */ }
    setSavingEc((s) => ({ ...s, [l.id]: false }));
  };

  // ── Render ──────────────────────────────────────────────────
  if (!currentUser) {
    return (
      <div className="px-3 sm:px-6 py-4 sm:py-5">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 text-center text-[12px] text-gray-400">
          Sign in to the CRM to view the Appointment Tracker.
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Sub-tabs, same pill row every other CRM tab uses (see FootfallTab).
          Admins get one pill per view; everyone else only ever has one view, so
          the row collapses to just the branch picker + refresh. */}
      <div className="px-3 sm:px-6 pt-4 flex items-center gap-2 flex-wrap">
        {role === "admin" && ([
          { key: "calendar",  label: "EC Calendar" },
          { key: "reception", label: "Reception List" },
          { key: "manager",   label: "Branch Summary" },
          { key: "overview",  label: "Admin Overview" },
        ] as { key: AdminView; label: string }[]).map((v) => (
          <button
            key={v.key}
            onClick={() => setAdminView(v.key)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border transition-all ${
              adminView === v.key
                ? "bg-[#EAB308] text-black border-[#EAB308] shadow-sm"
                : "bg-white text-gray-600 border-gray-300 hover:border-gray-400 hover:text-gray-800"
            }`}
          >
            {v.label}
          </button>
        ))}
        {/* One control bar for the whole tracker: date range · branch · refresh,
            then a muted caption for the resolved dates and the data's age. */}
        <div className="flex items-center gap-2 ml-auto">
          <DateRangeControl value={range} onChange={setRange} />
          {showBranchBar && (
            <SelectChip<Branch>
              dot="branch"
              title="Branch"
              value={branch}
              onChange={setBranch}
              options={allowedBranches.map((b) => ({ value: b, label: b }))}
            />
          )}
          <button
            onClick={load}
            disabled={loading}
            title="Re-fetch appointments from Kylas"
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-[12px] font-semibold leading-[16px] text-gray-700 cursor-pointer hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <span className={loading ? "inline-block animate-spin" : "inline-block"}>↻</span>
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Caption sits on its own line so the controls stay a tidy group */}
      <div className="px-3 sm:px-6 pt-1.5 flex justify-end items-center gap-1.5 text-[11px] text-gray-400">
        {range.preset !== "custom" && <span>{shortDate(range.from)} – {shortDate(range.to)}</span>}
        {fetchedAt && (
          <>
            {range.preset !== "custom" && <span className="text-gray-300">·</span>}
            <span className={stale ? "text-amber-600" : ""} title={new Date(fetchedAt).toLocaleString("en-IN")}>
              {stale ? "⚠ stale · " : ""}{ageLabel(fetchedAt)}
            </span>
          </>
        )}
      </div>

      <div className="px-3 sm:px-6 py-4 sm:py-5">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 mb-4 text-[12px] text-red-600">
          Error loading appointments: {error}
        </div>
      )}

      {/* Role-specific views.
          Presales: calendar only. Receptionist: reception list only. Store manager: reception list + branch summary + planner. Admin: toggle. */}
      {(role === "presales" || (role === "admin" && adminView === "calendar")) && (
        <PresalesCalendar leads={scopedLeads} branch={branch} from={fromDate} to={toDate} plan={plan} footfall={footfall} />
      )}
      {(role === "receptionist" || role === "manager" || (role === "admin" && adminView === "reception")) && (
        <ReceptionistList leads={scopedLeads} ec={ec} savingEc={savingEc} onToggle={handleEcToggle} branch={branch} range={range} />
      )}
      {(role === "manager" || (role === "admin" && adminView === "manager")) && (
        <>
          <ManagerSummary leads={scopedLeads} branch={branch} ec={ec} footfall={footfall} range={range} />
          <RotaPlanner plan={plan} setPlan={setPlan} branch={branch} allowBranchSwitch={role === "admin"} />
        </>
      )}
      {role === "admin" && adminView === "overview" && (
        <AdminOverview allLeads={leads} ec={ec} range={range} />
      )}
      </div>
    </div>
  );
}

// ── PRESALES: weekly calendar with availability heatmap ───────
function PresalesCalendar({ leads, branch, from, to, plan, footfall }: {
  leads: Lead[]; branch: Branch; from: string; to: string;
  plan: RotaPlan; footfall: FootfallMap;
}) {
  const days: Date[] = useMemo(() => {
    const arr: Date[] = [];
    const start = new Date(from + "T00:00:00");
    const end = new Date(to + "T00:00:00");
    for (let d = new Date(start); d.getTime() <= end.getTime(); d.setDate(d.getDate() + 1)) {
      arr.push(new Date(d));
    }
    return arr;
  }, [from, to]);

  const grid = useMemo(() => {
    const map = new Map<string, Lead[]>();
    for (const l of leads) {
      if (!l.cfVisitScheduled) continue;
      const dt = new Date(l.cfVisitScheduled);
      const key = `${ymd(dt)}|${SLOTS[slotIndexFor(l.cfVisitScheduled)]?.key}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    }
    return map;
  }, [leads]);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-[13px] font-bold text-gray-800 flex items-center gap-2">
          <span className="inline-block h-3.5 w-1 rounded-full bg-[#EAB308]" />
          Presales calendar · <span className="rounded-full bg-[#FEF9C3] text-[#7A5C00] px-2 py-0.5 text-[11px] font-semibold">{branch}</span>
        </h2>
        <div className="flex items-center gap-3 text-[11px] text-gray-600">
          <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-emerald-500" /> Free</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-amber-500" /> Filling</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-rose-500" /> Near full</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-gray-900" /> Full</span>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200/70 bg-white shadow-sm">
        <table className="w-full text-[12px] border-separate border-spacing-0">
          <thead>
            <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-[0.08em]">
              <th className="px-3 py-3 border-b border-gray-200 sticky left-0 bg-white z-10">Slot</th>
              {days.map((d) => {
                const today = ymd(new Date()) === ymd(d);
                return (
                  <th key={ymd(d)} className="px-3 py-3 min-w-[150px] border-b border-gray-200">
                    <div className={`flex items-center gap-1.5 ${today ? "text-gray-900" : "text-gray-600"}`}>
                      <span className="text-[11px] font-bold uppercase tracking-wider">{d.toLocaleDateString("en-IN", { weekday: "short" })}</span>
                      {today && <span className="rounded-full bg-[#EAB308] text-black text-[9px] font-bold px-1.5 py-0.5 tracking-wider">TODAY</span>}
                    </div>
                    <div className="text-[11px] text-gray-500 font-medium mt-0.5">{shortDate(d)}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {SLOTS.map((s) => (
              <tr key={s.key} className="align-top">
                <td className="px-3 py-2.5 sticky left-0 bg-white z-10 font-semibold text-gray-700 text-[11px] whitespace-nowrap border-b border-gray-100">
                  {s.label}
                </td>
                {days.map((d) => {
                  const cellKey = `${ymd(d)}|${s.key}`;
                  const bookings = grid.get(cellKey) ?? [];
                  const walkIns = footfall[cellKey] ?? 0;
                  const capacity = capacityForDate(plan.branches[branch] ?? emptyBranchData(), d, s);
                  const consumed = bookings.length + walkIns;
                  const free = Math.max(0, capacity - consumed);
                  const pct = capacity > 0 ? Math.min(consumed / capacity, 1) : 1;
                  const isFull = pct >= 1;
                  const isNear = !isFull && pct >= 0.7;
                  const isFilling = !isFull && !isNear && pct >= 0.3;
                  const isFree = !isFull && !isNear && !isFilling;

                  // Refined palette: white card, colored left rail + tinted background.
                  // Full is inverted for immediate stop-signal.
                  const container = isFull
                    ? "bg-gray-900 text-white ring-gray-900"
                    : isNear
                    ? "bg-rose-50/60 ring-rose-200"
                    : isFilling
                    ? "bg-amber-50/60 ring-amber-200"
                    : "bg-emerald-50/50 ring-emerald-200";
                  const rail = isFull ? "bg-white" : isNear ? "bg-rose-500" : isFilling ? "bg-amber-500" : "bg-emerald-500";
                  const barFill = isFull ? "bg-white/80" : isNear ? "bg-rose-500" : isFilling ? "bg-amber-500" : "bg-emerald-500";
                  const barTrack = isFull ? "bg-white/15" : "bg-gray-200/60";
                  const statusLabel = isFull ? "Full" : isNear ? "Near full" : isFilling ? "Filling" : "Free";
                  const statusPill = isFull
                    ? "bg-white/15 text-white"
                    : isNear
                    ? "bg-rose-100 text-rose-700"
                    : isFilling
                    ? "bg-amber-100 text-amber-700"
                    : "bg-emerald-100 text-emerald-700";
                  const mutedText = isFull ? "text-white/70" : "text-gray-500";
                  const softText = isFull ? "text-white/85" : "text-gray-700";

                  return (
                    <td key={cellKey} className="p-1.5 align-top border-b border-gray-100">
                      <div
                        className={`relative rounded-lg ring-1 ${container} pl-2.5 pr-2.5 py-2 overflow-hidden`}
                        title={[
                          `${statusLabel} · Booked ${bookings.length} · Walk-ins ${walkIns} · Remaining ${free} of ${capacity}`,
                          ...bookings.map((b) => `${timeOnly(b.cfVisitScheduled!)} · ${customerName(b)}`),
                        ].join("\n")}
                      >
                        {/* Left accent rail */}
                        <span className={`absolute left-0 top-1 bottom-1 w-[3px] rounded-full ${rail}`} />

                        {/* Header: BIG booked count + status pill */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-baseline gap-1.5">
                            <span className={`text-xl font-bold leading-none ${isFull ? "text-white" : "text-gray-900"}`}>
                              {bookings.length}
                            </span>
                            <span className={`text-[10px] font-medium uppercase tracking-wider ${mutedText}`}>
                              booked
                            </span>
                          </div>
                          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${statusPill}`}>
                            {statusLabel}
                          </span>
                        </div>

                        {/* Progress bar */}
                        <div className={`mt-1.5 h-1 w-full rounded-full ${barTrack} overflow-hidden`}>
                          <div className={`h-full ${barFill} rounded-full transition-all`} style={{ width: `${Math.round(pct * 100)}%` }} />
                        </div>

                        {/* Metric row */}
                        <div className={`mt-1.5 flex items-center gap-2 text-[10px] ${softText}`}>
                          <span className="font-semibold">{free}</span>
                          <span className={mutedText}>free of {capacity}</span>
                          {walkIns > 0 && (
                            <>
                              <span className={mutedText}>·</span>
                              <span className="font-semibold">{walkIns}</span>
                              <span className={mutedText}>walk-in</span>
                            </>
                          )}
                        </div>

                        {/* Bookings preview */}
                        {bookings.length > 0 && (
                          <div className={`mt-1.5 pt-1.5 border-t ${isFull ? "border-white/15" : "border-gray-200/70"} space-y-0.5`}>
                            {bookings.slice(0, 2).map((b) => (
                              <div key={b.id} className={`flex items-center gap-1.5 text-[10px] ${softText}`}>
                                <span className={`font-mono tabular-nums ${mutedText}`}>{timeOnly(b.cfVisitScheduled!)}</span>
                                <span className="truncate">{customerName(b)}</span>
                              </div>
                            ))}
                            {bookings.length > 2 && (
                              <div className={`text-[10px] font-medium ${mutedText}`}>+{bookings.length - 2} more</div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-500 mt-2">
        Capacity comes from the branch resource plan (edit under <b>Store Manager</b> role). Cells show <b>free slots / total capacity</b>. 📅 = booked appointments · 🚶 = live walk-ins from footfall.
      </p>
    </div>
  );
}

// ── ROTA PLANNER: manager plans the real per-day shift roster ─
function codeAt(codeStr: string | undefined, dayIdx: number): ShiftCode | "-" {
  const c = (codeStr ?? "").padEnd(7, "-")[dayIdx];
  return (SHIFT_ORDER as string[]).includes(c) ? (c as ShiftCode) : "-";
}
function withCodeAt(codeStr: string | undefined, dayIdx: number, value: ShiftCode | "-"): string {
  const arr = (codeStr ?? "").padEnd(7, "-").split("");
  arr[dayIdx] = value;
  return arr.join("");
}

function RotaPlanner({ plan, setPlan, branch, allowBranchSwitch = false }: {
  plan: RotaPlan;
  setPlan: (p: RotaPlan) => void;
  branch: Branch;
  allowBranchSwitch?: boolean;
}) {
  const [editBranch, setEditBranch] = useState<Branch>(branch);
  const [draft, setDraft] = useState<RotaPlan>(plan);
  const [savingState, setSavingState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // If the parent plan updates (e.g., re-fetched from server), sync into the draft
  // as long as the user isn't actively editing (dirty).
  useEffect(() => { setDraft(plan); }, [plan]);
  useEffect(() => { setEditBranch(branch); }, [branch]);

  const b = allowBranchSwitch ? editBranch : branch;
  const isDirty = JSON.stringify(plan) !== JSON.stringify(draft);
  const branchData = draft.branches[b] ?? emptyBranchData();

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return d;
  }), [weekStart]);
  const weekKey = mondayKeyOf(weekStart);
  const today = ymd(new Date());

  const setCell = (memberId: string, dayIdx: number, value: ShiftCode | "-") => {
    setDraft((prev) => {
      const bd = prev.branches[b] ?? emptyBranchData();
      const week = { ...(bd.weeks[weekKey] ?? {}) };
      week[memberId] = withCodeAt(week[memberId], dayIdx, value);
      return { ...prev, branches: { ...prev.branches, [b]: { ...bd, weeks: { ...bd.weeks, [weekKey]: week } } } };
    });
  };

  const addMember = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setDraft((prev) => {
      const bd = prev.branches[b] ?? emptyBranchData();
      return { ...prev, branches: { ...prev.branches, [b]: { ...bd, members: [...bd.members, { id: newMemberId(), name: trimmed }] } } };
    });
    setNewName("");
  };
  const renameMember = (memberId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setDraft((prev) => {
      const bd = prev.branches[b] ?? emptyBranchData();
      return { ...prev, branches: { ...prev.branches, [b]: { ...bd, members: bd.members.map((m) => m.id === memberId ? { ...m, name: trimmed } : m) } } };
    });
  };
  const removeMember = (memberId: string) => {
    setDraft((prev) => {
      const bd = prev.branches[b] ?? emptyBranchData();
      return { ...prev, branches: { ...prev.branches, [b]: { ...bd, members: bd.members.filter((m) => m.id !== memberId) } } };
    });
  };

  const handleSave = async () => {
    setSavingState("saving");
    setSaveError(null);
    try {
      await savePlan(draft);
      setPlan(draft); // reflect saved state up to parent (shared across users after next fetch)
      setSavingState("saved");
      setTimeout(() => setSavingState("idle"), 2000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
      setSavingState("error");
    }
  };

  const handleReset = () => {
    setDraft(plan); // discard local edits
  };

  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-[13px] font-bold text-gray-800 flex items-center gap-2">
          <span className="inline-block h-3.5 w-1 rounded-full bg-[#EAB308]" />
          Rota planner {allowBranchSwitch ? "" : <>· <span className="rounded-full bg-[#FEF9C3] text-[#7A5C00] px-2 py-0.5 text-[11px] font-semibold">{branch}</span></>}
        </h2>
        <div className="flex items-center gap-2">
          {allowBranchSwitch && (
            <select value={editBranch} onChange={(e) => setEditBranch(e.target.value as Branch)} className="border border-gray-200 rounded px-2.5 py-1 text-[12px] text-gray-700 outline-none focus:border-yellow-400 bg-white">
              {BRANCHES.map((br) => <option key={br} value={br}>{br}</option>)}
            </select>
          )}
          {savingState === "saved" && <span className="text-[11px] text-green-600 font-medium">✓ Saved</span>}
          {savingState === "saving" && <span className="text-[11px] text-gray-400">Saving…</span>}
          {savingState === "error" && <span className="text-[11px] text-rose-500" title={saveError || ""}>⚠ Save failed</span>}
          {isDirty && (
            <button onClick={handleReset} className="px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              Discard
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!isDirty || savingState === "saving"}
            className="px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border border-[#EAB308] bg-[#EAB308] text-black hover:bg-[#D4A107] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            Save plan
          </button>
        </div>
      </div>
      <p className="text-[11px] text-gray-400 mb-3">
        Plan who&apos;s on 1st / 2nd / General shift, Week off, Leave or Comp off each day. Appointment-calendar slot
        capacity is derived from this roster (80% of scheduled headcount on weekdays, 50% on weekends) — no manual
        numbers to maintain. Changes save to the Kylas settings lead ({" "}<code>cfResourceplanjson</code>{" "}) — shared
        across all users after Save.
      </p>

      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => setWeekStart((w) => { const d = new Date(w); d.setDate(d.getDate() - 7); return d; })} className="px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all">←</button>
        <span className="rounded border border-gray-200 bg-white px-3 py-1 text-[12px] font-semibold text-gray-700 min-w-[150px] text-center">
          {shortDate(days[0])} – {shortDate(days[6])}
        </span>
        <button onClick={() => setWeekStart((w) => { const d = new Date(w); d.setDate(d.getDate() + 7); return d; })} className="px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all">→</button>
        <button onClick={() => setWeekStart(mondayOf(new Date()))} className="px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all">This week</button>
      </div>

      <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl shadow-sm">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-gray-50 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              <th className="px-3 py-2 border-r border-gray-200 sticky left-0 bg-gray-50 min-w-[150px]">Advisor</th>
              {days.map((d, i) => {
                const isToday = ymd(d) === today;
                const weekend = isWeekend(d);
                return (
                  <th key={i} className={`px-2 py-2 min-w-[110px] text-center ${weekend ? "text-rose-500" : ""} ${isToday ? "bg-[#EAB308]/10" : ""}`}>
                    <div>{DOW_SHORT[i]}</div>
                    <div className="text-gray-400 font-normal normal-case">{d.getDate()}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {branchData.members.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-[12px] text-gray-400">No advisors yet — add one below.</td></tr>
            ) : branchData.members.map((m) => (
              <tr key={m.id} className="group">
                <td className="px-3 py-1.5 border-r border-gray-200 sticky left-0 bg-white text-[11px] font-medium text-gray-700 whitespace-nowrap">
                  {renamingId === m.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => { renameMember(m.id, renameValue); setRenamingId(null); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="w-full rounded border border-[#EAB308] px-1.5 py-0.5 text-[11px] text-gray-700 focus:outline-none"
                    />
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="truncate">{m.name}</span>
                      <span className="hidden group-hover:inline-flex gap-1 ml-auto">
                        <button title="Rename" onClick={() => { setRenamingId(m.id); setRenameValue(m.name); }} className="text-gray-400 hover:text-gray-700">✎</button>
                        <button title="Remove" onClick={() => { if (confirm(`Remove ${m.name} from the roster?`)) removeMember(m.id); }} className="text-gray-400 hover:text-rose-600">×</button>
                      </span>
                    </div>
                  )}
                </td>
                {days.map((d, dayIdx) => {
                  const code = codeAt(branchData.weeks[weekKey]?.[m.id], dayIdx);
                  const meta = code !== "-" ? SHIFT_META[code] : null;
                  return (
                    <td key={dayIdx} className="px-1.5 py-1.5 text-center">
                      <select
                        value={code}
                        onChange={(e) => setCell(m.id, dayIdx, e.target.value as ShiftCode | "-")}
                        className={`w-full rounded border px-1 py-1 text-[11px] font-semibold text-center focus:outline-none ${meta ? meta.bg : "bg-white text-gray-400 border-gray-200"}`}
                      >
                        <option value="-">—</option>
                        {SHIFT_ORDER.map((c) => <option key={c} value={c}>{SHIFT_META[c].label}</option>)}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); addMember(newName); }}
        className="flex items-center gap-2 mt-2"
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={`Add an advisor to ${b}…`}
          className="flex-1 max-w-[220px] border border-gray-200 rounded px-2.5 py-1 text-[12px] text-gray-700 outline-none focus:border-yellow-400 bg-white"
        />
        <button type="submit" className="px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all">Add</button>
      </form>

      <div className="flex flex-wrap gap-3 items-center mt-3 text-[11px] text-gray-600">
        {SHIFT_ORDER.map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5">
            <span className={`inline-block w-2 h-2 rounded-full ${SHIFT_META[c].dot}`} /> {SHIFT_META[c].label}
          </span>
        ))}
      </div>

      <RotaCapacityPreview branchData={branchData} days={days} />
    </div>
  );
}

// Read-only preview showing what this week's roster produces per slot per day,
// via the same 80%/50% overlap math the Presales calendar uses.
function RotaCapacityPreview({ branchData, days }: { branchData: RotaBranchData; days: Date[] }) {
  return (
    <div className="mt-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
        Derived slot capacity · this week
      </h3>
      <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl shadow-sm">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-gray-50 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              <th className="px-3 py-1.5 border-r border-gray-200 sticky left-0 bg-gray-50">Slot</th>
              {days.map((d, i) => (
                <th key={i} className={`px-2 py-1.5 min-w-[70px] text-center ${isWeekend(d) ? "text-rose-500" : ""}`}>{DOW_SHORT[i]}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {SLOTS.map((s) => (
              <tr key={s.key}>
                <td className="px-3 py-1 border-r border-gray-200 sticky left-0 bg-white font-medium text-gray-700 text-[11px] whitespace-nowrap">{s.label}</td>
                {days.map((d, i) => (
                  <td key={i} className="px-2 py-1 text-center text-[11px] text-gray-600">{capacityForDate(branchData, d, s)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── RECEPTIONIST: list + EC Ready toggle ──────────────────────
function ReceptionistList({ leads, ec, savingEc, onToggle, branch, range }: {
  leads: Lead[];
  ec: EcReadyMap;
  savingEc: Record<number, boolean>;
  onToggle: (l: Lead, state: "ready" | "not_ready") => void;
  branch: Branch;
  range: DateRange;
}) {
  const { from, to } = range;

  const sorted = useMemo(() => {
    return [...leads]
      .filter((l) => !!l.cfVisitScheduled && inRange(l.cfVisitScheduled!, from, to))
      .sort((a, b) => new Date(a.cfVisitScheduled!).getTime() - new Date(b.cfVisitScheduled!).getTime());
  }, [leads, from, to]);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-[13px] font-bold text-gray-800 flex items-center gap-2">
          <span className="inline-block h-3.5 w-1 rounded-full bg-[#EAB308]" />
          Upcoming appointments · <span className="rounded-full bg-[#FEF9C3] text-[#7A5C00] px-2 py-0.5 text-[11px] font-semibold">{branch}</span>
          <span className="text-gray-400 font-normal">{rangeLabel(range)}</span>
        </h2>
        <span className="text-[11px] text-gray-400">{sorted.length} scheduled</span>
      </div>
      {sorted.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 text-center text-[12px] text-gray-400">
          No appointments scheduled at {branch} for {rangeLabel(range).toLowerCase()}.
        </div>
      ) : (
        <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl shadow-sm">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-gray-50 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">Requirement</th>
                <th className="px-3 py-2">Open Product/Render</th>
                <th className="px-3 py-2 text-center">EC Ready</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((l) => {
                const state = ec[l.id]?.state;
                const dt = new Date(l.cfVisitScheduled!);
                const day = dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", weekday: "short" });
                const t = timeOnly(l.cfVisitScheduled!);
                const url = link3d(l);
                return (
                  <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="font-semibold text-gray-900">{day}</div>
                      <div className="text-[11px] text-gray-400">{t}</div>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-gray-700">{customerName(l)}</td>
                    <td className="px-3 py-2 text-gray-600 text-[11px]">
                      {phoneOf(l) ? <a href={`tel:${phoneOf(l)}`} className="hover:underline">{phoneOf(l)}</a> : "—"}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-gray-600 max-w-xs">{requirement(l)}</td>
                    <td className="px-3 py-2 text-[11px]">
                      {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Open ↗</a> : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {l.convertedAt ? (
                        <div className="inline-flex flex-col items-center gap-0.5">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1">
                            ✓ Visited / Cart created
                          </span>
                          <span className="text-[10px] text-gray-500">
                            {new Date(l.convertedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                          </span>
                        </div>
                      ) : (
                        <>
                          <div className="inline-flex rounded-full border border-gray-300 overflow-hidden">
                            <button
                              onClick={() => onToggle(l, "ready")}
                              disabled={!!savingEc[l.id]}
                              className={`px-3 py-1 text-[11px] font-semibold cursor-pointer transition-colors ${state === "ready" ? "bg-green-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                            >Ready</button>
                            <button
                              onClick={() => onToggle(l, "not_ready")}
                              disabled={!!savingEc[l.id]}
                              className={`px-3 py-1 text-[11px] font-semibold border-l border-gray-300 cursor-pointer transition-colors ${state === "not_ready" ? "bg-rose-500 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                            >Not ready</button>
                          </div>
                          {ec[l.id] && !savingEc[l.id] && (
                            <div className="text-[10px] text-gray-500 mt-1">by {ec[l.id].by} · {new Date(ec[l.id].at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
                          )}
                          {savingEc[l.id] && <div className="text-[10px] text-gray-400 mt-1">Saving…</div>}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── MANAGER SUMMARY: single-branch overview ───────────────────
function ManagerSummary({ leads, branch, ec, footfall, range }: { leads: Lead[]; branch: Branch; ec: EcReadyMap; footfall: FootfallMap; range: DateRange }) {
  const { from, to } = range;
  const scoped = useMemo(
    () => leads.filter((l) => !!l.cfVisitScheduled && inRange(l.cfVisitScheduled!, from, to)),
    [leads, from, to]
  );
  const stats = useMemo(() => computeStats(scoped, ec), [scoped, ec]);
  const perDate = useMemo(() => bookedVsVisitedByDate(scoped), [scoped]);
  // Live footfall = actual walk-ins recorded today (from the footfall service),
  // independent of the date-range preset above.
  const footfallToday = useMemo(() => sumFootfallForDate(footfall, ymd(new Date())), [footfall]);
  return (
    <div>
      <h2 className="text-[13px] font-bold text-gray-800 mb-3 flex items-center gap-2">
        <span className="inline-block h-3.5 w-1 rounded-full bg-[#EAB308]" />
        Store manager summary · <span className="rounded-full bg-[#FEF9C3] text-[#7A5C00] px-2 py-0.5 text-[11px] font-semibold">{branch}</span> · <span className="text-gray-400 font-normal">{rangeLabel(range)}</span>
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
        <StatCard label="🚶 Live footfall today" value={footfallToday} tone="amber" />
        <StatCard label="Total booked" value={stats.total} />
        <StatCard label="Today" value={stats.today} tone="blue" />
        <StatCard label="Visited / Cart" value={stats.visited} tone="emerald" />
        <StatCard label="EC Ready" value={stats.ready} tone="green" />
        <StatCard label="Not ready" value={stats.notReady} tone="rose" />
        <StatCard label="Unmarked" value={stats.unmarked} tone="gray" />
      </div>
      <SlotBreakdown leads={scoped} footfall={footfall} from={from} to={to} />
      {perDate.length > 0 && <BookedVsVisitedTable rows={perDate} branchLabel={branch} />}
    </div>
  );
}

// Compact table showing per-date booked vs converted counts + conversion %.
function BookedVsVisitedTable({ rows, branchLabel }: { rows: { date: string; booked: number; visited: number }[]; branchLabel?: string }) {
  return (
    <div className="mt-6">
      <h3 className="text-[13px] font-bold text-gray-800 mb-3 flex items-center gap-2">
        <span className="inline-block h-3.5 w-1 rounded-full bg-[#EAB308]" />
        Booked vs Visited{branchLabel ? <> · <span className="text-gray-400 font-normal">by date · {branchLabel}</span></> : null}
      </h3>
      <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl shadow-sm">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-gray-50 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2 text-right">Booked</th>
              <th className="px-3 py-2 text-right">Visited</th>
              <th className="px-3 py-2 text-right">Conversion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => {
              const dt = new Date(r.date + "T00:00:00");
              const pct = r.booked > 0 ? Math.round((r.visited / r.booked) * 100) : 0;
              return (
                <tr key={r.date} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2.5 font-medium text-gray-700">
                    {dt.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium">{r.booked}</td>
                  <td className="px-3 py-2.5 text-right font-medium text-emerald-600">{r.visited}</td>
                  <td className="px-3 py-2.5 text-right text-[11px] text-gray-400">{pct}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Shared bits ───────────────────────────────────────────────
function computeStats(leads: Lead[], ec: EcReadyMap) {
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

// Roll up leads into per-date { booked, visited } for the summary tables.
function bookedVsVisitedByDate(leads: Lead[]): { date: string; booked: number; visited: number }[] {
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

// Sum footfall (walk-in) buckets whose date === the given ymd string.
function sumFootfallForDate(footfall: FootfallMap, dateStr: string): number {
  let total = 0;
  for (const [key, count] of Object.entries(footfall)) {
    if (key.startsWith(`${dateStr}|`)) total += count;
  }
  return total;
}

// Per-slot walk-in totals across a [from, to] date window (inclusive).
function footfallBySlot(footfall: FootfallMap, from: string, to: string): Record<string, number> {
  const bySlot: Record<string, number> = {};
  for (const [key, count] of Object.entries(footfall)) {
    const [date, slotKey] = key.split("|");
    if (!slotKey || date < from || date > to) continue;
    bySlot[slotKey] = (bySlot[slotKey] ?? 0) + count;
  }
  return bySlot;
}

function StatCard({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "blue" | "green" | "rose" | "gray" | "emerald" | "amber" }) {
  const map: Record<string, string> = {
    default: "border-gray-200",
    blue: "border-gray-200 border-l-2 border-l-blue-400",
    green: "border-gray-200 border-l-2 border-l-green-400",
    emerald: "border-gray-200 border-l-2 border-l-emerald-400",
    rose: "border-gray-200 border-l-2 border-l-rose-400",
    gray: "border-gray-200",
    amber: "border-gray-200 border-l-2 border-l-amber-400",
  };
  return (
    <div className={`rounded-lg border bg-white px-4 py-3 ${map[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`mt-1 font-mono text-[22px] font-bold ${VALUE_TONE[tone]}`}>{value}</p>
    </div>
  );
}

// Tile accents stay inside the CRM's palette: a hairline left border + a tinted
// number, rather than the fully-tinted card the standalone app used.
const VALUE_TONE: Record<string, string> = {
  default: "text-black",
  blue: "text-blue-600",
  green: "text-green-600",
  emerald: "text-emerald-600",
  rose: "text-rose-500",
  gray: "text-gray-500",
  amber: "text-amber-600",
};

function SlotBreakdown({ leads, footfall, from, to }: { leads: Lead[]; footfall: FootfallMap; from: string; to: string }) {
  const rows = useMemo(() => {
    const walkBySlot = footfallBySlot(footfall, from, to);
    return SLOTS.map((s, si) => {
      const inSlot = leads.filter((l) => l.cfVisitScheduled && slotIndexFor(l.cfVisitScheduled) === si);
      return { ...s, count: inSlot.length, walkIns: walkBySlot[s.key] ?? 0 };
    });
  }, [leads, footfall, from, to]);
  const max = Math.max(1, ...rows.map((r) => r.count + r.walkIns));
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Load by slot</p>
        <div className="flex items-center gap-3 text-[10px] text-gray-500">
          <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-rose-400" /> Booked</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-amber-400" /> Walk-ins</span>
        </div>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-3 text-[11px]">
            <div className="w-28 text-gray-700 font-medium">{r.label}</div>
            <div className="flex-1 h-3 rounded-full bg-gray-100 overflow-hidden flex">
              <div className="h-full bg-rose-400" style={{ width: `${(r.count / max) * 100}%` }} />
              <div className="h-full bg-amber-400" style={{ width: `${(r.walkIns / max) * 100}%` }} />
            </div>
            <div className="w-16 text-right font-semibold text-gray-800 tabular-nums">
              {r.count}
              {r.walkIns > 0 && <span className="text-amber-600 font-medium"> +{r.walkIns}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
