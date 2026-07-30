"use client";

// Cross-branch summary of appointment activity. Was a separate admin-only page
// in the standalone tracker app (/dashboard/admin-overview); inside the CRM it's
// one of the Admin "view as" options, so the old AdminGate wrapper is gone —
// AppointmentTrackerClient only renders this for role === "admin".

import { useMemo } from "react";
import { BRANCHES, branchFrom, ymd } from "@/lib/appt-shared";
import type { ApptLead as Lead, EcReadyMap } from "@/lib/appt-shared";
import type { DateRange } from "./AppointmentTrackerClient";

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

// `allLeads` is the parent's already-fetched, all-branch feed — this view used to
// re-sweep Kylas for the same rows. `range` is the tracker's shared date range
// (top control bar), so this screen no longer carries a date card of its own.
export default function AdminOverview({ allLeads, ec, range }: {
  allLeads: Lead[];
  ec: EcReadyMap;
  range: DateRange;
}) {
  const leads = useMemo(() => {
    const fromMs = new Date(range.from + "T00:00:00").getTime();
    const toMs = new Date(range.to + "T23:59:59").getTime();
    return allLeads.filter((l) => {
      const t = new Date(l.cfVisitScheduled ?? "").getTime();
      return !Number.isNaN(t) && t >= fromMs && t <= toMs;
    });
  }, [allLeads, range.from, range.to]);

  const perBranch = useMemo(() => {
    return BRANCHES.map((b) => {
      const scoped = leads.filter((l) => branchFrom(l.companyBusinessType) === b);
      return { branch: b, ...computeStats(scoped, ec) };
    });
  }, [leads, ec]);
  const totals = useMemo(() => perBranch.reduce((acc, r) => ({
    total: acc.total + r.total,
    today: acc.today + r.today,
    ready: acc.ready + r.ready,
    notReady: acc.notReady + r.notReady,
    unmarked: acc.unmarked + r.unmarked,
    visited: acc.visited + r.visited,
  }), { total: 0, today: 0, ready: 0, notReady: 0, unmarked: 0, visited: 0 }), [perBranch]);
  const unmapped = leads.filter((l) => branchFrom(l.companyBusinessType) === null).length;

  // Per-date breakdown across all branches.
  const perDate = useMemo(() => {
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
  }, [leads]);

  return (
    <div>
      <h2 className="text-[13px] font-bold text-gray-800 mb-3 flex items-center gap-2">
        <span className="inline-block h-3.5 w-1 rounded-full bg-[#EAB308]" />
        Admin overview · <span className="text-gray-400 font-normal">all branches</span>
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-4">
        <StatCard label="All branches · Total" value={totals.total} />
        <StatCard label="Today" value={totals.today} tone="blue" />
        <StatCard label="Visited / Cart" value={totals.visited} tone="emerald" />
        <StatCard label="EC Ready" value={totals.ready} tone="green" />
        <StatCard label="Not ready" value={totals.notReady} tone="rose" />
        <StatCard label="Unmarked" value={totals.unmarked} tone="gray" />
      </div>

      {unmapped > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-4 text-[11px] text-amber-700">
          ⚠ {unmapped} appointment{unmapped === 1 ? "" : "s"} without a recognised branch value in <code>companyBusinessType</code>. Check that the field uses one of: {BRANCHES.join(" · ")}.
        </div>
      )}

      <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl shadow-sm">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-gray-50 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              <th className="px-3 py-2">Branch</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Today</th>
              <th className="px-3 py-2 text-right">Visited</th>
              <th className="px-3 py-2 text-right">EC Ready</th>
              <th className="px-3 py-2 text-right">Not ready</th>
              <th className="px-3 py-2 text-right">Unmarked</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {perBranch.map((r) => (
              <tr key={r.branch} className="hover:bg-gray-50 transition-colors">
                <td className="px-3 py-2.5 font-semibold text-gray-800">{r.branch}</td>
                <td className="px-3 py-2.5 text-right font-medium">{r.total}</td>
                <td className="px-3 py-2.5 text-right font-medium">{r.today}</td>
                <td className="px-3 py-2.5 text-right font-medium text-emerald-600">{r.visited}</td>
                <td className="px-3 py-2.5 text-right font-medium text-green-600">{r.ready}</td>
                <td className="px-3 py-2.5 text-right font-medium text-rose-500">{r.notReady}</td>
                <td className="px-3 py-2.5 text-right text-gray-400">{r.unmarked}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Per-date booked vs visited breakdown (across all branches) */}
      {perDate.length > 0 && (
        <div className="mt-6">
          <h3 className="text-[13px] font-bold text-gray-800 mb-3 flex items-center gap-2">
            <span className="inline-block h-3.5 w-1 rounded-full bg-[#EAB308]" />
            Booked vs Visited · <span className="text-gray-400 font-normal">by date, all branches</span>
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
                {perDate.map((r) => {
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
      )}
    </div>
  );
}

function StatCard({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "blue" | "green" | "rose" | "gray" | "emerald" }) {
  const map: Record<string, string> = {
    default: "border-gray-200",
    blue: "border-gray-200 border-l-2 border-l-blue-400",
    green: "border-gray-200 border-l-2 border-l-green-400",
    emerald: "border-gray-200 border-l-2 border-l-emerald-400",
    rose: "border-gray-200 border-l-2 border-l-rose-400",
    gray: "border-gray-200",
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
