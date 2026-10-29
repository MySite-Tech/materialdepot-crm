'use client';

import { Period } from '../../../models/outreach/kpis';
import { DayRow, PerfCard, PerfKpiDef } from '../../../models/performance/types';
import { fmtNumber, fmtValue, targetFor, tone } from '../../../models/performance/utils';
import { Pager } from '../../kams/ui';
import { PAGE_SIZE } from '../constants';
import { fmtDay } from '../utils';
import { useEffect, useState } from 'react';

const th = 'px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap';

export function DailyTable({ defs, days, clipped, range, heads, period, today }: {
  defs: PerfKpiDef[];
  days: DayRow[];
  clipped: number;
  range: PerfCard;
  heads: number;
  period: Period;
  today: string;
}) {
  const cols = defs.filter((d) => d.daily);
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(days.length / PAGE_SIZE));
  const cur = Math.min(page, pages - 1);
  useEffect(() => setPage(0), [period.from, period.to]);

  const cell = (d: PerfKpiDef, card: PerfCard, p: Period) => {
    const k = card[d.key];
    const t = d.per === 'month' ? null : targetFor(d, heads, p, today);
    return <span title={k.sub} className={k.value === 0 && d.unit !== '%' ? 'text-gray-300' : tone(k.value, t, null).text}>{fmtValue(d, k)}</span>;
  };

  return (
    <section className="bg-white rounded-lg border border-gray-200 min-w-0 overflow-hidden">
      <div className="px-4 pt-3 pb-2 border-b border-gray-100">
        <div className="text-[13px] font-bold text-gray-900">Day by day</div>
        <div className="text-[11px] text-gray-400 mt-0.5">
          Each day is the same calculation run on that day alone. Counts of unique firms or leads do not add up across days, so the
          {' '}<span className="font-semibold text-gray-500">Whole period</span> row is computed on the period, not summed.
          {' '}Daily targets colour each day; monthly targets only colour a whole month.
          {clipped > 0 && <> The {clipped} earliest day{clipped === 1 ? ' is' : 's are'} not listed; pick a shorter period to see {clipped === 1 ? 'it' : 'them'}.</>}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              <th className={`${th} text-left`}>Day</th>
              {cols.map((d) => {
                const t = d.per === 'month' ? null : targetFor(d, heads, { from: today, to: today }, today);
                return (
                  <th key={d.key} title={d.rule} className={`${th} text-right`}>
                    {d.short}
                    <span className="block font-semibold normal-case tracking-normal text-gray-300">{t !== null ? `/ ${fmtNumber(d, t)} a day` : d.kind}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100 bg-gray-50/40">
              <td className="px-3 py-2 font-bold text-gray-900 whitespace-nowrap">Whole period</td>
              {cols.map((d) => <td key={d.key} className="px-3 py-2 text-right font-mono font-bold whitespace-nowrap">{cell(d, range, period)}</td>)}
            </tr>
            {days.slice(cur * PAGE_SIZE, (cur + 1) * PAGE_SIZE).map(({ day, card }) => (
              <tr key={day} className="border-b border-gray-50 last:border-0">
                <td className="px-3 py-2 font-semibold text-gray-700 whitespace-nowrap">{fmtDay(day, true)}</td>
                {cols.map((d) => <td key={d.key} className="px-3 py-2 text-right font-mono whitespace-nowrap">{cell(d, card, { from: day, to: day })}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {days.length > PAGE_SIZE && <Pager total={days.length} page={cur} pages={pages} size={PAGE_SIZE} setPage={setPage} />}
    </section>
  );
}
