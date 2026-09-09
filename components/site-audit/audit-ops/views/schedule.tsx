'use client';

import { Chip } from '../AuditOrderDrawer';
import { AuditOrder, Auditor, SlotDef, addDays, dailyTotalCap, dstr, saveAuditSlots, slotLabel, today } from '../shared';
import { Cats, Head } from './cells';
import { TH } from '../../constants/audit-ops';
import { useState } from 'react';

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
