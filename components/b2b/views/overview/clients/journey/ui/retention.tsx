'use client';

import type { Journey } from '@/lib/b2b/revenue/journey';
import { useState } from 'react';
import { fmtL } from '../../../../../models/mock-data';
import { COLOR } from '../constants';
import { fmtK, fmtPct, monthName, pct } from '../utils';

const churnPct = (c: { base: number; kept: number } | undefined): number | null => (c?.base ? 100 - (100 * c.kept) / c.base : null);

const shade = (v: number | null): string => (v === null ? '#F9FAFB' : `rgba(79, 70, 229, ${0.08 + 0.72 * Math.min(1, v / 100)})`);

export function RetentionGrid({ journey, partialKey }: { journey: Journey; partialKey: string | null }) {
  const [measure, setMeasure] = useState<'firms' | 'revenue'>('firms');
  const keys = journey.months.map((m) => m.key);
  const cell = (from: string, to: string) => journey.retention.find((r) => r.from === from && r.to === to);
  const value = (from: string, to: string) => {
    const c = cell(from, to);
    if (!c) return null;
    return measure === 'firms' ? pct(c.kept, c.base) : pct(c.keptValue, c.baseValue);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-[11px] text-gray-500">Of the firms ordering in a row&rsquo;s month, the share ordering again in each later month.</p>
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 text-[11px] font-semibold shrink-0">
          {(['firms', 'revenue'] as const).map((m) => (
            <button key={m} onClick={() => setMeasure(m)} className={`px-2 py-1 rounded-md cursor-pointer ${measure === m ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'}`}>
              {m === 'firms' ? 'Firms' : 'Revenue'}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] tabular-nums border-separate border-spacing-[3px]">
          <thead>
            <tr>
              <th className="text-left font-semibold text-gray-400 pr-2">Ordered in</th>
              {keys.slice(1).map((k) => (
                <th key={k} className="font-semibold text-gray-500 text-center">{monthName(k)}{k === partialKey ? '*' : ''}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keys.slice(0, -1).map((from, i) => {
              const base = journey.months[i];
              return (
                <tr key={from}>
                  <td className="pr-2 whitespace-nowrap">
                    <span className="font-semibold text-gray-700">{monthName(from)}</span>
                    <span className="text-gray-400"> · {base.firms} {base.firms === 1 ? 'firm' : 'firms'}</span>
                  </td>
                  {keys.slice(1).map((to) => {
                    if (to <= from) return <td key={to} />;
                    const v = value(from, to);
                    const c = cell(from, to)!;
                    const tip = measure === 'firms'
                      ? `${c.kept} of ${c.base} ${monthName(from)} firms ordered in ${monthName(to)}`
                      : `${monthName(from)} firms spent ${fmtL(c.baseValue)} then and ${fmtL(c.keptValue)} in ${monthName(to)}`;
                    return (
                      <td key={to} title={tip} className="text-center rounded-md py-2 font-semibold" style={{ background: shade(v), color: (v ?? 0) > 45 ? '#fff' : '#1F2937' }}>
                        {fmtPct(v)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10.5px] text-gray-400 mt-2">
        Churn is the rest: of {monthName(journey.a)}&rsquo;s firms, {fmtPct(churnPct(cell(journey.a, journey.b)))} had no order in {monthName(journey.b)}.
        {partialKey ? ' * so far this month.' : ''} Revenue retention can pass 100% when kept firms spend more.
      </p>
    </div>
  );
}

function Spark({ values, labels, fmt, color, marks }: { values: number[]; labels: string[]; fmt: (v: number) => string; color: string; marks: Set<number> }) {
  const top = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-1.5 h-[72px]">
      {values.map((v, i) => (
        <div key={labels[i]} className="flex-1 flex flex-col items-center justify-end h-full min-w-0" title={`${labels[i]}: ${fmt(v)}`}>
          <div className="text-[9.5px] tabular-nums text-gray-500 mb-0.5 whitespace-nowrap">{fmt(v)}</div>
          <div className="w-full max-w-[28px] rounded-t-[4px]" style={{ height: `${Math.max(2, (44 * v) / top)}px`, background: color, opacity: marks.has(i) ? 1 : 0.35 }} />
          <div className={`text-[10px] mt-1 ${marks.has(i) ? 'font-bold text-gray-800' : 'text-gray-400'}`}>{labels[i]}</div>
        </div>
      ))}
    </div>
  );
}

export function MonthTrend({ journey }: { journey: Journey }) {
  const labels = journey.months.map((m) => monthName(m.key));
  const marks = new Set([journey.months.findIndex((m) => m.key === journey.a), journey.months.findIndex((m) => m.key === journey.b)]);
  const rows = [
    { title: 'Revenue', values: journey.months.map((m) => m.value), fmt: (v: number) => fmtL(v).replace('₹', ''), color: COLOR.studio },
    { title: 'Firms ordering', values: journey.months.map((m) => m.firms), fmt: (v: number) => String(v), color: COLOR.ec },
    { title: 'Average order', values: journey.months.map((m) => m.aov), fmt: (v: number) => fmtK(v).replace('₹', ''), color: COLOR.returning },
    { title: 'Orders', values: journey.months.map((m) => m.orders), fmt: (v: number) => String(v), color: COLOR.revived },
  ];
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-4">
      {rows.map((r) => (
        <div key={r.title}>
          <div className="text-[11px] font-semibold text-gray-600 mb-1">{r.title}</div>
          <Spark values={r.values} labels={labels} fmt={r.fmt} color={r.color} marks={marks} />
        </div>
      ))}
    </div>
  );
}
