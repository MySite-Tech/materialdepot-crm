'use client';

import { Chip, MapLink, TypeTag } from './ui';
import { STATUS, addDays, assigneeProgress, assigneeStatus, dstr, fmtDate, slotLabel, sjsForDay, subjobDisplayStatus, today } from './shared';
import type { InstallOrder, Installer, SlotDef } from './types';

const th = 'px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap';
const td = 'px-3 py-2.5 text-[13px] border-t border-gray-100 align-top';

/* The sub-job's own status as the SM should read it, with the order-level
   `partial` shading the two Install views already applied. */
const sjSt = (o: InstallOrder, sj: any) =>
  (o.status === 'partial' && subjobDisplayStatus(sj) !== 'completed' ? 'partial' : subjobDisplayStatus(sj));

/* ── Today's installs — live table of every sub-job assignment landing on
   today's date, with installer live status ──────────────────────────────── */
export function ScheduleView({ orders, installers, onOpenOrder, slotsWp }: { orders: InstallOrder[]; installers: Installer[]; onOpenOrder: (pi: string) => void; slotsWp: SlotDef[] }) {
  const todayStr = dstr(today);
  const items: Array<{ o: InstallOrder; sj: any; a: any }> = [];
  orders.forEach((o) => (o.subjobs || []).forEach((sj) => {
    const asgns = sj.assignments && sj.assignments.length
      ? sj.assignments
      : sj.installer
        ? [{ installer_id: sj.installer, installer_name: (installers.find((i) => i.id === sj.installer) || { name: '?' }).name, date: sj.date, dates: [], mode: 'standard', slots: sj.slot ? [sj.slot] : [] }]
        : [];
    asgns.forEach((a: any) => {
      const dates = a.mode === 'custom' ? a.dates || [] : a.date ? [a.date] : [];
      if (dates.includes(todayStr)) items.push({ o, sj, a });
    });
  }));

  return (
    <>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Today — {fmtDate(todayStr)}</h1>
        <p className="text-[13px] text-gray-500 mt-0.5">Live view of today&apos;s install sub-jobs and installer progress.</p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full">
          <thead><tr><th className={th}>Slot</th><th className={th}>Type</th><th className={th}>PI</th><th className={th}>Customer</th><th className={th}>Address</th><th className={th}>Installer</th><th className={th}>Live status</th></tr></thead>
          <tbody>
            {items.length ? items.map(({ o, sj, a }, i) => (
              <tr key={i} className="hover:bg-gray-50 cursor-pointer" onClick={() => onOpenOrder(o.pi)}>
                <td className={td}><b>{sj.type === 'wallpaper' ? ((a.slots || []).map((sid: string) => (slotsWp.find((s) => s.id === sid) || { label: sid }).label).join(', ') || '—') : 'Full day'}</b></td>
                <td className={td}><TypeTag type={sj.type} /></td>
                <td className={td}><span className="font-mono font-extrabold text-[#1F3A5F]">{o.pi}</span></td>
                <td className={td}><b>{o.name}</b><div className="text-gray-500">{o.phone}</div></td>
                <td className={td + ' max-w-[160px]'}><span onClick={(e) => e.stopPropagation()}><MapLink addr={o.addr} /></span></td>
                <td className={td}>{a.installer_name || <span className="text-red-600 font-bold">Unassigned</span>}</td>
                {/* One row per assignee, so "Live status" is THIS installer's own
                    status — reading `sj.status` here showed the primary's progress
                    against everyone's name, which is how an installer who had
                    already finished still appeared to be at site. The sub-job's own
                    state is added underneath only when the two differ. */}
                <td className={td}>
                  <Chip st={assigneeStatus(sj, a)} />
                  {assigneeStatus(sj, a) !== sjSt(o, sj) ? (
                    <div className="mt-1 text-[11px] text-gray-500">Sub-job: {(STATUS[sjSt(o, sj)] || { l: sjSt(o, sj) }).l}</div>
                  ) : null}
                </td>
              </tr>
            )) : <tr><td colSpan={7} className="text-center text-gray-400 py-8 border-t border-gray-100">No installs scheduled today.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ── Calendar — T-3..T+6 day strip + detail panel for the selected day ────
   Laid out exactly like the audit Schedule tab (audit-ops/Views.tsx CalendarView):
   the day strip runs the full width and the selected day's bookings sit in one
   full-width panel underneath. The previous two-column `[1fr_360px]` split gave
   the strip about half the room, which clipped every status pill to
   "Site Installation Comple…" and squeezed the detail list into a 360px gutter —
   the same information, unreadable. Install-specific bits are kept: the track
   tag, the whole crew rather than one name, and the per-installer progress that
   the order badge alone can't show. */
export function CalendarView({
  orders, installers, slotsFl, slotsWp, calSelDay, setCalSelDay, onOpenOrder,
}: {
  orders: InstallOrder[]; installers: Installer[]; slotsFl: SlotDef[]; slotsWp: SlotDef[];
  calSelDay: string; setCalSelDay: (d: string) => void; onOpenOrder: (pi: string) => void;
}) {
  const todayStr = dstr(today);
  const days = Array.from({ length: 10 }, (_, i) => addDays(i - 3));
  const crewOf = (sj: any) => {
    if (sj.assignments && sj.assignments.length) return sj.assignments;
    return sj.installer
      ? [{ installer_name: (installers.find((i) => i.id === sj.installer) || { name: '?' }).name, primary: true, slots: sj.slot ? [sj.slot] : [] }]
      : [];
  };
  const primaryName = (sj: any) => {
    const crew = crewOf(sj);
    const p = crew.find((a: any) => a.primary) || crew[0];
    return (p && p.installer_name) || '?';
  };
  const selItems = sjsForDay(orders, installers, calSelDay);
  const selDate = new Date(calSelDay + 'T00:00');

  return (
    <>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Schedule</h1>
        <p className="mt-0.5 text-[13px] text-gray-500">T−3 to T+6 — click any day column to see all bookings in detail.</p>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {days.map((d) => {
          const ds = dstr(d);
          const list = sjsForDay(orders, installers, ds);
          const isSel = ds === calSelDay;
          return (
            /* A <button> for the day, <span onClick> for the bookings inside it —
               a nested button would be invalid markup. Same shape as the audit tab. */
            <button
              key={ds}
              onClick={() => setCalSelDay(ds)}
              className={`w-[158px] shrink-0 rounded-xl border bg-white text-left ${isSel ? 'border-[#1F3A5F] ring-1 ring-[#1F3A5F]' : 'border-gray-200'} ${d < today ? 'opacity-70' : ''}`}
            >
              <div className="border-b border-gray-100 px-2.5 py-2">
                <div className="text-[11px] font-bold text-gray-500">{ds === todayStr ? 'Today' : d.toLocaleDateString('en-IN', { weekday: 'short' })}</div>
                <div className="text-[13px] font-extrabold text-gray-900">{d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
                <div className={`text-[10.5px] font-semibold ${list.length ? 'text-[#1F3A5F]' : 'text-gray-300'}`}>{list.length ? list.length + (list.length === 1 ? ' install' : ' installs') : 'No installs'}</div>
              </div>
              <div className="px-2 py-2">
                {list.slice(0, 3).map(({ o, sj }, mi) => (
                  <span key={mi} onClick={(e) => { e.stopPropagation(); onOpenOrder(o.pi); }} className="mb-1 block rounded-md bg-gray-50 px-1.5 py-1">
                    <span className="block truncate text-[11.5px] font-bold text-gray-900">{o.name}</span>
                    <span className="flex items-center gap-1 text-[10px] text-gray-500"><TypeTag type={sj.type} /> <span className="truncate">{primaryName(sj).split(' ')[0]}</span></span>
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
          <div className="text-[12px] text-gray-400">{selItems.length ? selItems.length + (selItems.length === 1 ? ' installation' : ' installations') + ' scheduled' : 'No installations scheduled'}</div>
        </div>
        <div className="p-3">
          {selItems.length ? selItems.map(({ o, sj }, i) => {
            const crew = crewOf(sj);
            const primary: any = crew.find((a: any) => a.primary) || crew[0] || {};
            const slotStr = (primary.slots || []).map((sl: string) => slotLabel(sl, slotsFl, slotsWp)).join(' + ') || slotLabel(sj.slot, slotsFl, slotsWp) || '—';
            const st = sjSt(o, sj);
            /* Anyone whose own row is ahead of the sub-job — the additional
               installer who has finished while the primary is still on site. */
            const ahead = assigneeProgress(sj).filter((c) => c.ahead);
            return (
              <div
                key={i}
                onClick={(e) => { if ((e.target as HTMLElement).closest('.maplink-stop')) return; onOpenOrder(o.pi); }}
                className="mb-2 flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 hover:border-gray-300"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[13.5px] font-bold text-gray-900">{o.name} <TypeTag type={sj.type} /></div>
                  <div className="text-[12px] text-gray-500">{o.pi} · BM {o.bm} · <a className="maplink-stop text-blue-600" href={'tel:' + o.phone.replace(/\s/g, '')} onClick={(e) => e.stopPropagation()}>{o.phone}</a></div>
                  <div className="text-[12px] text-gray-400">{o.addr}</div>
                  {ahead.length ? (
                    <div className="mt-1 text-[11.5px] font-semibold text-teal-700">
                      {ahead.map((c) => c.name + ' · ' + (STATUS[c.status] || { l: c.status }).l).join(' · ')}
                    </div>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[12.5px] font-bold text-[#1F3A5F]">{slotStr}</div>
                  <div className="text-[11.5px] text-gray-500">{crew.map((a: any) => a.installer_name || '?').join(', ') || 'Unassigned'}</div>
                  <Chip st={st} />
                </div>
              </div>
            );
          }) : <div className="py-8 text-center text-[13px] text-gray-400">No installations scheduled for this day.</div>}
        </div>
      </div>
    </>
  );
}
