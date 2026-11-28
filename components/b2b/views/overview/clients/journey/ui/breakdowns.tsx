'use client';

import type { Journey } from '@/lib/b2b/revenue/journey';
import { useMemo, useState } from 'react';
import { fmtL } from '../../../../../models/mock-data';
import { CATEGORY_ROWS, COLOR } from '../constants';
import { FirmFocus, monthName, signedL } from '../utils';

export function CategoryShift({ journey, focus, onFocus }: { journey: Journey; focus: FirmFocus | null; onFocus: (f: FirmFocus | null) => void }) {
  const [order, setOrder] = useState<'drop' | 'gain' | 'size'>('drop');
  const [all, setAll] = useState(false);
  const rows = useMemo(() => {
    const list = [...journey.categories];
    if (order === 'drop') list.sort((x, y) => (x.b - x.a) - (y.b - y.a));
    if (order === 'gain') list.sort((x, y) => (y.b - y.a) - (x.b - x.a));
    if (order === 'size') list.sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b));
    return list;
  }, [journey.categories, order]);
  const shown = all ? rows : rows.slice(0, CATEGORY_ROWS);
  const span = Math.max(...rows.map((c) => Math.abs(c.b - c.a)), 1);
  const a = monthName(journey.a);
  const b = monthName(journey.b);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <p className="text-[11px] text-gray-500">An order counts in full under each of its categories, so categories add up to more than revenue.</p>
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 text-[11px] font-semibold">
          {([['drop', 'Biggest drops'], ['gain', 'Biggest gains'], ['size', 'Largest']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setOrder(k)} className={`px-2 py-1 rounded-md cursor-pointer ${order === k ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'}`}>{label}</button>
          ))}
        </div>
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left text-[10.5px] text-gray-400 border-b border-gray-100">
            <th className="py-1.5 pr-2 font-semibold">Category</th>
            <th className="py-1.5 pr-2 font-semibold text-right">{a}</th>
            <th className="py-1.5 pr-2 font-semibold text-right">{b}</th>
            <th className="py-1.5 pr-2 font-semibold text-right">Change</th>
            <th className="py-1.5 w-[22%] min-w-[80px]" />
          </tr>
        </thead>
        <tbody>
          {shown.map((c) => {
            const d = c.b - c.a;
            const w = (50 * Math.abs(d)) / span;
            const active = focus?.kind === 'category' && focus.name === c.name;
            return (
              <tr
                key={c.name}
                onClick={() => onFocus(active ? null : { kind: 'category', name: c.name, label: `Bought ${c.name}` })}
                className={`border-b border-gray-50 cursor-pointer ${active ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
              >
                <td className="py-1.5 pr-2 font-medium text-gray-800">{c.name}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-gray-600 whitespace-nowrap">{fmtL(c.a)}<span className="text-gray-400 text-[10px]"> · {c.firmsA}</span></td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-gray-600 whitespace-nowrap">{fmtL(c.b)}<span className="text-gray-400 text-[10px]"> · {c.firmsB}</span></td>
                <td className={`py-1.5 pr-2 text-right tabular-nums font-semibold whitespace-nowrap ${d < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{signedL(d)}</td>
                <td className="py-1.5">
                  <div className="relative h-4">
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-200" />
                    <div className="absolute top-[3px] h-2.5 rounded-[3px]" style={{ background: d < 0 ? COLOR.loss : COLOR.gain, width: `${w}%`, left: d < 0 ? `${50 - w}%` : '50%' }} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex items-center justify-between mt-2 text-[11px] text-gray-500">
        <span>Number after each amount = firms buying it. Click a category to list its firms.</span>
        {rows.length > CATEGORY_ROWS && (
          <button onClick={() => setAll((v) => !v)} className="font-semibold text-gray-700 hover:text-gray-900 cursor-pointer">{all ? 'Show fewer' : `Show all ${rows.length}`}</button>
        )}
      </div>
    </div>
  );
}

export function PartnerSources({ journey }: { journey: Journey }) {
  const total = journey.sources.reduce((n, s) => n + s.value, 0);
  const top = Math.max(...journey.sources.map((s) => s.value), 1);
  if (!journey.sources.length) return <p className="text-[12px] text-gray-400">No firm joined between these months.</p>;
  return (
    <div className="flex flex-col gap-2">
      {journey.sources.map((s) => (
        <div key={s.source}>
          <div className="flex items-baseline justify-between gap-2 text-[12px]">
            <span className="font-medium text-gray-800">{s.source}</span>
            <span className="tabular-nums text-gray-600">{fmtL(s.value)} <span className="text-gray-400 text-[10.5px]">· {s.firms} {s.firms === 1 ? 'firm' : 'firms'} · {total ? Math.round((100 * s.value) / total) : 0}%</span></span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 mt-1">
            <div className="h-1.5 rounded-full" style={{ width: `${(100 * s.value) / top}%`, background: COLOR.new }} />
          </div>
        </div>
      ))}
      <p className="text-[10.5px] text-gray-400 mt-1">
        Firms that were not ordering through Studio in {monthName(journey.a)} but were in {monthName(journey.b)} (new, revived, back after a gap, or moved from EC Direct), by how B2B holds them now.
      </p>
    </div>
  );
}
