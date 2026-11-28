'use client';

import { fmtL } from '../../../../models/mock-data';
import type { MonthWindow, RevenueOrder } from '@/lib/b2b/revenue';
import { useMemo } from 'react';
import { Hint } from '../../../../ui/info-tip';
import { DIM_META, HEAT_ROWS } from '../constants';
import type { DimKey } from '../types';
import { heatRows, totals } from '../utils';

const shortMonth = (m: MonthWindow) =>
  new Date(`${m.key}-01T00:00:00Z`).toLocaleString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' });

function Cell({ v, max, busy, onClick }: { v: number | null; max: number; busy: boolean; onClick: () => void }) {
  if (v === null) return <td className="px-1 py-1"><div className="h-9 rounded-md bg-gray-50 grid place-items-center text-[10.5px] text-gray-400">{busy ? '…' : 'Unknown'}</div></td>;
  const a = max > 0 ? 0.06 + (v / max) * 0.8 : 0;
  return (
    <td className="px-1 py-1">
      <button
        onClick={onClick}
        disabled={!v}
        title={fmtL(v)}
        className="w-full h-9 rounded-md grid place-items-center tabular-nums text-[11px] font-semibold cursor-pointer disabled:cursor-default"
        style={{ background: v ? `rgba(13, 148, 136, ${a})` : '#F9FAFB', color: a > 0.5 ? '#FFFFFF' : v ? '#1F2937' : '#D1D5DB' }}
      >
        {v ? fmtL(v).replace('₹', '').replace(' L', 'L').replace(' Cr', 'Cr') : '0'}
      </button>
    </td>
  );
}

export function HeatTable({ months, monthOrders, busy, dim, focusKey, compareKey, onPickMonth, onFilter, onOpen }: {
  months: MonthWindow[];
  monthOrders: (RevenueOrder[] | null)[];
  busy: boolean[];
  dim: DimKey;
  focusKey: string;
  compareKey: string;
  onPickMonth: (key: string) => void;
  onFilter: (key: string) => void;
  onOpen: (key: string | null, month: MonthWindow) => void;
}) {
  const rows = useMemo(() => heatRows(monthOrders, dim, HEAT_ROWS), [monthOrders, dim]);
  const all = useMemo(() => monthOrders.map((o) => (o ? totals(o).value : null)), [monthOrders]);
  const allMax = Math.max(0, ...all.map((v) => v ?? 0));

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <h3 className="text-[13px] font-bold text-gray-800">Month by month, by {DIM_META[dim].label.toLowerCase()}</h3>
        <Hint text="Each row is shaded against its own best month, so a dark cell is that row's strong month. The top rows by revenue across these months are shown. Click a month to make it the one you compare, a cell to open its orders, or a name to filter to it. The current month is so far." />
      </div>
      <div className="rounded-lg border border-gray-200 overflow-x-auto">
        <table className="w-full text-[12px] min-w-[720px] table-fixed">
          <colgroup>
            <col className="w-[200px]" />
            {months.map((m) => <col key={m.key} />)}
          </colgroup>
          <thead>
            <tr>
              <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-gray-400 px-3 py-2">{DIM_META[dim].label}</th>
              {months.map((m) => {
                const role = m.key === focusKey ? 'Focus' : m.key === compareKey ? 'vs' : '';
                return (
                  <th key={m.key} className="px-1 py-1.5">
                    <button
                      onClick={() => onPickMonth(m.key)}
                      title={`Compare ${m.label}`}
                      className={`w-full rounded-md py-1 text-[11px] font-semibold cursor-pointer ${
                        role === 'Focus' ? 'bg-gray-900 text-white' : role ? 'bg-gray-200 text-gray-800' : 'text-gray-500 hover:bg-gray-100'
                      }`}
                    >
                      {shortMonth(m)}
                      {role && <span className="block text-[9px] font-bold uppercase tracking-wide opacity-80">{role}</span>}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-gray-100">
              <td className="px-3 py-1 font-bold text-gray-900">All filtered</td>
              {all.map((v, i) => <Cell key={months[i].key} v={v} max={allMax} busy={busy[i]} onClick={() => onOpen(null, months[i])} />)}
            </tr>
            {rows.map((r) => {
              const max = Math.max(0, ...r.cells.map((v) => v ?? 0));
              return (
                <tr key={r.key} className="border-t border-gray-100">
                  <td className="px-3 py-1 min-w-0">
                    <button onClick={() => onFilter(r.key)} title={`Filter to ${r.key}`} className="block w-full text-left truncate font-semibold text-gray-800 hover:underline cursor-pointer">{r.key}</button>
                  </td>
                  {r.cells.map((v, i) => <Cell key={months[i].key} v={v} max={max} busy={busy[i]} onClick={() => onOpen(r.key, months[i])} />)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
