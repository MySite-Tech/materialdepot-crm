'use client';

import { fmtL } from '../../../../../models/mock-data';
import { BridgeCell, BridgeRow, OrderBucket, RevenueOrder, bridgeRows, bridgeTotal, isCounted } from '@/lib/b2b/revenue';
import { useMemo, useState } from 'react';
import { Hint } from '../../../ui';
import { BUCKET_LABELS, BUCKET_RULE } from '../constants';
import { OrderDrawer } from './order-drawer';

const inRevenue = (r: BridgeRow) => isCounted({ bucket: r.bucket } as RevenueOrder);

function Cell({ c, title, onOpen, strong }: { c: BridgeCell; title: string; onOpen: (title: string, c: BridgeCell) => void; strong?: boolean }) {
  if (!c.orders.length) return <td className="px-3 py-2 text-right text-gray-300">—</td>;
  return (
    <td className="px-3 py-2 text-right whitespace-nowrap">
      <button onClick={() => onOpen(title, c)} className={`tabular-nums cursor-pointer hover:text-[#0F766E] hover:underline ${strong ? 'font-bold text-gray-900' : 'text-gray-700'}`}>
        {fmtL(c.value)} <span className="text-[10.5px] font-normal text-gray-400">· {c.orders.length}</span>
      </button>
    </td>
  );
}

export function BranchBridge({ orders }: { orders: RevenueOrder[] }) {
  const [drill, setDrill] = useState<{ title: string; rows: RevenueOrder[] } | null>(null);
  const rows = useMemo(() => bridgeRows(orders), [orders]);
  const open = (title: string, c: BridgeCell) => setDrill({ title, rows: c.orders });
  const side = (bucket: OrderBucket) => BUCKET_LABELS[bucket];

  const counted = rows.filter(inRevenue);
  const uncounted = rows.filter((r) => !inRevenue(r));
  const revenue = { branch: bridgeTotal(rows, 'branch', inRevenue), store: bridgeTotal(rows, 'store', inRevenue) };
  const allRevenue: BridgeCell = { value: revenue.branch.value + revenue.store.value, orders: [...revenue.branch.orders, ...revenue.store.orders] };
  const won = bridgeTotal(rows, 'branch', () => true);

  const line = (r: BridgeRow) => (
    <tr key={r.bucket} className="border-t border-gray-100">
      <td className="px-3 py-2 min-w-[240px]">
        <div className="font-semibold text-gray-800">{side(r.bucket)}</div>
        <div className="text-[10.5px] text-gray-400">{BUCKET_RULE[r.bucket]}</div>
      </td>
      <Cell c={r.branch} title={`${side(r.bucket)} · booked on the B2B branch`} onOpen={open} />
      <Cell c={r.store} title={`${side(r.bucket)} · booked at a store`} onOpen={open} />
      <Cell c={{ value: r.branch.value + r.store.value, orders: [...r.branch.orders, ...r.store.orders] }} title={side(r.bucket)} onOpen={open} />
    </tr>
  );

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <div className="flex items-center gap-1.5 mb-2">
        <h3 className="text-[12px] font-bold text-gray-700">How this ties to Orders on the B2B branch</h3>
        <Hint text="Branch means where the order was booked. Channel means who held the cart and whose number it is. They are two different cuts of orders, so every order here sits in one row and one column. Lists every placed order in this month. Filters do not apply here." />
      </div>
      <div className="rounded-lg border border-gray-200 overflow-x-auto">
        <table className="w-full text-[12px] min-w-[640px]">
          <thead className="text-[10px] uppercase tracking-wider text-gray-400">
            <tr>
              <th className="text-left font-semibold px-3 py-2">Channel</th>
              <th className="text-right font-semibold px-3 py-2">Booked on B2B branch</th>
              <th className="text-right font-semibold px-3 py-2">Booked at a store</th>
              <th className="text-right font-semibold px-3 py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {counted.map(line)}
            <tr className="border-t border-gray-200 bg-gray-50">
              <td className="px-3 py-2 font-bold text-gray-900">B2B revenue</td>
              <Cell c={revenue.branch} title="In B2B revenue · booked on the B2B branch" onOpen={open} strong />
              <Cell c={revenue.store} title="In B2B revenue · booked at a store" onOpen={open} strong />
              <Cell c={allRevenue} title="B2B revenue" onOpen={open} strong />
            </tr>
            {uncounted.map(line)}
            <tr className="border-t border-gray-200 bg-gray-50">
              <td className="px-3 py-2 font-bold text-gray-900">
                Won on the B2B branch
                <div className="text-[10.5px] font-normal text-gray-400">Matches Won in the section below, by order date</div>
              </td>
              <Cell c={won} title="Won · booked on the B2B branch" onOpen={open} strong />
              <td />
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      {drill && <OrderDrawer title={drill.title} orders={drill.rows} onClose={() => setDrill(null)} />}
    </div>
  );
}
