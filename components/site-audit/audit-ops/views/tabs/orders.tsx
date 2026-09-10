'use client';

import { useEffect, useState } from 'react';

import { Chip } from '../../order-drawer/ui/fields';
import { STATUS, today } from '../../constants';
import { AuditOrder, Auditor } from '../../types';
import { auditorNameOf, dstr, fmtDate, hasOpenFollowUp } from '../../utils';
import { Addr, Cats, Customer, Empty, Head } from '../cells';
import { TD, TH } from '../../constants';

const ORDERS_PAGE_SIZE = 25;

export function OrdersView({
  orders, auditors, filterStatus, setFilterStatus, filterDate, setFilterDate, searchQ, setSearchQ,
  onOpenOrder, onAddOrder, onOpenKylas,
}: {
  orders: AuditOrder[]; auditors: Auditor[];
  filterStatus: string; setFilterStatus: (v: string) => void;
  filterDate: string; setFilterDate: (v: string) => void;
  searchQ: string; setSearchQ: (v: string) => void;
  onOpenOrder: (pi: string) => void; onAddOrder: () => void; onOpenKylas: () => void;
}) {
  const todayStr = dstr(today);
  const c: Record<string, number> = {};
  Object.keys(STATUS).forEach((k) => { c[k] = 0; });
  orders.forEach((o) => { c[o.status] = (c[o.status] || 0) + 1; });
  const live = c.scheduled + c.assigned + c.onway + c.atsite;
  const mainCount = orders.filter((o) => !['slot_reserved', 'slot_converted'].includes(o.status)).length;
  const missingBm = orders.filter((o) => !o.bmEmail).length;

  const isUnassignedScheduled = (o: AuditOrder) => !o.auditor && !!o.date && !['slot_reserved', 'slot_converted', 'completed'].includes(o.status);
  const unassignedScheduled = orders.filter(isUnassignedScheduled).length;

  const tiles: Array<[number, string, string, string]> = [
    [mainCount, 'Live audit orders', 'text-[#1F3A5F]', 'all'],
    ...(c.slot_reserved ? [[c.slot_reserved, 'Store pre-bookings', 'text-sky-800', 'slot_reserved'] as [number, string, string, string]] : []),
    [c.pending + c.created + c.call_na, 'Need action', 'text-red-700', 'action'],
    ...(unassignedScheduled ? [[unassignedScheduled, 'Unassigned auditor', 'text-red-700', 'unassigned'] as [number, string, string, string]] : []),
    [live, 'Scheduled / in progress', 'text-blue-700', 'live'],
    [c.reschedule, 'To reschedule', 'text-amber-700', 'reschedule'],
    [c.completed, 'Completed', 'text-green-700', 'completed'],
  ];

  const filters = ['all', ...(c.slot_reserved || c.slot_converted ? ['slot_reserved'] : []), 'followup', ...(unassignedScheduled ? ['unassigned'] : []), 'pending', 'created', 'scheduled', 'assigned', 'reschedule', 'completed', ...(missingBm ? ['missing_bm'] : [])];
  const filterLabel = (f: string) => f === 'all' ? 'All' : f === 'followup' ? 'Follow-up set' : f === 'missing_bm' ? 'Missing BM link' : f === 'unassigned' ? 'Unassigned auditor' : f === 'action' ? 'Need action' : f === 'live' ? 'In progress' : STATUS[f]?.l || f;

  const rows = orders.filter((o) => {
    if (filterStatus === 'all') {
      if (o.status === 'slot_reserved' || o.status === 'slot_converted') return false;
    } else if (filterStatus === 'missing_bm') {
      if (o.bmEmail) return false;
    } else if (filterStatus === 'unassigned') {
      if (!isUnassignedScheduled(o)) return false;
    } else if (filterStatus === 'action') {
      if (!['pending', 'created', 'call_na'].includes(o.status)) return false;
    } else if (filterStatus === 'followup') {
      if (!hasOpenFollowUp(o)) return false;
    } else if (filterStatus === 'live') {
      if (!['scheduled', 'assigned', 'onway', 'atsite'].includes(o.status)) return false;
    } else if (filterStatus === 'slot_reserved') {

      if (o.status !== 'slot_reserved' && o.status !== 'slot_converted') return false;
    } else if (o.status !== filterStatus) return false;
    if (filterDate && o.date !== filterDate) return false;
    if (searchQ) {
      const q = searchQ.toLowerCase();
      return (o.pi + o.name + o.phone + o.bm + o.skus.map((s) => s.c).join()).toLowerCase().includes(q);
    }
    return true;
  }).sort((a, b) => Number(isUnassignedScheduled(b)) - Number(isUnassignedScheduled(a)));

  const todayPre = orders.filter((o) => o.status === 'slot_reserved' && o.date === todayStr);

  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / ORDERS_PAGE_SIZE));
  const curPage = Math.min(page, totalPages);
  const pageRows = rows.slice((curPage - 1) * ORDERS_PAGE_SIZE, curPage * ORDERS_PAGE_SIZE);
  useEffect(() => { setPage(1); }, [filterStatus]);

  return (
    <>
      <Head
        title="Audit orders"
        sub="Every confirmed order containing the Site Audit SKU. Click a row to manage."
        right={<>
          <button onClick={onOpenKylas} className="rounded-md border border-gray-200 bg-white px-3 py-2 text-[13px] font-semibold text-gray-700">📋 Pending POs</button>
          <button onClick={onAddOrder} className="rounded-md bg-[#1F3A5F] px-3.5 py-2 text-[13px] font-semibold text-white">+ Add New Order</button>
        </>}
      />

      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map(([n, label, color, key]) => (
          <button key={key + label} onClick={() => setFilterStatus(key)} className={`rounded-lg border bg-white px-4 py-3 text-left ${filterStatus === key ? 'border-[#EAB308]' : 'border-gray-200'}`}>
            <p className={`font-mono text-[22px] font-bold ${color}`}>{n}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
          </button>
        ))}
      </div>

      {todayPre.length ? (
        <div className="mb-3 rounded-md border-l-4 border-sky-500 bg-sky-50 px-3 py-2.5 text-[12.5px] text-sky-900">
          📅 <b>{todayPre.length} slot pre-booking{todayPre.length !== 1 ? 's' : ''} for today</b> from store teams — waiting for Kylas enquiry numbers.
          <button onClick={() => setFilterStatus('slot_reserved')} className="ml-1 font-bold underline">View all pre-bookings</button>
        </div>
      ) : null}
      {filterStatus === 'slot_reserved' ? (
        <div className="mb-3 rounded-md border-l-4 border-sky-700 bg-sky-50 px-3 py-2.5 text-[12.5px] text-sky-900">
          📋 Running record of every store pre-booking — <b>{c.slot_reserved} pending</b> (waiting on a service order) and <b>{c.slot_converted} fulfilled</b> (service already created).
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-3">
          <div className="relative min-w-[180px] max-w-[280px] flex-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">🔍</span>
            <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Search PI, customer, phone, SKU…" className="w-full rounded-md border border-gray-200 py-2 pl-8 pr-3 text-[13px] outline-none focus:border-yellow-400" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {filters.map((f) => (
              <button key={f} onClick={() => setFilterStatus(f)} className={filterStatus === f ? 'rounded-full bg-[#1A1A1A] px-3 py-1.5 text-xs font-semibold text-white' : 'rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600'}>
                {filterLabel(f)}
              </button>
            ))}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <input type="date" value={filterDate} title="Filter by audit date" onChange={(e) => setFilterDate(e.target.value)} className={`rounded-md border px-2.5 py-1.5 text-[13px] font-semibold outline-none ${filterDate ? 'border-yellow-400 text-gray-900' : 'border-gray-200 text-gray-400'}`} />
            {filterDate ? <button onClick={() => setFilterDate('')} className="rounded-md bg-red-100 px-2.5 py-1.5 text-xs font-bold text-red-600">✕ Clear date</button> : null}
          </div>
        </div>
        <table className="w-full">
          <thead><tr>{['PI / PO', 'SKUs in cart', 'Categories', 'Customer', 'Address', 'Audit date', 'Auditor allocated', 'Status'].map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead>
          <tbody>
            {pageRows.length ? pageRows.map((o) => {
              const fu = hasOpenFollowUp(o) ? o.service!.follow_up_date : null;
              return (
                <tr key={o.id} onClick={() => onOpenOrder(o.pi)} className="cursor-pointer hover:bg-gray-50">
                  <td className={TD}><b className="font-mono text-xs">{o.pi}</b><div className="text-[11px] text-gray-400">{o.po.join(' · ')}</div></td>
                  <td className={TD}><div className="flex flex-wrap gap-1">{o.skus.map((s, i) => <span key={i} className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${s.audit ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>{s.c}</span>)}</div></td>
                  <td className={TD}><Cats o={o} /></td>
                  <td className={TD}><Customer o={o} /></td>
                  <td className={`${TD} max-w-[180px] text-gray-500`}><Addr o={o} /></td>
                  <td className={TD}>{fmtDate(o.date)}</td>
                  <td className={TD}>{o.auditor ? auditorNameOf(o, auditors) : <span className="font-semibold text-red-600">Unassigned</span>}</td>
                  <td className={TD}>
                    <Chip st={o.status} />
                    {o.service?.rectification_raised ? <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-extrabold text-amber-700">RECT</span> : null}
                    {fu ? <div className="mt-1 text-[10px] font-semibold text-amber-700">📅 {fu === todayStr ? 'Follow-up today' : fu < todayStr ? 'Follow-up overdue' : fmtDate(fu)}</div> : null}
                  </td>
                </tr>
              );
            }) : <Empty cols={8} msg="No orders match." />}
          </tbody>
        </table>
        {rows.length > ORDERS_PAGE_SIZE ? (
          <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 text-[12.5px] text-gray-500">
            <span>Showing {(curPage - 1) * ORDERS_PAGE_SIZE + 1}–{Math.min(curPage * ORDERS_PAGE_SIZE, rows.length)} of {rows.length}</span>
            <span className="flex gap-2">
              <button disabled={curPage <= 1} onClick={() => setPage(curPage - 1)} className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white cursor-pointer disabled:opacity-40 disabled:cursor-default">← Prev</button>
              <button disabled={curPage >= totalPages} onClick={() => setPage(curPage + 1)} className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white cursor-pointer disabled:opacity-40 disabled:cursor-default">Next →</button>
            </span>
          </div>
        ) : null}
      </div>
    </>
  );
}
