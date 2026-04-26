"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { Deal, DealsSearchResponse } from "@/lib/types";

const PAGE_SIZE = 500;

const SEARCH_FIELDS = [
  "name", "ownedBy", "pipeline", "pipelineStage", "id",
  "createdAt", "updatedAt", "customFieldValues",
];

type Preset = "today" | "yesterday" | "current_week" | "current_month";

const PRESETS: { value: Preset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "current_week", label: "Current week" },
  { value: "current_month", label: "Current month" },
];

function toDateInput(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDay(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function endOfDay(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

function presetRange(p: Preset) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const add = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  switch (p) {
    case "today": return { from: toDateInput(today), to: toDateInput(today) };
    case "yesterday": { const y = add(today, -1); return { from: toDateInput(y), to: toDateInput(y) }; }
    case "current_week": { const dow = today.getDay(); const mon = add(today, dow === 0 ? -6 : 1 - dow); return { from: toDateInput(mon), to: toDateInput(today) }; }
    case "current_month": return { from: toDateInput(new Date(today.getFullYear(), today.getMonth(), 1)), to: toDateInput(today) };
  }
}

function detectPreset(from: string, to: string): Preset | "" {
  for (const { value } of PRESETS) { const r = presetRange(value); if (r.from === from && r.to === to) return value; }
  return "";
}

function isEscalationWithResolution(d: Deal) {
  const p = (d.pipeline?.name ?? "").toLowerCase();
  if (!p.includes("escalation")) return false;
  if (!cfName(d.customFieldValues?.["cfResolution"])) return false;
  if (!cfName(d.customFieldValues?.["cfEscalationClassification"])) return false;
  return true;
}

function cfName(val: unknown): string {
  if (!val) return "";
  if (typeof val === "object" && (val as { name?: string }).name) return (val as { name: string }).name;
  if (Array.isArray(val)) return val.map((v) => (v as { name?: string })?.name ?? "").filter(Boolean).join(", ");
  return String(val);
}

function formatDT(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatHours(ms: number) {
  const hrs = ms / 3600000;
  if (hrs < 1) return `${Math.round(ms / 60000)}m`;
  if (hrs < 24) return `${hrs.toFixed(1)}h`;
  const days = Math.floor(hrs / 24);
  const remH = (hrs % 24).toFixed(1);
  return `${days}d ${remH}h`;
}

/** Calculate business hours between two timestamps (10:30am–7:30pm IST, Mon–Sat) */
function businessHoursMs(startIso: string, endIso: string): number {
  const WORK_START_MIN = 10 * 60 + 30; // 10:30
  const WORK_END_MIN = 19 * 60 + 30; // 19:30
  const WORK_DAY_MS = (WORK_END_MIN - WORK_START_MIN) * 60000; // 9h in ms
  const IST_OFFSET = 5.5 * 3600000;

  const start = new Date(startIso).getTime() + IST_OFFSET;
  const end = new Date(endIso).getTime() + IST_OFFSET;
  if (end <= start) return 0;

  let total = 0;
  let cursor = start;

  while (cursor < end) {
    const d = new Date(cursor);
    const dayOfWeek = d.getUTCDay(); // 0=Sun
    const minsInDay = d.getUTCHours() * 60 + d.getUTCMinutes();

    // Skip Sunday
    if (dayOfWeek === 0) {
      const nextDay = new Date(cursor);
      nextDay.setUTCHours(0, 0, 0, 0);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      cursor = nextDay.getTime();
      continue;
    }

    // Before work start — jump to work start
    if (minsInDay < WORK_START_MIN) {
      const jump = new Date(cursor);
      jump.setUTCHours(Math.floor(WORK_START_MIN / 60), WORK_START_MIN % 60, 0, 0);
      cursor = jump.getTime();
      continue;
    }

    // After work end — jump to next day start
    if (minsInDay >= WORK_END_MIN) {
      const nextDay = new Date(cursor);
      nextDay.setUTCHours(0, 0, 0, 0);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      cursor = nextDay.getTime();
      continue;
    }

    // Within working hours — count until work end or `end`, whichever is sooner
    const dayEnd = new Date(cursor);
    dayEnd.setUTCHours(Math.floor(WORK_END_MIN / 60), WORK_END_MIN % 60, 0, 0);
    const segmentEnd = Math.min(end, dayEnd.getTime());
    total += segmentEnd - cursor;
    cursor = segmentEnd;
  }

  return total;
}

interface ResolvedDeal {
  id: number;
  name: string;
  owner: string;
  stage: string;
  resolution: string;
  attribution: string;
  createdAt: string;
  resolvedAt: string;
  deltaMs: number;
}

export default function ResolutionTimelineClient() {
  const today = useMemo(() => toDateInput(new Date()), []);
  const [from, setFrom] = useState("2026-03-01");
  const [to, setTo] = useState("2026-03-31");

  const [deals, setDeals] = useState<Deal[]>([]);
  const [resolved, setResolved] = useState<ResolvedDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingFeeds, setLoadingFeeds] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchDeals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fromIso = startOfDay(from).toISOString();
      const toIso = endOfDay(to).toISOString();
      const collected: Deal[] = [];
      let page = 0;
      while (true) {
        const res = await fetch(
          `/api/deals/search?page=${page}&size=${PAGE_SIZE}&sort=${encodeURIComponent("createdAt,desc")}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fields: SEARCH_FIELDS,
              jsonRule: {
                condition: "AND",
                rules: [{
                  id: "createdAt", field: "createdAt", type: "date", input: "date",
                  operator: "between", value: [fromIso, toIso],
                }],
                valid: true,
              },
            }),
          }
        );
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        const data: DealsSearchResponse = await res.json();
        collected.push(...(data.content ?? []));
        page += 1;
        if (page >= (data.totalPages ?? 0) || (data.content ?? []).length === 0) break;
      }
      const esc = collected.filter(isEscalationWithResolution);
      setDeals(esc);
      return esc;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      return [];
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  async function fetchResolutionDates(dealList: Deal[]) {
    if (dealList.length === 0) { setResolved([]); setLoadingFeeds(false); return; }

    setLoadingFeeds(true);
    setProgress({ done: 0, total: dealList.length });
    const results: ResolvedDeal[] = [];
    let done = 0;

    for (const deal of dealList) {
      await new Promise((r) => setTimeout(r, 300));
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch(`/api/feeds/search?page=0&size=50&sort=performedAt%2Cdesc`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonRule: {
                condition: "AND",
                rules: [
                  { field: "related_to", operator: "equal", id: "related_to", type: "related_lookup", value: { entity: "deal", id: String(deal.id) } },
                  { field: "systemDefault", operator: "equal", id: "systemDefault", type: "boolean", value: false },
                  { field: "category", operator: "equal", id: "category", type: "string", value: "ALL" },
                ],
                valid: true,
              },
            }),
          });
          if (res.status === 429) {
            await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
            continue;
          }
          if (!res.ok) break;
          const data = await res.json();
          for (const f of data.content ?? []) {
            if (f.action?.event !== "UPDATED") continue;
            if (f.payload?.new && "cfResolution" in f.payload.new) {
              const resolvedAt = f.createdAt;
              const createdMs = new Date(deal.createdAt ?? "").getTime();
              const resolvedMs = new Date(resolvedAt).getTime();
              results.push({
                id: deal.id,
                name: deal.name,
                owner: deal.ownedBy?.name ?? "—",
                stage: deal.pipelineStage?.name ?? "—",
                resolution: cfName(deal.customFieldValues?.["cfResolution"]),
                attribution: cfName(deal.customFieldValues?.["cfEscalationClassification"]),
                createdAt: deal.createdAt ?? "",
                resolvedAt,
                deltaMs: businessHoursMs(deal.createdAt ?? "", resolvedAt),
              });
              break;
            }
          }
          break;
        } catch { if (attempt === 2) break; }
      }
      done++;
      if (done % 5 === 0 || done === dealList.length) {
        setResolved([...results].sort((a, b) => a.deltaMs - b.deltaMs));
        setProgress({ done, total: dealList.length });
      }
    }

    setResolved(results.sort((a, b) => a.deltaMs - b.deltaMs));
    setProgress(null);
    setLoadingFeeds(false);
  }

  useEffect(() => {
    fetchDeals().then((deals) => fetchResolutionDates(deals));
  }, [fetchDeals]);


  // Breakdowns from ALL deals (not just resolved — computed from fetched deal list)
  const breakdowns = useMemo(() => {
    function countField(field: string) {
      const counts: Record<string, number> = {};
      let totalMentions = 0;
      for (const d of deals) {
        const val = d.customFieldValues?.[field];
        const names = Array.isArray(val)
          ? (val as { name?: string }[]).map((v) => v.name ?? "").filter(Boolean)
          : cfName(val) ? [cfName(val)] : [];
        for (const n of names) { counts[n] = (counts[n] ?? 0) + 1; totalMentions++; }
      }
      // Use total mentions as denominator so percentages sum to 100%
      const denom = totalMentions || 1;
      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count, pct: ((count / denom) * 100).toFixed(1) }));
    }
    return {
      escalationType: countField("cfRaiseEscalation"),
      attribution: countField("cfEscalationClassification"),
      resolution: countField("cfResolution"),
    };
  }, [deals]);

  // Resolution time buckets — only working hours deals
  const WORK_START = 10 * 60 + 30;
  const WORK_END = 19 * 60 + 30;
  const workingResolved = resolved.filter((d) => {
    const dt = new Date(d.createdAt);
    const mins = dt.getHours() * 60 + dt.getMinutes();
    return mins >= WORK_START && mins <= WORK_END;
  });
  const H5 = 5 * 3600000;
  const under5h = workingResolved.filter((d) => d.deltaMs <= H5).length;
  const over5h = workingResolved.filter((d) => d.deltaMs > H5).length;
  const pctBucket = (n: number) => workingResolved.length > 0 ? ((n / workingResolved.length) * 100).toFixed(1) : "0";

  const avgDeltaWorking = workingResolved.length > 0
    ? workingResolved.reduce((s, d) => s + d.deltaMs, 0) / workingResolved.length
    : null;

  return (
    <div>
      {/* Filters */}
      <div className="rounded-lg border border-gray-200 bg-white px-6 py-4 mb-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Quick range</label>
          <select
            value={detectPreset(from, to)}
            onChange={(e) => {
              const v = e.target.value as Preset | "";
              if (!v) return;
              const r = presetRange(v);
              setFrom(r.from);
              setTo(r.to);
            }}
            className="rounded border border-gray-200 bg-white px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#EAB308]"
          >
            <option value="">Custom</option>
            {PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">From</label>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
            className="rounded border border-gray-200 bg-white px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#EAB308]" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">To</label>
          <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)}
            className="rounded border border-gray-200 bg-white px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#EAB308]" />
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Summary */}
      {!loading && (
        <div className="space-y-4 mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase text-gray-400">Total escalations</p>
              <p className="font-mono text-[22px] font-bold text-black mt-1">{deals.length}</p>
              <p className="text-xs text-gray-400">with resolution + attribution</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase text-gray-400">Resolved (with timestamp)</p>
              <p className="font-mono text-[22px] font-bold text-black mt-1">
                {resolved.length}
                {loadingFeeds && progress && (
                  <span className="text-sm font-normal text-gray-400 ml-2">
                    ({progress.done}/{progress.total})
                  </span>
                )}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase text-gray-400">Working hours resolved</p>
              <p className="font-mono text-[22px] font-bold text-black mt-1">{workingResolved.length}</p>
              <p className="text-xs text-gray-400">created 10:30am–7:30pm</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase text-gray-400">Avg resolve time (working)</p>
              <p className="font-mono text-[22px] font-bold text-black mt-1">{avgDeltaWorking ? formatHours(avgDeltaWorking) : "—"}</p>
            </div>
          </div>

          {workingResolved.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase text-gray-400 mb-3">
                Resolution time — working hours escalations only
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-end gap-2 mb-1">
                    <span className="text-3xl font-bold text-green-600">{pctBucket(under5h)}%</span>
                    <span className="text-sm text-gray-400 mb-1">({under5h})</span>
                  </div>
                  <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${pctBucket(under5h)}%` }} />
                  </div>
                  <p className="text-sm text-gray-600 mt-1 font-medium">&le; 5 hours</p>
                </div>
                <div>
                  <div className="flex items-end gap-2 mb-1">
                    <span className="text-3xl font-bold text-red-600">{pctBucket(over5h)}%</span>
                    <span className="text-sm text-gray-400 mb-1">({over5h})</span>
                  </div>
                  <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full bg-red-500 rounded-full" style={{ width: `${pctBucket(over5h)}%` }} />
                  </div>
                  <p className="text-sm text-gray-600 mt-1 font-medium">&gt; 5 hours</p>
                </div>
              </div>
            </div>
          )}

          {/* Classification breakdowns */}
          {deals.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <BreakdownCard title="Escalation Type" items={breakdowns.escalationType} color="indigo" />
              <BreakdownCard title="Attribution" items={breakdowns.attribution} color="amber" />
              <BreakdownCard title="Resolution" items={breakdowns.resolution} color="green" />
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-2 mb-4">
          <p className="text-xs text-gray-500">Loading deals…</p>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </div>
      )}
      {loadingFeeds && (
        <div className="mb-4">
          <div className="flex items-center gap-3">
            <p className="text-xs text-gray-500">
              Fetching resolution timestamps…
              {progress && ` ${progress.done}/${progress.total}`}
            </p>
            {progress && (
              <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden max-w-xs">
                <div
                  className="h-full bg-[#EAB308] rounded-full transition-all"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      {!loading && !loadingFeeds && resolved.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#FAFAFA] text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                <th className="px-4 py-3">Deal</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Resolution</th>
                <th className="px-4 py-3">Attribution</th>
                <th className="px-4 py-3">Created At</th>
                <th className="px-4 py-3">Resolution Updated At</th>
                <th className="px-4 py-3 text-right">Time Taken</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {resolved.map((d) => (
                <tr key={d.id} className="hover:bg-[#FFFAF7]">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 text-xs">{d.name}</div>
                    <div className="text-xs text-gray-400">#{d.id} · {d.stage}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700 text-xs">{d.owner}</td>
                  <td className="px-4 py-3">
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      {d.resolution}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{d.attribution}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{formatDT(d.createdAt)}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{formatDT(d.resolvedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-xs font-semibold ${
                      d.deltaMs < 3600000 ? "text-green-600" :
                      d.deltaMs < 14400000 ? "text-yellow-600" :
                      "text-red-600"
                    }`}>
                      {formatHours(d.deltaMs)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !loadingFeeds && resolved.length === 0 && (
        <p className="text-center py-10 text-sm text-gray-400">
          No resolved escalation deals found in this range.
        </p>
      )}
    </div>
  );
}

const BAR_COLORS: Record<string, { bg: string; bar: string }> = {
  indigo: { bg: "bg-gray-100", bar: "bg-[#EAB308]" },
  amber: { bg: "bg-gray-100", bar: "bg-[#EAB308]" },
  green: { bg: "bg-gray-100", bar: "bg-[#EAB308]" },
};

function BreakdownCard({
  title,
  items,
  color,
}: {
  title: string;
  items: { name: string; count: number; pct: string }[];
  color: string;
}) {
  const c = BAR_COLORS[color] ?? BAR_COLORS.indigo;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase text-gray-400 mb-3">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-gray-400">No data</p>
      ) : (
        <div className="space-y-2.5">
          {items.map((item) => (
            <div key={item.name}>
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="text-gray-700 truncate flex-1 mr-2">{item.name}</span>
                <span className="text-gray-500 shrink-0">{item.count} ({item.pct}%)</span>
              </div>
              <div className={`h-1.5 rounded-full ${c.bg} overflow-hidden`}>
                <div
                  className={`h-full rounded-full ${c.bar}`}
                  style={{ width: `${parseFloat(item.pct)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
