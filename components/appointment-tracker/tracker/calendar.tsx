'use client';

import { SLOTS } from '../constants/appointments';
import { capacityForDate } from './rota-data';
import { FootfallMap, RotaPlan } from '../types/appointments';
import { customerName, emptyBranchData, shortDate, slotIndexFor, timeOnly } from '../utils/appointments';
import { Branch, ApptLead as Lead, ymd } from '@/lib/appointments/appt-shared';
import { useMemo } from 'react';

export function PresalesCalendar({ leads, branch, from, to, plan, footfall }: {
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

                        <span className={`absolute left-0 top-1 bottom-1 w-[3px] rounded-full ${rail}`} />

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

                        <div className={`mt-1.5 h-1 w-full rounded-full ${barTrack} overflow-hidden`}>
                          <div className={`h-full ${barFill} rounded-full transition-all`} style={{ width: `${Math.round(pct * 100)}%` }} />
                        </div>

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
