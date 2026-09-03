'use client';

/* The nine Audit Ops screens — ports of ordersView / scheduleView /
   followupsAuditView / reschedView / calendarView / slotsView / auditorsView /
   deletedView / rectificationsView from SM_Audit_Dashboard.html. All read-only
   rendering except Auditors & caps (which saves caps + availability) and Slots
   & timings (device-local, exactly as in the source). */

import { useState } from 'react';
import { WDAYS, sbPatch } from '../siteAuditShared';
import { Chip } from './AuditOrderDrawer';
import {
  DEFAULT_CAP, STATUS, addDays, auditorNameOf, capFor, dailyTotalCap, dstr, fmtDate, hasOpenFollowUp, mapUrl,
  categoriesAreFromStore, offReason, orderCategories, saveAuditSlots, slotLabel, today,
  type AuditOrder, type Auditor, type SlotDef,
} from './shared';

const TH = 'px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap';
const TD = 'px-3 py-2.5 text-[13px] align-top border-t border-gray-100';

function Empty({ cols, msg }: { cols: number; msg: string }) {
  return <tr><td colSpan={cols} className="border-t border-gray-100 py-8 text-center text-[13px] text-gray-400">{msg}</td></tr>;
}
function Head({ title, sub, right }: { title: string; sub: string; right?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        <p className="mt-0.5 text-[13px] text-gray-500">{sub}</p>
      </div>
      {right ? <div className="ml-auto flex gap-2">{right}</div> : null}
    </div>
  );
}
function Customer({ o }: { o: AuditOrder }) {
  return <div><b>{o.name || '—'}</b><div className="text-gray-500">{o.phone}</div></div>;
}
/* What material the visit is for. Worth a column of its own on every list the SM
   plans from: on an OMS-raised audit the only record of it is the store's own
   pre-booking, so this is often the one place it appears. */
function Cats({ o }: { o: AuditOrder }) {
  const cats = orderCategories(o);
  if (!cats.length) return <span className="text-gray-400">—</span>;
  return (
    <span className="flex flex-wrap gap-1" title={categoriesAreFromStore(o) ? 'From the store pre-booking' : undefined}>
      {cats.map((c) => <span key={c} className="rounded bg-yellow-50 px-1.5 py-0.5 text-[10px] font-bold text-yellow-800">{c}</span>)}
    </span>
  );
}

