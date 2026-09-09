'use client';

import { Chip } from '../AuditOrderDrawer';
import { AuditOrder, Auditor, SlotDef, auditorNameOf, dstr, fmtDate, hasOpenFollowUp, slotLabel, today } from '../shared';
import { Addr, Cats, Customer, Empty, Head } from './cells';
import { TD, TH } from '../../constants/audit-ops';

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
