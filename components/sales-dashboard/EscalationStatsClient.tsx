"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Deal, DealsSearchResponse } from "@/lib/types";

const PAGE_SIZE = 500;
const FRT_KEY = "cfFrtInMins";
const RT_KEY = "cfRtInMins";

const SEARCH_FIELDS = [
  "name",
  "ownedBy",
  "estimatedValue",
  "pipeline",
  "pipelineStage",
  "id",
  "createdAt",
  "updatedAt",
  "customFieldValues",
];

function buildBody(fromIso: string | null, toIso: string | null) {
  const rules: unknown[] = [];
  if (fromIso && toIso) {
    rules.push({
      id: "createdAt",
      field: "createdAt",
      type: "date",
      input: "date",
      operator: "between",
      value: [fromIso, toIso],
    });
  }
  if (rules.length === 0) {
    rules.push({
      id: "multi_field",
      field: "multi_field",
      type: "multi_field",
      input: "multi_field",
      operator: "multi_field",
      value: "Escalation",
    });
  }
  return {
    fields: SEARCH_FIELDS,
    jsonRule: { condition: "AND", rules, valid: true },
  };
}

function isEscalation(deal: Deal) {
  return deal.pipeline?.name?.toLowerCase().includes("escalation") ?? false;
}

type Preset = "today" | "yesterday" | "7_days" | "current_month" | "all_time";

const PRESETS: { value: Preset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7_days", label: "7 days" },
  { value: "current_month", label: "Current month" },
  { value: "all_time", label: "All time" },
];

function presetRange(p: Preset): { from: string; to: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const addDays = (d: Date, n: number) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };
  switch (p) {
    case "today":
      return { from: toLocalDateInput(today), to: toLocalDateInput(today) };
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: toLocalDateInput(y), to: toLocalDateInput(y) };
    }
    case "7_days":
      return { from: toLocalDateInput(addDays(today, -6)), to: toLocalDateInput(today) };
    case "current_month": {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: toLocalDateInput(first), to: toLocalDateInput(today) };
    }
    case "all_time":
      return { from: "", to: "" };
  }
}

function detectPreset(from: string, to: string): Preset | "" {
  if (!from && !to) return "all_time";
  for (const { value } of PRESETS) {
    const r = presetRange(value);
    if (r.from === from && r.to === to) return value;
  }
  return "";
}

function toLocalDateInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDay(input: string) {
  const [y, m, d] = input.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function endOfDay(input: string) {
  const [y, m, d] = input.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

/** Extract base enquiry ID from deal name (e.g. "ENQ2026041464549" from "ENQ2026041464549_Copy_20260416_055023") */
function baseEnqId(name: string): string {
  const m = name.match(/((?:ENQ|MD)\d+)/i);
  return m ? m[1].toUpperCase() : name;
}

function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function isNewEscalationStage(name: string | null | undefined) {
  return (name ?? "").trim().toLowerCase() === "new escalation";
}

function stageName(deal: Deal) {
  return (deal.pipelineStage?.name ?? "").trim().toLowerCase();
}

function isFinalStage(deal: Deal) {
  const s = stageName(deal);
  // Final = Escalation WON, Closed Cancelled, Closed Invalid (or any future "closed *" / "*won*" stage)
  return s === "escalation won" || s.startsWith("closed ") || /\bwon\b/.test(s);
}

function isAwaitingCustomer(deal: Deal) {
  return /awaiting.*customer/.test(stageName(deal));
}

function isInternalDependency(deal: Deal) {
  return /internal\s*dependency/.test(stageName(deal));
}

function hasResolution(deal: Deal) {
  const v = deal.customFieldValues?.["cfResolution"];
  if (v == null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return Boolean(v);
}

function getFrt(deal: Deal): number | null {
  const v = deal.customFieldValues?.[FRT_KEY];
  if (v == null) return null;
  const num = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(num) ? num : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Linear-interpolation percentile (p in 0..1). */
function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 1) return s[0];
  const idx = p * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function fmtMins(v: number | null) {
  if (v == null) return "—";
  return `${v.toFixed(1)} min`;
}

export default function EscalationStatsClient() {
  const today = useMemo(() => toLocalDateInput(new Date()), []);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [fromTime, setFromTime] = useState("10:30");
  const [toTime, setToTime] = useState("19:30");

  const [allDeals, setAllDeals] = useState<Deal[]>([]);
  const [repeatEnqs, setRepeatEnqs] = useState<Set<string>>(new Set());
  const [noteMap, setNoteMap] = useState<Record<number, { description: string; createdAt: string } | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fromIso = from ? startOfDay(from).toISOString() : null;
      const toIso = to ? endOfDay(to).toISOString() : null;

      // Paginate until we've fetched everything created in the window
      const collected: Deal[] = [];
      let page = 0;
      while (true) {
        const res = await fetch(
          `/api/deals/search?page=${page}&size=${PAGE_SIZE}&sort=${encodeURIComponent("createdAt,desc")}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildBody(fromIso, toIso)),
          }
        );
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `Request failed: ${res.status}`);
        }
        const data: DealsSearchResponse = await res.json();
        collected.push(...(data.content ?? []));
        const totalPages = data.totalPages ?? 0;
        page += 1;
        if (page >= totalPages || (data.content ?? []).length === 0) break;
      }
      setAllDeals(collected.filter(isEscalation));

      // Broader fetch (last 90 days) to detect repeat escalations per contact/enquiry
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const broadFrom = ninetyDaysAgo.toISOString();
      const broadTo = new Date().toISOString();
      const broadRes = await fetch(
        `/api/deals/search?page=0&size=${PAGE_SIZE}&sort=${encodeURIComponent("createdAt,desc")}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildBody(broadFrom, broadTo)),
        }
      );
      if (broadRes.ok) {
        const broadData: DealsSearchResponse = await broadRes.json();
        const broadEsc = (broadData.content ?? []).filter(isEscalation);
        const enqDates = new Map<string, Set<string>>();
        for (const d of broadEsc) {
          const enq = baseEnqId(d.name);
          if (!enqDates.has(enq)) enqDates.set(enq, new Set());
          if (d.createdAt) enqDates.get(enq)!.add(dateOnly(d.createdAt));
        }
        const repeats = new Set<string>();
        for (const [enq, dates] of enqDates) {
          if (dates.size > 2) repeats.add(enq);
        }
        setRepeatEnqs(repeats);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const start = startOfDay(from).getTime();
    const end = endOfDay(to).getTime();
    const [fh, fm] = fromTime.split(":").map(Number);
    const [th, tm] = toTime.split(":").map(Number);
    const fromMins = fh * 60 + fm;
    const toMins = th * 60 + tm;
    const inRange = allDeals.filter((d) => {
      if (!d.createdAt) return false;
      const dt = new Date(d.createdAt);
      const t = dt.getTime();
      if (t < start || t > end) return false;
      const minOfDay = dt.getHours() * 60 + dt.getMinutes();
      return fromMins <= toMins
        ? minOfDay >= fromMins && minOfDay <= toMins
        : minOfDay >= fromMins || minOfDay <= toMins; // overnight window
    });
    const raised = inRange.length;
    const acknowledged = inRange.filter((d) => !isNewEscalationStage(d.pipelineStage?.name)).length;
    const now = Date.now();
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    const needsAttention = inRange
      .filter((d) => {
        if (!d.createdAt) return false;
        if (now - new Date(d.createdAt).getTime() <= TWO_HOURS) return false;
        if (isAwaitingCustomer(d)) return false;
        if (hasResolution(d)) return false;
        const s = stageName(d);
        if (s === "closed invalid" || s === "closed cancelled") return false;
        return true;
      })
      .sort(
        (a, b) =>
          new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime()
      );
    const frts = inRange.map(getFrt).filter((v): v is number => v != null);
    const rts = inRange
      .map((d) => {
        const v = d.customFieldValues?.[RT_KEY];
        if (v == null) return null;
        const num = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
        return Number.isFinite(num) ? num : null;
      })
      .filter((v): v is number => v != null);
    const p95 = percentile(frts, 0.95);
    // Outliers = slowest 5% (>= p95). Use ceil so even small samples surface a count.
    const outlierThreshold = p95;
    const outliers = outlierThreshold == null ? [] : frts.filter((v) => v >= outlierThreshold);
    const avgWithoutOutliers =
      outlierThreshold == null
        ? null
        : average(frts.filter((v) => v < outlierThreshold));
    return {
      raised,
      acknowledged,
      needsAttention,
      avgFrt: average(frts),
      medianFrt: median(frts),
      p80: percentile(frts, 0.80),
      p90: percentile(frts, 0.90),
      p95,
      outlierCount: outliers.length,
      avgWithoutOutliers,
      frtSampleSize: frts.length,
      avgRt: average(rts),
      medianRt: median(rts),
      rtSampleSize: rts.length,
    };
  }, [allDeals, from, to]);

  // Fetch latest note for each needs-attention deal
  useEffect(() => {
    if (stats.needsAttention.length === 0) return;
    let cancelled = false;
    async function fetchNotes() {
      for (const deal of stats.needsAttention) {
        if (cancelled) break;
        if (noteMap[deal.id] !== undefined) continue;
        try {
          const detail = await fetch(`/api/deals/${deal.id}`, { cache: "no-store" }).then((r) => r.json());
          const ownerId = detail?.ownedBy?.id;
          const params = new URLSearchParams({
            targetEntityId: String(deal.id),
            targetEntityType: "DEAL",
            sort: "createdAt,desc",
            page: "0",
            size: "1",
          });
          if (ownerId) params.set("targetEntityOwnerId", String(ownerId));
          await new Promise((r) => setTimeout(r, 300));
          const res = await fetch(`/api/notes/relation?${params}`, { cache: "no-store" });
          if (!res.ok) continue;
          const data = await res.json();
          const n = data.content?.[0];
          if (cancelled) break;
          setNoteMap((prev) => ({
            ...prev,
            [deal.id]: n
              ? {
                  description: (n.description ?? "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim(),
                  createdAt: typeof n.createdAt === "number" ? new Date(n.createdAt).toISOString() : n.createdAt ?? "",
                }
              : null,
          }));
        } catch { /* skip */ }
      }
    }
    fetchNotes();
    return () => { cancelled = true; };
  }, [stats.needsAttention]);

  return (
    <div>
      {/* Filter bar */}
      <div className="rounded-lg border border-gray-200 bg-white px-6 py-4 mb-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">From</label>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
            className="rounded border border-gray-200 bg-white px-3 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-[#EAB308]" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">To</label>
          <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)}
            className="rounded border border-gray-200 bg-white px-3 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-[#EAB308]" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Time Preset</label>
          <select
            value={
              fromTime === "10:30" && toTime === "19:30" ? "working"
              : fromTime === "19:31" && toTime === "10:29" ? "non_working"
              : "all"
            }
            onChange={(e) => {
              const v = e.target.value;
              if (v === "working") { setFromTime("10:30"); setToTime("19:30"); }
              else if (v === "non_working") { setFromTime("19:31"); setToTime("10:29"); }
              else { setFromTime("00:00"); setToTime("23:59"); }
            }}
            className="rounded border border-gray-200 bg-white px-3 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-[#EAB308]"
          >
            <option value="all">All hours</option>
            <option value="working">Working hours (10:30 am – 7:30 pm)</option>
            <option value="non_working">Non-working hours (7:31 pm – 10:29 am)</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Quick Range</label>
          <select
            value={detectPreset(from, to)}
            onChange={(e) => {
              const v = e.target.value as Preset | "";
              if (!v) return;
              const r = presetRange(v);
              setFrom(r.from);
              setTo(r.to);
            }}
            className="rounded border border-gray-200 bg-white px-3 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-[#EAB308]"
          >
            <option value="">Custom</option>
            {PRESETS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 rounded bg-[#EAB308] text-black text-[12px] font-semibold hover:bg-[#d4a100] disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && allDeals.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard
            label="Raised"
            value={String(stats.raised)}
            sub={from === to ? `On ${from}` : `${from} → ${to}`}
          />
          <StatCard
            label="Acknowledged"
            value={String(stats.acknowledged)}
            sub={`Out of ${stats.raised}`}
          />
          <StatCard
            label="Avg FRT"
            value={fmtMins(stats.avgFrt)}
            sub={`${stats.frtSampleSize} deals`}
          />
          <StatCard
            label="Median FRT"
            value={fmtMins(stats.medianFrt)}
            sub={`${stats.frtSampleSize} deals`}
          />
          <StatCard
            label="Avg RT"
            value={fmtMins(stats.avgRt)}
            sub={`${stats.rtSampleSize} deals`}
          />
          <StatCard
            label="Median RT"
            value={fmtMins(stats.medianRt)}
            sub={`${stats.rtSampleSize} deals`}
          />
          <StatCard label="FRT P80" value={fmtMins(stats.p80)} sub="80th percentile" />
          <StatCard label="FRT P90" value={fmtMins(stats.p90)} sub="90th percentile" />
          <StatCard label="FRT P95" value={fmtMins(stats.p95)} sub="95th percentile" />
          <StatCard
            label="FRT Outliers"
            value={String(stats.outlierCount)}
            sub={
              stats.avgWithoutOutliers != null
                ? `Avg → ${fmtMins(stats.avgWithoutOutliers)} without`
                : "No outliers"
            }
          />
        </div>
      )}

      {/* Needs attention */}
      {!loading || allDeals.length > 0 ? (
        <div className="mt-8">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-gray-900">
              Needs Attention
              <span className="ml-2 text-gray-400 font-normal normal-case">
                ({stats.needsAttention.length})
              </span>
            </h2>
            <p className="text-[10px] text-gray-400">
              &gt; 2h old · not awaiting customer · no resolution
            </p>
          </div>
          {stats.needsAttention.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-6 text-[12px] text-gray-400">
              Nothing needs attention in this window.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#FAFAFA] text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    <th className="px-4 py-3">Deal</th>
                    <th className="px-4 py-3">Stage</th>
                    <th className="px-4 py-3">Owner</th>
                    <th className="px-4 py-3">Latest Note</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3 text-right">Age</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {stats.needsAttention.map((d) => {
                    const isRepeat = repeatEnqs.has(baseEnqId(d.name));
                    return (
                    <tr key={d.id} className={`hover:bg-[#FFFAF7] ${isRepeat ? "bg-amber-50/60" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">
                          {isRepeat && (
                            <span title="Repeat escalation — 3+ escalations on different dates" className="mr-1.5">⚠️</span>
                          )}
                          {d.name}
                        </div>
                        <div className="text-xs text-gray-400">
                          #{d.id}
                          {isRepeat && (
                            <span className="ml-2 text-amber-600 font-medium">Repeat escalation</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {d.pipelineStage?.name ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#FFF7F0] border border-gray-200 text-gray-600">
                            {d.pipelineStage.name}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{d.ownedBy?.name ?? "—"}</td>
                      <td className="px-4 py-3 max-w-xs">
                        {noteMap[d.id] === undefined ? (
                          <div className="h-4 w-24 rounded bg-gray-100 animate-pulse" />
                        ) : noteMap[d.id] ? (
                          <div>
                            <p className="text-xs text-gray-800 line-clamp-2">{noteMap[d.id]!.description}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {new Date(noteMap[d.id]!.createdAt).toLocaleString("en-IN", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">No notes</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {d.createdAt
                          ? new Date(d.createdAt).toLocaleString("en-IN", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-medium text-[#EAB308]">
                        {d.createdAt ? formatAge(Date.now() - new Date(d.createdAt).getTime()) : "—"}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function formatAge(ms: number) {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs < 24) return rem ? `${hrs}h ${rem}m` : `${hrs}h`;
  const days = Math.floor(hrs / 24);
  const remH = hrs % 24;
  return remH ? `${days}d ${remH}h` : `${days}d`;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-1 font-mono text-[22px] font-bold text-black">{value}</p>
      <p className="mt-0.5 text-[10px] text-gray-400">{sub}</p>
    </div>
  );
}
