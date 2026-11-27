'use client';

import { Chip } from '../../order-drawer/ui/fields';
import { today } from '../../constants';
import { AuditOrder, Auditor, SlotDef } from '../../types';
import { addDays, dailyTotalCap, dstr, slotLabel } from '../../utils';
import { Cats, Head } from '../cells';

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
