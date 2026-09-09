'use client';

import { SLOTS, VALUE_TONE } from '../constants';
import { bookedVsVisitedByDate, computeStats, footfallBySlot, sumFootfallForDate } from '../stats';
import { DateRange, FootfallMap } from '../../types';
import { customerName, inRange, link3d, phoneOf, rangeLabel, requirement, slotIndexFor, timeOnly } from '../utils';
import { Branch, EcReadyMap, ApptLead as Lead, ymd } from '@/lib/appointments/appt-shared';
import { useMemo } from 'react';

export function ReceptionistList({ leads, ec, savingEc, onToggle, branch, range }: {
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

export function ManagerSummary({ leads, branch, ec, footfall, range }: { leads: Lead[]; branch: Branch; ec: EcReadyMap; footfall: FootfallMap; range: DateRange }) {
  const { from, to } = range;
  const scoped = useMemo(
    () => leads.filter((l) => !!l.cfVisitScheduled && inRange(l.cfVisitScheduled!, from, to)),
    [leads, from, to]
  );
  const stats = useMemo(() => computeStats(scoped, ec), [scoped, ec]);
  const perDate = useMemo(() => bookedVsVisitedByDate(scoped), [scoped]);

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