function Addr({ o }: { o: AuditOrder }) {
  return o.addr
    ? <a className="text-blue-600" href={mapUrl(o.addr)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{o.addr}</a>
    : <span className="text-gray-400">—</span>;
}

/* ── Orders ───────────────────────────────────────────────────────────── */
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
  /* A date is already confirmed but no auditor is on the job — the SM's top
     priority to call and assign, easy to miss in a plain unsorted list. */
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
      // The Pre-booked tab is a running record: still-open AND already-fulfilled.
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
            {rows.length ? rows.map((o) => {
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
      </div>
    </>
  );
}

/* ── Today's schedule ─────────────────────────────────────────────────── */
export function TodayView({ orders, auditors, slots, onOpenOrder }: { orders: AuditOrder[]; auditors: Auditor[]; slots: SlotDef[]; onOpenOrder: (pi: string) => void }) {
  const todayStr = dstr(today);
  const list = orders.filter((o) => o.date === todayStr && !['slot_reserved', 'slot_converted'].includes(o.status)).sort((a, b) => (a.slot || '').localeCompare(b.slot || ''));
  return (
    <>
      <Head title={'Today — ' + fmtDate(todayStr)} sub="Live view of today's audits and auditor progress." />
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full">
          <thead><tr>{['Slot', 'PI', 'Audit is for', 'Customer', 'Address', 'Auditor', 'Live status'].map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead>
          <tbody>
            {list.length ? list.map((o) => (
              <tr key={o.id} onClick={() => onOpenOrder(o.pi)} className="cursor-pointer hover:bg-gray-50">
                <td className={TD}><b>{slotLabel(o.slot, slots)}</b></td>
                <td className={TD}><b className="font-mono text-xs">{o.pi}</b></td>
                <td className={TD}><Cats o={o} /></td>
                <td className={TD}><Customer o={o} /></td>
                <td className={`${TD} max-w-[170px] text-gray-500`}><Addr o={o} /></td>
                <td className={TD}>{o.auditor ? auditorNameOf(o, auditors) : <span className="font-bold text-red-600">Unassigned</span>}</td>
                <td className={TD}><Chip st={o.status} /></td>
              </tr>
            )) : <Empty cols={7} msg="No audits scheduled today." />}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ── Follow-ups ───────────────────────────────────────────────────────── */
export function FollowupsView({ orders, onOpenOrder }: { orders: AuditOrder[]; onOpenOrder: (pi: string) => void }) {
  const todayStr = dstr(today);
  const list = orders.filter(hasOpenFollowUp).sort((a, b) => (a.service!.follow_up_date || '').localeCompare(b.service!.follow_up_date || ''));
  return (
    <>
      <Head title="Follow-ups" sub="Audit orders with a follow-up reminder set. Open each one to book a slot when the client confirms." />
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full">
          <thead><tr>{['PI', 'Customer', 'Follow-up date', 'Status', ''].map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead>
          <tbody>
            {list.length ? list.map((o) => {
              const fu = o.service!.follow_up_date!;
              const isToday = fu === todayStr, over = fu < todayStr;
              return (
                <tr key={o.id} onClick={() => onOpenOrder(o.pi)} className="cursor-pointer hover:bg-gray-50">
                  <td className={TD}><b className="font-mono text-xs">{o.pi}</b></td>
                  <td className={TD}><Customer o={o} /></td>
                  <td className={TD}><span className={`font-bold ${isToday ? 'text-amber-700' : over ? 'text-red-600' : 'text-gray-900'}`}>{fmtDate(fu)}{isToday ? ' ⏰' : over ? ' (overdue)' : ''}</span></td>
                  <td className={TD}><Chip st={o.status} /></td>
                  <td className={TD}><button className="rounded-md bg-[#1F3A5F] px-2.5 py-1.5 text-[12px] font-semibold text-white">Open &amp; book slot</button></td>
                </tr>
              );
            }) : <Empty cols={5} msg="No follow-ups set." />}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ── To reschedule ────────────────────────────────────────────────────── */
export function RescheduleView({ orders, auditors, slots, onOpenOrder }: { orders: AuditOrder[]; auditors: Auditor[]; slots: SlotDef[]; onOpenOrder: (pi: string) => void }) {
  const list = orders.filter((o) => o.status === 'reschedule');
  return (
    <>
      <Head title="To reschedule" sub="Auto-flagged when an auditor marks an order To Reschedule. Call the customer and rebook." />
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full">
          <thead><tr>{['PI', 'Customer', 'Address', 'Was booked', 'Auditor', ''].map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead>
          <tbody>
            {list.length ? list.map((o) => (
              <tr key={o.id} onClick={() => onOpenOrder(o.pi)} className="cursor-pointer hover:bg-gray-50">
                <td className={TD}><b className="font-mono text-xs">{o.pi}</b></td>
                <td className={TD}><Customer o={o} /></td>
                <td className={`${TD} max-w-[170px] text-gray-500`}><Addr o={o} /></td>
                <td className={TD}>{fmtDate(o.date)} · {slotLabel(o.slot, slots)}</td>
                <td className={TD}>{o.auditor ? auditorNameOf(o, auditors) : '—'}</td>
                <td className={TD}><button className="rounded-md bg-[#EAB308] px-2.5 py-1.5 text-[12px] font-semibold text-white">Call &amp; rebook</button></td>
              </tr>
            )) : <Empty cols={6} msg="Nothing to reschedule." />}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ── Calendar (T−3 … T+6) ─────────────────────────────────────────────── */
export function CalendarView({
  orders, auditors, slots, calSelDay, setCalSelDay, onOpenOrder,
}: {
  orders: AuditOrder[]; auditors: Auditor[]; slots: SlotDef[];
  calSelDay: string; setCalSelDay: (d: string) => void; onOpenOrder: (pi: string) => void;
}) {
  const todayStr = dstr(today);
  const days = Array.from({ length: 10 }, (_, i) => addDays(i - 3));
  const forDay = (ds: string) => orders.filter((o) => o.date === ds && !['slot_reserved', 'slot_converted'].includes(o.status)).sort((a, b) => (a.slot || '').localeCompare(b.slot || ''));
  const sel = forDay(calSelDay);
  const selDate = new Date(calSelDay + 'T00:00');

  return (
    <>
      <Head title="Schedule" sub="T−3 to T+6 — click any day column to see all bookings in detail." />
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {days.map((d) => {
          const ds = dstr(d);
          const list = forDay(ds);
          const isSel = ds === calSelDay;
          const cap = dailyTotalCap(auditors, ds);
          return (
            <button key={ds} onClick={() => setCalSelDay(ds)} className={`w-[158px] shrink-0 rounded-xl border bg-white text-left ${isSel ? 'border-[#1F3A5F] ring-1 ring-[#1F3A5F]' : 'border-gray-200'} ${d < today ? 'opacity-70' : ''}`}>
              <div className="border-b border-gray-100 px-2.5 py-2">
                <div className="text-[11px] font-bold text-gray-500">{ds === todayStr ? 'Today' : d.toLocaleDateString('en-IN', { weekday: 'short' })}</div>
                <div className="text-[13px] font-extrabold text-gray-900">{d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
                <div className={`text-[10.5px] font-semibold ${list.length ? 'text-[#1F3A5F]' : 'text-gray-300'}`}>{list.length ? list.length + (list.length === 1 ? ' audit' : ' audits') : 'No audits'} <span className="text-gray-400">/ {cap} cap</span></div>
              </div>
              <div className="px-2 py-2">
                {list.slice(0, 3).map((o) => (
                  <span key={o.id} onClick={(e) => { e.stopPropagation(); onOpenOrder(o.pi); }} className="mb-1 block rounded-md bg-gray-50 px-1.5 py-1">
                    <span className="block truncate text-[11.5px] font-bold text-gray-900">{o.name}</span>
                    <span className="block text-[10px] text-gray-500">{slotLabel(o.slot, slots)}{o.auditorName ? ' · ' + o.auditorName.split(' ')[0] : ''}</span>
                  </span>
                ))}
                {list.length > 3 ? <span className="block text-[10.5px] font-semibold text-gray-400">+{list.length - 3} more</span> : null}
                {!list.length ? <span className="block text-center text-[11px] text-gray-300">—</span> : null}
              </div>
            </button>
          );
        })}
      </div>
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-3">
          <div className="text-[14px] font-bold text-gray-900">
            {calSelDay === todayStr ? 'Today — ' : ''}{selDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          <div className="text-[12px] text-gray-400">{sel.length ? sel.length + (sel.length === 1 ? ' audit' : ' audits') + ' scheduled' : 'No audits scheduled'}</div>
        </div>
        <div className="p-3">
          {sel.length ? sel.map((o) => (
            <div key={o.id} onClick={() => onOpenOrder(o.pi)} className="mb-2 flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 hover:border-gray-300">
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-bold text-gray-900">{o.name}</div>
                <div className="text-[12px] text-gray-500">{o.pi} · BM {o.bm} · <a className="text-blue-600" href={'tel:' + o.phone.replace(/\s/g, '')} onClick={(e) => e.stopPropagation()}>{o.phone}</a></div>
                <div className="text-[12px] text-gray-400">{o.addr}</div>
                <div className="mt-1"><Cats o={o} /></div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[12.5px] font-bold text-[#1F3A5F]">{slotLabel(o.slot, slots)}</div>
                <div className="text-[11.5px] text-gray-500">{o.auditorName || 'Unassigned'}</div>
                <Chip st={o.status} />
              </div>
            </div>
          )) : <div className="py-8 text-center text-[13px] text-gray-400">No audits scheduled for this day.</div>}
        </div>
      </div>
    </>
  );
}

/* ── Slots & timings (device-local) ───────────────────────────────────── */
export function SlotsView({
  slotsFl, slotsWp, setSlotsFl, setSlotsWp, toast,
}: {
  slotsFl: SlotDef[]; slotsWp: SlotDef[]; setSlotsFl: (s: SlotDef[]) => void; setSlotsWp: (s: SlotDef[]) => void; toast: (m: string) => void;
}) {
  function Group({ kind, label, list, set, color }: { kind: 'fl' | 'wp'; label: string; list: SlotDef[]; set: (s: SlotDef[]) => void; color: string }) {
    const [draft, setDraft] = useState<string[]>(list.map((s) => s.label));
    return (
      <div>
        <div className="mb-2 flex items-center gap-2.5">
          <h2 className={`m-0 text-sm font-bold ${color}`}>{label}</h2>
          <button onClick={() => { const next = [...list, { id: kind + Date.now(), label: 'New window' }]; set(next); saveAuditSlots(kind, next); setDraft(next.map((s) => s.label)); toast(label + ' window added'); }} className="rounded-md border border-blue-500 bg-white px-2.5 py-1 text-xs font-semibold text-blue-600">+ Add window</button>
          <button onClick={() => { const next = list.map((s, i) => ({ ...s, label: draft[i] ?? s.label })); set(next); saveAuditSlots(kind, next); toast(label + ' slots saved'); }} className="rounded-md bg-[#1F3A5F] px-2.5 py-1 text-xs font-semibold text-white">Save</button>
        </div>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full">
            <thead><tr>{['Window', 'Timing', ''].map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {list.map((s, i) => (
                <tr key={s.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-[13px] font-bold">Window {i + 1}</td>
                  <td className="px-3 py-2"><input value={draft[i] ?? s.label} onChange={(e) => setDraft((d) => d.map((x, xi) => (xi === i ? e.target.value : x)))} className="w-full max-w-[220px] rounded-md border border-gray-200 px-2 py-1.5 text-[13px]" /></td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => {
                        if (list.length <= 1) { toast('Keep at least one window'); return; }
                        const next = list.filter((_, ii) => ii !== i);
                        set(next); saveAuditSlots(kind, next); setDraft(next.map((x) => x.label)); toast(label + ' window deleted');
                      }}
                      className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-600"
                    >Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  return (
    <>
      <Head title="Slots & timings" sub="Configure audit windows separately for Wooden Flooring and Wallpaper. Stored on this device." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Group kind="fl" label="Wooden Flooring" list={slotsFl} set={setSlotsFl} color="text-yellow-800" />
        <Group kind="wp" label="Wallpapers" list={slotsWp} set={setSlotsWp} color="text-purple-700" />
      </div>
    </>
  );
}

/* ── Auditors & caps ──────────────────────────────────────────────────── */
export function AuditorsView({
  auditors, onAddStaff, reload, toast,
}: {
  auditors: Auditor[];
  onAddStaff: () => void; reload: () => Promise<void>; toast: (m: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(i));
  const todayStr = dstr(today);
  /* Availability, active_from AND caps are all staged locally and written on
     Save, diffed against the loaded roster. Caps used to bypass this entirely
     and write straight to localStorage, which is why the kiosk and the second
     SM never saw them — they now ride the same `profiles` PATCH as the rest. */
  type Draft = { activeFrom: string | null; weeklyOff: number | null; leaveDates: string[]; dailyCap: number | null; capOverrides: Record<string, number> };
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const stateOf = (a: Auditor): Draft => draft[a.id] || {
    activeFrom: a.activeFrom, weeklyOff: a.weeklyOff ?? null, leaveDates: a.leaveDates || [],
    dailyCap: a.dailyCap ?? null, capOverrides: a.capOverrides || {},
  };
  const setState = (a: Auditor, next: Draft) => setDraft((d) => ({ ...d, [a.id]: next }));

  const dirty = Object.keys(draft).length > 0;

  /* A per-date cap. Setting it back to the person's own default clears the
     override rather than storing a redundant one, so `cap_overrides` stays a
     record of real exceptions instead of growing a key per rendered day. */
  function setCap(a: Auditor, ds: string, v: number) {
    const st = stateOf(a);
    const dflt = st.dailyCap ?? DEFAULT_CAP;
    const next = { ...st.capOverrides };
    if (v === dflt) delete next[ds];
    else next[ds] = v;
    setState(a, { ...st, capOverrides: next });
  }

  async function save() {
    setSaving(true);
    try {
      await Promise.all(Object.keys(draft).map((id) => {
        const a = auditors.find((x) => x.id === id);
        const d = draft[id];
        if (!a) return Promise.resolve();
        const body: Record<string, any> = {};
        if ((d.activeFrom || null) !== (a.activeFrom || null)) body.active_from = d.activeFrom || null;
        if ((d.weeklyOff ?? null) !== (a.weeklyOff ?? null)) body.weekly_off = d.weeklyOff;
        const lc = d.leaveDates.slice().sort(), lo = (a.leaveDates || []).slice().sort();
        if (JSON.stringify(lc) !== JSON.stringify(lo)) body.leave_dates = lc;
        if ((d.dailyCap ?? null) !== (a.dailyCap ?? null)) body.daily_cap = d.dailyCap;
        if (JSON.stringify(d.capOverrides || {}) !== JSON.stringify(a.capOverrides || {})) body.cap_overrides = d.capOverrides || {};
        return Object.keys(body).length ? sbPatch('profiles', id, body) : Promise.resolve();
      }));
      setDraft({});
      await reload();
      toast('✓ Auditor settings saved');
    } catch (e: any) {
      toast('⚠ Could not save — ' + (e?.message || 'try again'));
    }
    setSaving(false);
  }

  return (
    <>
      <Head
        title="Auditors & daily caps"
        sub="Mark each auditor active (with an optional start date) and set their daily order cap."
        right={<>
          <button onClick={onAddStaff} className="rounded-md border border-gray-200 bg-white px-3 py-2 text-[13px] font-semibold text-gray-700">+ Add Staff</button>
          <button disabled={saving || !dirty} onClick={save} className="rounded-md bg-[#1F3A5F] px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-60">{saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}</button>
        </>}
      />
      <div className="mb-4 rounded-md border-l-4 border-blue-400 bg-blue-50 px-3 py-2.5 text-[12px] text-[#1F3A5F]">
        <b>Active from</b>: blank = active now; a future date means the auditor starts accepting orders then. <b>Daily cap</b> is this auditor&apos;s normal number of audits per day (default {DEFAULT_CAP}); the day cells below override it for one date only — <b>0</b> makes them unavailable that day. Greyed cells are before the start date, on a weekly off, or on leave. Caps, <b>Weekly off</b> and <b>On leave</b> are shared with every service manager and with the Store Team&apos;s slots-left count, which counts only auditors in the store&apos;s own city — remember to click Save.
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full">
          <thead>
            <tr>
              <th className={`${TH} min-w-[200px]`}>Auditor</th>
              {days.map((d) => <th key={dstr(d)} className={TH}>{d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' })}</th>)}
            </tr>
          </thead>
          <tbody>
            {auditors.length ? auditors.map((a) => {
              const st = stateOf(a);
              const view: Auditor = { ...a, activeFrom: st.activeFrom, weeklyOff: st.weeklyOff, leaveDates: st.leaveDates, dailyCap: st.dailyCap, capOverrides: st.capOverrides };
              const activeNow = !st.activeFrom || st.activeFrom <= todayStr;
              return (
                <tr key={a.id} className="border-t border-gray-100 align-top">
                  <td className="px-3 py-2.5 text-[13px]">
                    <div className="font-bold">{a.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${activeNow ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{activeNow ? '● Active' : 'From ' + fmtDate(st.activeFrom)}</span>
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-[#1F3A5F]">{a.city}</span>
                    </div>
                    <div className="mt-1.5 text-[11px] text-gray-400">Daily cap (normal day):</div>
                    <input
                      type="number" min={0}
                      placeholder={String(DEFAULT_CAP)}
                      value={st.dailyCap == null ? '' : st.dailyCap}
                      onChange={(e) => setState(a, { ...st, dailyCap: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0) })}
                      className="mt-0.5 w-full rounded-md border border-gray-200 px-2 py-1 text-[12px]"
                    />
                    <div className="mt-1.5 text-[11px] text-gray-400">Active from:</div>
                    <input type="date" value={st.activeFrom || ''} onChange={(e) => setState(a, { ...st, activeFrom: e.target.value || null })} className="mt-0.5 w-full rounded-md border border-gray-200 px-2 py-1 text-[12px]" />
                    <div className="mt-1.5 text-[11px] text-gray-400">Weekly off:</div>
                    <select value={st.weeklyOff == null ? '' : String(st.weeklyOff)} onChange={(e) => setState(a, { ...st, weeklyOff: e.target.value === '' ? null : parseInt(e.target.value, 10) })} className="mt-0.5 w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-[12px]">
                      <option value="">No weekly off</option>
                      {WDAYS.map((w, wi) => <option key={w} value={wi}>Off every {w}</option>)}
                    </select>
                    <div className="mt-1.5 text-[11px] text-gray-400">On leave (dates):</div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {st.leaveDates.length ? st.leaveDates.slice().sort().map((ld) => (
                        <span key={ld} className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] text-red-700">
                          {fmtDate(ld)}
                          <b className="cursor-pointer text-[13px] leading-none" onClick={() => setState(a, { ...st, leaveDates: st.leaveDates.filter((x) => x !== ld) })}>×</b>
                        </span>
                      )) : <span className="text-[11px] text-gray-400">none</span>}
                    </div>
                    <input type="date" value="" title="Pick a date to mark this auditor on leave" onChange={(e) => { const v = e.target.value; if (v && !st.leaveDates.includes(v)) setState(a, { ...st, leaveDates: [...st.leaveDates, v] }); }} className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1 text-[12px]" />
                  </td>
                  {days.map((d) => {
                    const ds = dstr(d);
                    const inactive = !!(st.activeFrom && ds < st.activeFrom);
                    const off = !!offReason(view, ds);
                    const dim = inactive || off;
                    const hasOverride = st.capOverrides[ds] !== undefined;
                    return (
                      <td key={ds} className="px-3 py-2.5">
                        <input
                          type="number" min={0} disabled={dim}
                          title={off ? offReason(view, ds) : inactive ? 'Before start date' : hasOverride ? 'Overrides the daily cap for this date' : ''}
                          value={dim ? 0 : capFor([view], a.id, ds)}
                          onChange={(e) => setCap(a, ds, Math.max(0, parseInt(e.target.value, 10) || 0))}
                          className={`w-16 rounded-md border px-2 py-1 text-[13px] ${dim ? 'border-gray-200 bg-gray-100 opacity-40' : hasOverride ? 'border-amber-400 bg-amber-50 font-semibold' : 'border-gray-200'}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            }) : <Empty cols={8} msg="No auditors in this city." />}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ── Deleted ──────────────────────────────────────────────────────────── */
export function DeletedView({ deleted, auditors, onRestore }: { deleted: AuditOrder[]; auditors: Auditor[]; onRestore: (o: AuditOrder) => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <>
      <Head title="Deleted Orders" sub="Deleted orders are stored here permanently and can be restored to Pending at any time." />
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full">
          <thead><tr>{['PI / PO', 'Customer', 'Address', 'Date', 'Auditor', ''].map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead>
          <tbody>
            {deleted.length ? deleted.map((o) => (
              <tr key={o.id}>
                <td className={TD}><b className="font-mono text-xs">{o.pi}</b><div className="text-[11px] text-gray-400">{o.po.join(' · ')}</div></td>
                <td className={TD}><Customer o={o} /></td>
                <td className={`${TD} max-w-[180px] text-gray-500`}><Addr o={o} /></td>
                <td className={TD}>{fmtDate(o.date)}</td>
                <td className={TD}>{o.auditor ? auditorNameOf(o, auditors) : '—'}</td>
                <td className={TD}>
                  <button disabled={busy === o.id} onClick={async () => { setBusy(o.id); await onRestore(o); setBusy(null); }} className="rounded-md bg-[#EAB308] px-2.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60">
                    {busy === o.id ? 'Restoring…' : 'Restore'}
                  </button>
                </td>
              </tr>
            )) : <Empty cols={6} msg="No deleted orders." />}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ── Rectifications ───────────────────────────────────────────────────── */
export function RectificationsView({ orders, onOpenOrder }: { orders: AuditOrder[]; onOpenOrder: (pi: string) => void }) {
  const list = orders.filter((o) => o.service && o.service.rectification_of);
  return (
    <>
      <Head title="Rectifications" sub="New service orders raised to address post-completion issues. Click a row to manage." />
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full">
          <thead><tr>{['Rectification PI', 'Original PI', 'Customer', 'Issue', 'Status'].map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead>
          <tbody>
            {list.length ? list.map((o) => (
              <tr key={o.id} onClick={() => onOpenOrder(o.pi)} className="cursor-pointer hover:bg-gray-50">
                <td className={TD}><b className="font-mono text-xs">{o.pi}</b></td>
                <td className={TD}><b className="font-mono text-xs">{o.service!.rectification_of}</b></td>
                <td className={TD}><Customer o={o} /></td>
                <td className={`${TD} max-w-[220px] text-[12px] text-gray-500`}>{o.service!.issue || '—'}</td>
                <td className={TD}><Chip st={o.status} /></td>
              </tr>
            )) : <Empty cols={5} msg="No rectifications raised yet." />}
          </tbody>
        </table>
      </div>
    </>
  );
}
