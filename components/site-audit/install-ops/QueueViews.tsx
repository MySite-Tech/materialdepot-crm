'use client';

import { Chip, EmptyRow, TypeTag } from './ui';
import { dstr, fmtDate, opsCallDue, slotLabel, today } from './shared';
import type { InstallOrder, SlotDef } from './types';

interface BaseProps {
  orders: InstallOrder[];
  onOpenOrder: (pi: string) => void;
}

const th = 'px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap';
const td = 'px-3 py-2.5 text-[13px] border-t border-gray-100 align-top';

/* ── Need Action today — combines ops-calls-due, follow-ups-overdue and
   to-reschedule into one triage screen ──────────────────────────────────── */
export function NeedActionView({ orders, onOpenOrder }: BaseProps) {
  const todayStr = dstr(today);
  const opsList = orders.filter(opsCallDue);
  const fuList = orders.filter((o) => o.service && o.service.follow_up_date && o.service.follow_up_date <= todayStr).filter((o) => !opsCallDue(o));
  const reschedItems: Array<{ o: InstallOrder; sj: any }> = [];
  orders.forEach((o) => (o.subjobs || []).forEach((sj) => { if (sj.status === 'reschedule') reschedItems.push({ o, sj }); }));

  return (
    <>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Need Action today</h1>
        <p className="text-[13px] text-gray-500 mt-0.5">All orders requiring your attention today — ops calls due, follow-ups overdue, and sub-jobs to reschedule.</p>
      </div>
      {!opsList.length && !fuList.length && !reschedItems.length ? (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-8 text-center text-gray-400 text-[13px]">Nothing needs action today.</div>
      ) : null}

      {opsList.length ? (
        <>
          <div className="text-[11px] font-extrabold tracking-wide uppercase text-amber-700 mb-2">☎ Operations calls due ({opsList.length})</div>
          <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto mb-4">
            <table className="w-full">
              <thead><tr><th className={th}>PI</th><th className={th}>Customer</th><th className={th}>Type</th><th className={th}>Delivery date</th><th className={th}>Status</th><th className={th}></th></tr></thead>
              <tbody>
                {opsList.map((o) => {
                  const dd = new Date(o.deliveryDate + 'T00:00');
                  const dleft = Math.round((dd.getTime() - today.getTime()) / 86400000);
                  return (
                    <tr key={o.pi} className="hover:bg-gray-50 cursor-pointer" onClick={() => onOpenOrder(o.pi)}>
                      <td className={td}><span className="font-mono font-extrabold text-[#1F3A5F]">{o.pi}</span></td>
                      <td className={td}><b>{o.name}</b><div className="text-gray-500">{o.phone}</div></td>
                      <td className={td}>{o.customWp ? <span className="inline-block px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-orange-100 text-orange-800">Custom WP</span> : <span className="inline-block px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-gray-100 text-gray-700">Standard</span>}</td>
                      <td className={td}>{fmtDate(o.deliveryDate)} <span className="text-gray-400">({dleft <= 0 ? 'today/overdue' : 'in ' + dleft + 'd'})</span></td>
                      <td className={td}><Chip st={o.status} /></td>
                      <td className={td}><button className="bg-amber-600 text-white px-3 py-1.5 rounded-md text-xs font-semibold" onClick={(e) => { e.stopPropagation(); onOpenOrder(o.pi); }}>Call ops &amp; confirm</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {fuList.length ? (
        <>
          <div className="text-[11px] font-extrabold tracking-wide uppercase text-[#1F3A5F] mb-2">📅 Follow-ups due ({fuList.length})</div>
          <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto mb-4">
            <table className="w-full">
              <thead><tr><th className={th}>PI</th><th className={th}>Customer</th><th className={th}>Follow-up date</th><th className={th}>Status</th><th className={th}></th></tr></thead>
              <tbody>
                {fuList.map((o) => {
                  const fu = o.service!.follow_up_date!;
                  const over = fu < todayStr, isToday = fu === todayStr;
                  return (
                    <tr key={o.pi} className="hover:bg-gray-50 cursor-pointer" onClick={() => onOpenOrder(o.pi)}>
                      <td className={td}><span className="font-mono font-extrabold text-[#1F3A5F]">{o.pi}</span></td>
                      <td className={td}><b>{o.name}</b><div className="text-gray-500">{o.phone}</div></td>
                      <td className={td}><span className={`font-bold ${isToday ? 'text-amber-700' : over ? 'text-red-600' : 'text-gray-900'}`}>{fmtDate(fu)}{isToday ? ' ⏰' : over ? ' (overdue)' : ''}</span></td>
                      <td className={td}><Chip st={o.status} /></td>
                      <td className={td}><button className="bg-[#1F3A5F] text-white px-3 py-1.5 rounded-md text-xs font-semibold" onClick={(e) => { e.stopPropagation(); onOpenOrder(o.pi); }}>Open &amp; schedule</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {reschedItems.length ? (
        <>
          <div className="text-[11px] font-extrabold tracking-wide uppercase text-red-600 mb-2">↻ To reschedule ({reschedItems.length})</div>
          <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
            <table className="w-full">
              <thead><tr><th className={th}>PI</th><th className={th}>Type</th><th className={th}>Customer</th><th className={th}>Was booked</th><th className={th}></th></tr></thead>
              <tbody>
                {reschedItems.map(({ o, sj }, i) => (
                  <tr key={i} className="hover:bg-gray-50 cursor-pointer" onClick={() => onOpenOrder(o.pi)}>
                    <td className={td}><span className="font-mono font-extrabold text-[#1F3A5F]">{o.pi}</span></td>
                    <td className={td}><TypeTag type={sj.type} /></td>
                    <td className={td}><b>{o.name}</b><div className="text-gray-500">{o.phone}</div></td>
                    <td className={td}>{fmtDate(sj.date)}</td>
                    <td className={td}><button className="bg-blue-600 text-white px-3 py-1.5 rounded-md text-xs font-semibold" onClick={(e) => { e.stopPropagation(); onOpenOrder(o.pi); }}>Call &amp; rebook</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </>
  );
}

/* ── Call Operations today ────────────────────────────────────────────── */
export function CallsView({ orders, onOpenOrder }: BaseProps) {
  const list = orders.filter(opsCallDue);
  return (
    <>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Call Operations today</h1>
        <p className="text-[13px] text-gray-500 mt-0.5">Confirm delivery status with Operations within the call window. Custom wallpaper needs the call 3 days out; everything else 1 day out.</p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full">
          <thead><tr><th className={th}>PI</th><th className={th}>Customer</th><th className={th}>Type</th><th className={th}>Delivery date</th><th className={th}>Call window</th><th className={th}></th></tr></thead>
          <tbody>
            {list.length ? list.map((o) => {
              const dd = new Date(o.deliveryDate + 'T00:00');
              const dleft = Math.round((dd.getTime() - today.getTime()) / 86400000);
              return (
                <tr key={o.pi} className="hover:bg-gray-50 cursor-pointer" onClick={() => onOpenOrder(o.pi)}>
                  <td className={td}><span className="font-mono font-extrabold text-[#1F3A5F]">{o.pi}</span></td>
                  <td className={td}><b>{o.name}</b><div className="text-gray-500">{o.phone}</div></td>
                  <td className={td}>{o.customWp ? <span className="inline-block px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-orange-100 text-orange-800">Custom wallpaper</span> : <span className="inline-block px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-gray-100 text-gray-700">Standard</span>}</td>
                  <td className={td}>{fmtDate(o.deliveryDate)} <span className="text-gray-400">({dleft <= 0 ? 'today/overdue' : 'in ' + dleft + 'd'})</span></td>
                  <td className={td}>{o.customWp ? '3 days prior' : '1 day prior'}</td>
                  <td className={td}><button className="bg-green-600 text-white px-3 py-1.5 rounded-md text-xs font-semibold" onClick={(e) => { e.stopPropagation(); onOpenOrder(o.pi); }}>Open &amp; confirm</button></td>
                </tr>
              );
            }) : <EmptyRow colSpan={6}>No Operations calls due today.</EmptyRow>}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ── To reschedule ─────────────────────────────────────────────────────── */
export function RescheduleView({ orders, onOpenOrder, slotsFl, slotsWp }: BaseProps & { slotsFl: SlotDef[]; slotsWp: SlotDef[] }) {
  const items: Array<{ o: InstallOrder; sj: any }> = [];
  orders.forEach((o) => (o.subjobs || []).forEach((sj) => { if (sj.status === 'reschedule') items.push({ o, sj }); }));
  return (
    <>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">To reschedule</h1>
        <p className="text-[13px] text-gray-500 mt-0.5">Auto-flagged when an installer marks a sub-job To Reschedule. Call the customer and rebook.</p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full">
          <thead><tr><th className={th}>PI</th><th className={th}>Type</th><th className={th}>Customer</th><th className={th}>Was booked</th><th className={th}></th></tr></thead>
          <tbody>
            {items.length ? items.map(({ o, sj }, i) => (
              <tr key={i} className="hover:bg-gray-50 cursor-pointer" onClick={() => onOpenOrder(o.pi)}>
                <td className={td}><span className="font-mono font-extrabold text-[#1F3A5F]">{o.pi}</span></td>
                <td className={td}><TypeTag type={sj.type} /></td>
                <td className={td}><b>{o.name}</b><div className="text-gray-500">{o.phone}</div></td>
                <td className={td}>{fmtDate(sj.date)} · {slotLabel(sj.slot, slotsFl, slotsWp)}</td>
                <td className={td}><button className="bg-blue-600 text-white px-3 py-1.5 rounded-md text-xs font-semibold" onClick={(e) => { e.stopPropagation(); onOpenOrder(o.pi); }}>Call &amp; rebook</button></td>
              </tr>
            )) : <EmptyRow colSpan={5}>Nothing to reschedule.</EmptyRow>}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ── Follow-ups ────────────────────────────────────────────────────────── */
export function FollowupsView({ orders, onOpenOrder }: BaseProps) {
  const todayStr = dstr(today);
  const list = orders.filter((o) => o.service && o.service.follow_up_date).sort((a, b) => a.service!.follow_up_date!.localeCompare(b.service!.follow_up_date!));
  return (
    <>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Follow-ups</h1>
        <p className="text-[13px] text-gray-500 mt-0.5">Orders with a follow-up reminder set — open each order to assign a date, slot and installer when the client is ready.</p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full">
          <thead><tr><th className={th}>PI</th><th className={th}>Customer</th><th className={th}>Follow-up date</th><th className={th}>Status</th><th className={th}></th></tr></thead>
          <tbody>
            {list.length ? list.map((o) => {
              const fu = o.service!.follow_up_date!;
              const over = fu < todayStr, isToday = fu === todayStr;
              return (
                <tr key={o.pi} className="hover:bg-gray-50 cursor-pointer" onClick={() => onOpenOrder(o.pi)}>
                  <td className={td}><span className="font-mono font-extrabold text-[#1F3A5F]">{o.pi}</span></td>
                  <td className={td}><b>{o.name}</b><div className="text-gray-500">{o.phone}</div></td>
                  <td className={td}><span className={`font-bold ${isToday ? 'text-amber-700' : over ? 'text-red-600' : 'text-gray-900'}`}>{fmtDate(fu)}{isToday ? ' ⏰' : over ? ' (overdue)' : ''}</span></td>
                  <td className={td}><Chip st={o.status} /></td>
                  <td className={td}><button className="bg-[#1F3A5F] text-white px-3 py-1.5 rounded-md text-xs font-semibold" onClick={(e) => { e.stopPropagation(); onOpenOrder(o.pi); }}>Open &amp; schedule</button></td>
                </tr>
              );
            }) : <EmptyRow colSpan={5}>No follow-ups set.</EmptyRow>}
          </tbody>
        </table>
      </div>
    </>
  );
}
