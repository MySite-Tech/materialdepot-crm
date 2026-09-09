'use client';

import { ArrCell, NpsCard, PctCard, RatingCard, RatingCell } from '../ui/cards';

import { CatAnalyticsApi } from '../../../data/cat-analytics';
import { BookExecSection } from '../sections/book-exec';

export function AnalyticsAuditTable({ M, chartApi, from, iArrNote, statusDefs, tileProps, to }: {
  M: any;
  chartApi: CatAnalyticsApi | null;
  from: string;
  iArrNote: "" | "Tracking started 2 Jul 2026";
  statusDefs: { k: string; l: string; c: string; }[];
  tileProps: (key: string | undefined, base: string) => any;
  to: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center gap-3.5 px-4 sm:px-6 py-4 border-b border-gray-100">
        <span className="text-2xl flex-none">🔧</span>
        <div className="flex-1">
          <div className="text-base font-bold text-black">Site Installation</div>
          <div className="text-[12px] text-gray-400 mt-0.5">
            Per scheduling attempt · {from} to {to}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-2xl font-bold text-black">{M.iTotal}</div>
          <div className="text-[10px] uppercase tracking-wider text-gray-400">Total Attempts in Range</div>
        </div>
      </div>
    
      <div className="px-4 sm:px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-100">Overview</div>
      <div className="px-4 sm:px-6 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 border-b border-gray-100">
        <PctCard tileProps={tileProps} label="Installer Arrival On Time %" n={M.iArrTot.onTime} d={M.iArrTot.onTime + M.iArrTot.late} sub="> 3 min past slot = delayed" note={iArrNote} drill="iArrival" />
        <PctCard tileProps={tileProps}
          label="Material Depot Audit %"
          n={M.iMDaudit}
          d={M.iUniquePIs.size}
          sub="Install customers who also had an MD site audit"
          note="(phone number match across audit + install orders)"
          drill="iMDaudit"
        />
        <PctCard tileProps={tileProps}
          label="Job Card & Signature %"
          n={M.iJobCard}
          d={M.iCompleted}
          sub="Sub-jobs carrying a client signature on the job card"
          note="(measured from the signature, not from a rating)"
          drill="iJobCard"
        />
        <NpsCard tileProps={tileProps} label="NPS Score" nps={M.IR_nps} prom={M.IR_prom} det={M.IR_det} total={M.IR.length} drill="iRatings" />
        <RatingCard tileProps={tileProps} label="Q1 — Overall Service" avg={M.IR_q1} cnt={M.IR.length} drill="iRatings" />
        <RatingCard tileProps={tileProps} label="Q2 — Installer Rating" avg={M.IR_q2} cnt={M.IR.length} drill="iRatings" />
        <RatingCard tileProps={tileProps} label="Q3 — Site Cleanliness" avg={M.IR_q3} cnt={M.IR.length} drill="iRatings" />
      </div>
    
      <div className="px-4 sm:px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-100">Status Breakdown</div>
      <div className="px-4 sm:px-6 py-4 flex flex-wrap gap-2.5 border-b border-gray-100">
        {statusDefs
          .filter((sd) => M.iByStatus[sd.k])
          .map((sd) => (
            <div key={sd.k} {...tileProps('iStatus:' + sd.k, 'rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 min-w-[120px]')}>
              <div className={`text-xl font-bold ${sd.c}`}>{M.iByStatus[sd.k]}</div>
              <div className="text-[11px] font-semibold text-gray-400 mt-0.5">{sd.l}</div>
              <div className="text-[11px] text-gray-400">{M.iTotal ? Math.round((M.iByStatus[sd.k] / M.iTotal) * 100) + '%' : '—'}</div>
            </div>
          ))}
      </div>
    
      <div className="px-4 sm:px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-100">Delivery Date Tracking</div>
      <div className="px-4 sm:px-6 py-4 flex flex-wrap items-center gap-4 border-b border-gray-100">
        <div {...tileProps('iDelayLog', 'rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 min-w-[120px]')}>
          <div className="text-xl font-bold text-red-600">{M.iDelayed}</div>
          <div className="text-[11px] font-semibold text-gray-400 mt-0.5">Delay mentioned in log</div>
        </div>
        <div {...tileProps('iNoDelayLog', 'rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 min-w-[120px]')}>
          <div className="text-xl font-bold text-green-600">{M.iTotal - M.iDelayed}</div>
          <div className="text-[11px] font-semibold text-gray-400 mt-0.5">No delay mentioned</div>
        </div>
        <div className="w-px self-stretch bg-gray-200"></div>
        <div {...tileProps('iOrigTracked', 'rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 min-w-[120px]')}>
          <div className="text-xl font-bold text-blue-600">{M.origTracked}</div>
          <div className="text-[11px] font-semibold text-gray-400 mt-0.5">With original date tracked</div>
        </div>
        <div {...tileProps('iConfirmedDelayed', 'rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 min-w-[120px]')}>
          <div className="text-xl font-bold text-amber-600">{M.confirmedDelayed}</div>
          <div className="text-[11px] font-semibold text-gray-400 mt-0.5">Confirmed delayed (date changed)</div>
        </div>
        {M.origTracked === 0 ? (
          <div className="text-[11.5px] text-gray-400 self-center">Original date tracking started 2 Jul 2026 — no data for this range yet.</div>
        ) : null}
      </div>
    
      <div className="px-4 sm:px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-100">Live Operations</div>
      <div {...tileProps('iNeedAction', `px-4 sm:px-6 py-4 flex items-center gap-4 border-b border-gray-100 ${M.naCount > 0 ? 'bg-amber-50' : 'bg-green-50'}`)}>
        <div className={`text-4xl font-black leading-none ${M.naCount > 0 ? 'text-amber-600' : 'text-green-600'}`}>{M.naCount}</div>
        <div>
          <div className={`text-[13.5px] font-bold ${M.naCount > 0 ? 'text-amber-600' : 'text-green-600'}`}>
            {M.naCount > 0 ? M.naCount + ' install order' + (M.naCount !== 1 ? 's need' : 'needs') + ' SM attention right now' : 'All clear — no install orders need action'}
          </div>
          <div className="text-[11.5px] text-gray-400 mt-0.5">
            Overdue ops calls + overdue follow-ups + reschedule orders · Live count, not filtered by date range
          </div>
        </div>
      </div>
    
      <BookExecSection
        api={chartApi}
        from={from}
        to={to}
        bookings={M.iBookings}
        executions={M.iExecs}
        tats={M.iTats}
        bookLabel="order placed"
        execLabel="sub-job done"
        tatLabel="installations"
        tatNote="Bookings are counted once per install ORDER on its created_at; executions are counted per SUB-JOB on its completion date, so an order with a wallpaper and a flooring sub-job books once and executes twice. TAT is measured from the parent order&rsquo;s created_at to each sub-job&rsquo;s completion date. Orders created before 1 Jul 2026 carry no log in this tab&rsquo;s payload, so their completion date falls back to the scheduled date — the same documented limitation as the metrics above."
      />
    
      <div className="px-4 sm:px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-100">Per-Installer Breakdown</div>
      {M.installers.length ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Installer</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Orders</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Completed</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">
                  On-time Arrival % <small className="normal-case font-normal">from 2 Jul 2026</small>
                </th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Q1 Overall</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Q2 Installer</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Q3 Cleanliness</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Area / Rolls</th>
              </tr>
            </thead>
            <tbody>
              {M.installers.map((inst: any, i: number) => (
                <tr key={i}>
                  <td className="px-3 py-2.5 text-[13px] border-t border-gray-100 font-bold">{inst.name}</td>
                  <td className="px-3 py-2.5 text-[13px] border-t border-gray-100">{inst.orders}</td>
                  <td className="px-3 py-2.5 text-[13px] border-t border-gray-100">{inst.completed}</td>
                  <ArrCell onTime={inst.arrOnTime} late={inst.arrLate} />
                  <RatingCell arr={inst.q1} />
                  <RatingCell arr={inst.q2} />
                  <RatingCell arr={inst.q3} />
                  <td className="px-3 py-2.5 text-[11px] border-t border-gray-100">
                    {inst.wfQty ? <span className="text-gray-400">{Math.round(inst.wfQty)} sq.ft flooring</span> : null}
                    {inst.wpSqft ? (
                      <>
                        <span className="text-gray-400">
                          {inst.wfQty ? ' · ' : ''}
                          {Math.round(inst.wpSqft)} sq.ft wallpaper ·{' '}
                        </span>
                        <b className="text-purple-600">
                          {inst.wpRolls} roll{inst.wpRolls === 1 ? '' : 's'}
                        </b>
                      </>
                    ) : null}
                    {!inst.wfQty && !inst.wpSqft ? <span className="text-gray-400">—</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-4 sm:px-6 py-4 text-[13px] text-gray-400">No installer assignments in this date range.</div>
      )}
    </div>
  );
}
