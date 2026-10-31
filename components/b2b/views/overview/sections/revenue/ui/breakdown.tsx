'use client';

import { fmtL } from '../../../../../models/mock-data';
import { B2B_TEAM_LABEL } from '@/lib/b2b/team/constants';
import { RevenueOrder, rollupBy, rollupOrders } from '@/lib/b2b/revenue';
import { useEffect, useMemo, useState } from 'react';
import { Segmented } from '../../../ui';
import { BREAKDOWN_LABELS, BUCKET_LABELS, BreakdownView, CHANNEL_META, PAGE_SIZE } from '../constants';
import { OrderDrawer } from './order-drawer';

const CELL = 'px-3 py-2 whitespace-nowrap';
const NUM = `${CELL} text-right tabular-nums`;
const cash = (n: number) => (n > 0 ? fmtL(n) : '—');
const firmOf = (o: RevenueOrder) => o.firm;
const personOf = (o: RevenueOrder) => o.person;

interface Drill { title: string; rows: RevenueOrder[] }

function RollupTable({ rows, head, onOpen }: { rows: ReturnType<typeof rollupBy>; head: string; onOpen: (key: string) => void }) {
  return (
    <table className="w-full text-[12px] min-w-[640px]">
      <thead className="text-[10px] uppercase tracking-wider text-gray-400">
        <tr>
          <th className="text-left font-semibold px-3 py-2">{head}</th>
          <th className="text-right font-semibold px-3 py-2">Direct</th>
          <th className="text-right font-semibold px-3 py-2">EC-directed</th>
          <th className="text-right font-semibold px-3 py-2">Referred</th>
          <th className="text-right font-semibold px-3 py-2">Orders</th>
          <th className="text-right font-semibold px-3 py-2">Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} onClick={() => onOpen(r.key)} className="border-t border-gray-100 cursor-pointer hover:bg-teal-50/40">
            <td className="px-3 py-2 min-w-0 max-w-[320px]">
              <div className="font-semibold text-gray-900 truncate">{r.key}</div>
              {r.detail && <div className="text-[10.5px] text-gray-400 truncate">{r.detail}</div>}
            </td>
            <td className={NUM}>{cash(r.direct)}</td>
            <td className={NUM}>{cash(r.ec)}</td>
            <td className={NUM}>{cash(r.referred)}</td>
            <td className={`${NUM} text-gray-500`}>{r.orders}</td>
            <td className={`${NUM} font-semibold text-gray-900`}>{fmtL(r.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OrdersTable({ rows, onOpen }: { rows: RevenueOrder[]; onOpen: (o: RevenueOrder) => void }) {
  return (
    <table className="w-full text-[12px] min-w-[960px]">
      <thead className="text-[10px] uppercase tracking-wider text-gray-400">
        <tr>
          {['Enquiry ID', 'Cart date', 'Firm', 'Channel', 'Credited to', 'On the cart', 'Status'].map((h) => <th key={h} className="text-left font-semibold px-3 py-2">{h}</th>)}
          <th className="text-right font-semibold px-3 py-2">Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((o) => (
          <tr key={o.id} onClick={() => onOpen(o)} className="border-t border-gray-100 cursor-pointer hover:bg-teal-50/40">
            <td className={`${CELL} font-mono text-[11px] text-[#0F766E]`}>{o.id}</td>
            <td className={`${CELL} text-gray-500`}>{o.day}</td>
            <td className="px-3 py-2 max-w-[240px]">
              <div className="font-semibold text-gray-900 truncate">{o.firm || 'Unnamed'}</div>
              {o.client && o.client !== o.firm && <div className="text-[10.5px] text-gray-400 truncate">{o.client}</div>}
            </td>
            <td className={CELL}>
              <span className="inline-flex items-center gap-1.5">
                {o.bucket in CHANNEL_META && <span className="w-2 h-2 rounded-sm" style={{ background: CHANNEL_META[o.bucket as keyof typeof CHANNEL_META].color }} />}
                {BUCKET_LABELS[o.bucket]}
              </span>
              {o.redirectLogged && <div className="text-[10.5px] text-gray-400">Redirect logged</div>}
            </td>
            <td className={CELL}>
              {o.person || '—'}
              {o.team && <div className="text-[10.5px] text-gray-400">{B2B_TEAM_LABEL[o.team]}</div>}
            </td>
            <td className={CELL}>
              {o.placedBy || '—'}
              <div className="text-[10.5px] text-gray-400">{o.store}</div>
            </td>
            <td className={`${CELL} text-gray-500`}>{o.status}</td>
            <td className={`${NUM} font-semibold text-gray-900`}>{fmtL(o.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Breakdown({ orders }: { orders: RevenueOrder[] }) {
  const [view, setView] = useState<BreakdownView>('firms');
  const [page, setPage] = useState(1);
  const [drill, setDrill] = useState<Drill | null>(null);

  const firms = useMemo(() => rollupBy(orders, firmOf, personOf), [orders]);
  const people = useMemo(() => rollupBy(orders, personOf, (o) => (o.team ? B2B_TEAM_LABEL[o.team] : '')), [orders]);
  const sorted = useMemo(() => [...orders].sort((a, b) => b.value - a.value), [orders]);

  useEffect(() => { setPage(1); }, [orders, view]);

  const count = view === 'firms' ? firms.length : view === 'people' ? people.length : sorted.length;
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const slice = <T,>(list: T[]) => list.slice(start, start + PAGE_SIZE);

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <Segmented options={BREAKDOWN_LABELS} value={view} onChange={setView} />
        <span className="text-[11px] text-gray-400 tabular-nums">
          {count ? `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, count)} of ${count}` : 'Nothing matches these filters'}
        </span>
      </div>
      {!!count && (
        <div className="rounded-lg border border-gray-200 overflow-x-auto">
          {view === 'firms' && <RollupTable rows={slice(firms)} head="Firm" onOpen={(key) => setDrill({ title: key, rows: rollupOrders(orders, firmOf, key) })} />}
          {view === 'people' && <RollupTable rows={slice(people)} head="Credited to" onOpen={(key) => setDrill({ title: key, rows: rollupOrders(orders, personOf, key) })} />}
          {view === 'orders' && <OrdersTable rows={slice(sorted)} onOpen={(o) => setDrill({ title: o.firm || 'Unnamed', rows: [o] })} />}
        </div>
      )}
      {drill && <OrderDrawer title={drill.title} orders={drill.rows} onClose={() => setDrill(null)} />}
      {pages > 1 && (
        <div className="flex justify-end gap-2 mt-2">
          <button onClick={() => setPage(page - 1)} disabled={page <= 1} className="px-2.5 py-1 text-[11px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 cursor-pointer disabled:opacity-40 disabled:cursor-default">Prev</button>
          <button onClick={() => setPage(page + 1)} disabled={page >= pages} className="px-2.5 py-1 text-[11px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 cursor-pointer disabled:opacity-40 disabled:cursor-default">Next</button>
        </div>
      )}
    </div>
  );
}
