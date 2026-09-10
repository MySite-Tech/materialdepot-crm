'use client';

import type { TileProps } from '../ui/cards';

import { ArrCell, NpsCard, PctCard, RatingCard, RatingCell } from '../ui/cards';

import { CatAnalyticsApi } from '../../../data/cat-analytics';
import { BookExecSection } from '../sections/book-exec';

export function AnalyticsInstallTable({ M, aArrNote, chartApi, from, to, tileProps }: {
  tileProps: TileProps;
  M: any;
  aArrNote: "" | "Tracking started 2 Jul 2026";
  chartApi: CatAnalyticsApi | null;
  from: string;
  to: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center gap-3.5 px-4 sm:px-6 py-4 border-b border-gray-100">
        <span className="text-2xl flex-none">🔍</span>
        <div className="flex-1">
          <div className="text-base font-bold text-black">Site Audit</div>
          <div className="text-[12px] text-gray-400 mt-0.5">
            Filtered by scheduled audit date · {from} to {to}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-2xl font-bold text-black">{M.aTotal}</div>
          <div className="text-[10px] uppercase tracking-wider text-gray-400">Total Audits in Range</div>
        </div>
      </div>
    
      <div className="px-4 sm:px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-100">Overview</div>
      <div className="px-4 sm:px-6 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 border-b border-gray-100">
        <PctCard tileProps={tileProps}
          label="Job Card & Signature %"
          n={M.aJobCard}
          d={M.aSignKnown ? M.aCompleted : 0}
          sub="Completed audits carrying a client signature"
          note={M.aSignKnown ? '(measured from the signature, not from a rating)' : "Couldn't read signatures — this is not 0%"}
          drill="aJobCard"
        />
        <PctCard tileProps={tileProps} label="Completion Rate %" n={M.aCompleted} d={M.aTotal} sub="Audits that reached completed status" note="" drill="aCompletion" />
        <PctCard tileProps={tileProps} label="Auditor Arrival On Time %" n={M.aArrTot.onTime} d={M.aArrTot.onTime + M.aArrTot.late} sub="> 3 min past slot = delayed" note={aArrNote} drill="aArrival" />
        <PctCard tileProps={tileProps} label="Reschedule Rate %" n={M.aRescheduled} d={M.aTotal} sub="Audits currently in reschedule status" note="" drill="aReschedule" />
        <NpsCard tileProps={tileProps} label="NPS Score" nps={M.AR_nps} prom={M.AR_prom} det={M.AR_det} total={M.AR.length} drill="aRatings" />
        <RatingCard tileProps={tileProps} label="Q1 — Overall Service" avg={M.AR_q1} cnt={M.AR.length} drill="aRatings" />
        <RatingCard tileProps={tileProps} label="Q2 — Auditor Rating" avg={M.AR_q2} cnt={M.AR.length} drill="aRatings" />
        <RatingCard tileProps={tileProps} label="Q3 — Site Cleanliness" avg={M.AR_q3} cnt={M.AR.length} drill="aRatings" />
      </div>
    
      <div className="px-4 sm:px-6 py-2.5 text-[11.5px] text-gray-400 border-b border-gray-100">
        Note: Rescheduled audits originally scheduled in range but moved to a future date appear under the original date AND the new date. Reschedule Rate
        counts audits currently in reschedule status within the selected range.
      </div>
    
      <BookExecSection
        api={chartApi}
        from={from}
        to={to}
        bookings={M.aBookings}
        executions={M.aExecs}
        tats={M.aTats}
        bookLabel="audit sold"
        execLabel="audit done"
        tatLabel="site audits"
        tatNote="One row per completed site audit whose execution lands in this range. Booking date is the audit order&rsquo;s created_at (IST); execution date is its &ldquo;Site audit completed&rdquo; log entry, falling back to the scheduled date where no such entry exists. A pre-booking made by store staff only appears once it becomes a real audit order — reserved slots are excluded from this tab entirely."
      />
    
      <div className="px-4 sm:px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-100">Per-Auditor Breakdown</div>
      {M.auditors.length ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Auditor</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Orders</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Completed</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">
                  On-time Arrival % <small className="normal-case font-normal">from 2 Jul 2026</small>
                </th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Q1 Overall</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Q2 Auditor</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Q3 Cleanliness</th>
              </tr>
            </thead>
            <tbody>
              {M.auditors.map((aud: any, i: number) => (
                <tr key={i}>
                  <td className="px-3 py-2.5 text-[13px] border-t border-gray-100 font-bold">{aud.name}</td>
                  <td className="px-3 py-2.5 text-[13px] border-t border-gray-100">{aud.orders}</td>
                  <td className="px-3 py-2.5 text-[13px] border-t border-gray-100">{aud.completed}</td>
                  <ArrCell onTime={aud.arrOnTime} late={aud.arrLate} />
                  <RatingCell arr={aud.q1} />
                  <RatingCell arr={aud.q2} />
                  <RatingCell arr={aud.q3} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-4 sm:px-6 py-4 text-[13px] text-gray-400">No audits in this date range.</div>
      )}
    </div>
  );
}
