'use client';

import { fmtL } from '../../../../models/mock-data';
import type { RevenueOrder } from '@/lib/b2b/revenue';
import { useEffect, useMemo, useState } from 'react';
import { Segmented } from '../../ui';
import { Hint } from '../../../../ui/info-tip';
import { PAGE_SIZE } from '../../sections/revenue/constants';
import { DIM_META, DROP, GAIN } from '../constants';
import type { ChangeRow, ChangeSort, DimKey } from '../types';
import { changeRows, signedL, sortChanges } from '../utils';

const SORTS: Record<ChangeSort, string> = { change: 'Biggest change', value: 'Biggest now' };
const NUM = 'px-3 py-2 text-right tabular-nums whitespace-nowrap';

function DeltaBar({ delta, max }: { delta: number; max: number }) {
  const w = max > 0 ? Math.max(2, (Math.abs(delta) / max) * 100) : 0;
  return (
    <div className="flex items-center w-[180px]" aria-hidden>
      <div className="w-1/2 flex justify-end">
        {delta < 0 && <div className="h-2.5 rounded-l" style={{ width: `${w}%`, background: DROP }} />}
      </div>
      <div className="w-px h-4 bg-gray-300" />
      <div className="w-1/2">
        {delta > 0 && <div className="h-2.5 rounded-r" style={{ width: `${w}%`, background: GAIN }} />}
      </div>
    </div>
  );
}

function OrdersLink({ n, onClick }: { n: number; onClick: () => void }) {
  if (!n) return <span className="text-gray-300">0</span>;
  return <button onClick={onClick} className="text-[#0F766E] font-semibold hover:underline cursor-pointer">{n}</button>;
}

export function ChangeTable({ focus, compare, focusLabel, compareLabel, dim, onDim, onFilter, onOpen, dims }: {
  focus: RevenueOrder[];
  compare: RevenueOrder[];
  focusLabel: string;
  compareLabel: string;
  dim: DimKey;
  dims: DimKey[];
  onDim: (d: DimKey) => void;
  onFilter: (key: string) => void;
  onOpen: (key: string, which: 'focus' | 'compare') => void;
}) {
  const [sort, setSort] = useState<ChangeSort>('change');
  const [page, setPage] = useState(1);
  const rows = useMemo(() => sortChanges(changeRows(focus, compare, dim), sort), [focus, compare, dim, sort]);
  const max = useMemo(() => rows.reduce((m, r) => Math.max(m, Math.abs(r.delta)), 0), [rows]);
  const focusTotal = useMemo(() => focus.reduce((s, o) => s + o.value, 0), [focus]);

  useEffect(() => { setPage(1); }, [rows]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const dimOptions = Object.fromEntries(dims.map((d) => [d, DIM_META[d].label])) as Record<DimKey, string>;

  const label = (r: ChangeRow) => {
    if (!r.compare.orders) return <span className="ml-1.5 text-[9.5px] font-bold uppercase tracking-wide text-[#0F766E]">new</span>;
    if (!r.focus.orders) return <span className="ml-1.5 text-[9.5px] font-bold uppercase tracking-wide text-[#C2410C]">none now</span>;
    return null;
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-[13px] font-bold text-gray-800">Break down by</h3>
          <Hint text={DIM_META[dim].hint} />
        </div>
        <Segmented options={SORTS} value={sort} onChange={setSort} />
      </div>
      <div className="overflow-x-auto no-scrollbar mb-3">
        <Segmented options={dimOptions} value={dim} onChange={onDim} />
      </div>
      {!rows.length ? (
        <p className="text-[12px] text-gray-400 py-4">No orders in either month match these filters.</p>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-[12px] min-w-[860px]">
            <thead className="text-[10px] uppercase tracking-wider text-gray-400">
              <tr>
                <th className="text-left font-semibold px-3 py-2">{DIM_META[dim].label}</th>
                <th className="text-right font-semibold px-3 py-2">{focusLabel}</th>
                <th className="text-right font-semibold px-3 py-2">{compareLabel}</th>
                <th className="text-center font-semibold px-3 py-2">Change</th>
                <th className="text-right font-semibold px-3 py-2">Orders</th>
                <th className="text-right font-semibold px-3 py-2">Avg order</th>
                <th className="text-right font-semibold px-3 py-2">Share now</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(start, start + PAGE_SIZE).map((r) => (
                <tr key={r.key} className="border-t border-gray-100 hover:bg-teal-50/40">
                  <td className="px-3 py-2 max-w-[280px]">
                    <button onClick={() => onFilter(r.key)} title={`Filter to ${r.key}`} className="text-left font-semibold text-gray-900 hover:underline cursor-pointer truncate max-w-full">
                      {r.key}
                    </button>
                    {label(r)}
                  </td>
                  <td className={`${NUM} font-semibold text-gray-900`}>{fmtL(r.focus.value)}</td>
                  <td className={`${NUM} text-gray-500`}>{fmtL(r.compare.value)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 justify-center">
                      <DeltaBar delta={r.delta} max={max} />
                      <span className="tabular-nums font-semibold w-[84px] text-right text-gray-800">{signedL(r.delta, fmtL)}</span>
                    </div>
                  </td>
                  <td className={NUM}>
                    <OrdersLink n={r.focus.orders} onClick={() => onOpen(r.key, 'focus')} />
                    <span className="text-gray-300 mx-1">/</span>
                    <OrdersLink n={r.compare.orders} onClick={() => onOpen(r.key, 'compare')} />
                  </td>
                  <td className={`${NUM} text-gray-500`}>
                    {r.focus.orders ? fmtL(r.focus.aov) : '—'}
                    <span className="text-gray-300 mx-1">/</span>
                    {r.compare.orders ? fmtL(r.compare.aov) : '—'}
                  </td>
                  <td className={`${NUM} text-gray-500`}>{focusTotal > 0 ? `${((r.focus.value / focusTotal) * 100).toFixed(1)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 mt-2">
        <span className="text-[11px] text-gray-400 tabular-nums">
          {rows.length > 0 && `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, rows.length)} of ${rows.length}. Orders and average order read ${focusLabel} / ${compareLabel}; click a count to open its orders, or a name to filter to it.`}
        </span>
        {pages > 1 && (
          <div className="flex gap-2">
            <button onClick={() => setPage(page - 1)} disabled={page <= 1} className="px-2.5 py-1 text-[11px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 cursor-pointer disabled:opacity-40 disabled:cursor-default">Prev</button>
            <button onClick={() => setPage(page + 1)} disabled={page >= pages} className="px-2.5 py-1 text-[11px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 cursor-pointer disabled:opacity-40 disabled:cursor-default">Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
