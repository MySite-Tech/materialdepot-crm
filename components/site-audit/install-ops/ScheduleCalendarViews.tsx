'use client';

import { Chip, MapLink, TypeTag } from './ui';
import { addDays, dstr, fmtDate, slotLabel, sjsForDay, today } from './shared';
import type { InstallOrder, Installer, SlotDef } from './types';

const th = 'px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap';
const td = 'px-3 py-2.5 text-[13px] border-t border-gray-100 align-top';

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
                <td className={td}><Chip st={o.status === 'partial' && sj.status !== 'completed' ? 'partial' : sj.status} /></td>
              </tr>
            )) : <tr><td colSpan={7} className="text-center text-gray-400 py-8 border-t border-gray-100">No installs scheduled today.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ── Calendar — T-3..T+6 day strip + detail panel for the selected day ──── */
export function CalendarView({
  orders, installers, slotsFl, slotsWp, calSelDay, setCalSelDay, onOpenOrder,
}: {
  orders: InstallOrder[]; installers: Installer[]; slotsFl: SlotDef[]; slotsWp: SlotDef[];
  calSelDay: string; setCalSelDay: (d: string) => void; onOpenOrder: (pi: string) => void;
}) {
  const todayStr = dstr(today);
  const days = Array.from({ length: 10 }, (_, i) => addDays(i - 3));
  const primaryName = (sj: any) => {
    if (sj.assignments && sj.assignments.length) { const p = sj.assignments.find((a: any) => a.primary) || sj.assignments[0]; return p.installer_name || '?'; }
    return (installers.find((i) => i.id === sj.installer) || { name: '?' }).name;
  };
  const selItems = sjsForDay(orders, installers, calSelDay);
  const selDate = new Date(calSelDay + 'T00:00');
  const selLabel = calSelDay === todayStr
    ? 'Today — ' + selDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : selDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Schedule</h1>
        <p className="text-[13px] text-gray-500 mt-0.5">T−3 to T+6 — click any day column to see all bookings in detail.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        <div className="flex gap-2.5 overflow-x-auto pb-1">
          {days.map((d, di) => {
            const ds = dstr(d);
            const isToday = ds === todayStr, isSel = ds === calSelDay, isPast = d < today;
            const dayItems = sjsForDay(orders, installers, ds);
            const cnt = dayItems.length;
            return (
              <div
                key={di}
                className={`w-[170px] shrink-0 rounded-lg border bg-white overflow-hidden cursor-pointer ${isSel ? 'border-[#EAB308] ring-1 ring-[#EAB308]' : 'border-gray-200'} ${isPast ? 'opacity-60' : ''}`}
                onClick={(e) => { if ((e.target as HTMLElement).closest('.calmini')) return; setCalSelDay(ds); }}
              >
                <div className={`px-3 py-2 border-b ${isToday ? 'bg-[#1F3A5F] border-[#1F3A5F]' : 'border-gray-100'}`}>
                  <div className={`text-[10px] font-extrabold uppercase tracking-wide ${isToday ? 'text-white/70' : 'text-gray-400'}`}>{isToday ? 'Today' : d.toLocaleDateString('en-IN', { weekday: 'short' })}</div>
                  <div className={`text-[13px] font-bold ${isToday ? 'text-white' : 'text-gray-900'}`}>{d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
                  <div className={`text-[11px] font-bold mt-0.5 ${cnt === 0 ? 'text-gray-400' : isToday ? 'text-white' : 'text-blue-600'}`}>{cnt > 0 ? cnt + ' ' + (cnt === 1 ? 'install' : 'installs') : 'No installs'}</div>
                </div>
                <div className="p-1.5 flex flex-col gap-1 min-h-[64px]">
                  {dayItems.slice(0, 3).map(({ o, sj }, mi) => (
                    <div key={mi} className="calmini rounded-md bg-gray-50 hover:bg-gray-100 px-2 py-1 cursor-pointer" onClick={(e) => { e.stopPropagation(); onOpenOrder(o.pi); }}>
                      <div className="text-[11.5px] font-bold text-gray-900 truncate">{o.name}</div>
                      <div className="text-[10.5px] text-gray-500 flex items-center gap-1"><TypeTag type={sj.type} /> {primaryName(sj).split(' ')[0]}</div>
                      <div className="mt-0.5"><Chip st={o.status === 'partial' && sj.status !== 'completed' ? 'partial' : sj.status} /></div>
                    </div>
                  ))}
                  {cnt > 3 ? <div className="text-[10.5px] text-gray-400 text-center">+{cnt - 3} more</div> : null}
                  {cnt === 0 ? <div className="text-gray-300 text-center text-xs py-2">—</div> : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm font-bold text-gray-900">{selLabel}</div>
          <div className="text-[12px] text-gray-500 mt-0.5 mb-3">{selItems.length === 0 ? 'No installations scheduled' : `${selItems.length} ${selItems.length === 1 ? 'installation' : 'installations'} scheduled`}</div>
          <div className="flex flex-col gap-2 max-h-[520px] overflow-y-auto">
            {selItems.length > 0 ? selItems.map(({ o, sj }, i) => {
              const asgns = sj.assignments && sj.assignments.length
                ? sj.assignments
                : sj.installer ? [{ installer_name: (installers.find((ii) => ii.id === sj.installer) || { name: '?' }).name, primary: true, slots: sj.slot ? [sj.slot] : [] }] : [];
              const primary: any = asgns.find((a: any) => a.primary) || asgns[0] || {};
              const slotStr = (primary.slots || []).map((s: string) => slotLabel(s, slotsFl, slotsWp)).join(' + ') || slotLabel(sj.slot, slotsFl, slotsWp) || '—';
              const allNames = asgns.map((a: any) => a.installer_name || '?').join(', ');
              return (
                <div key={i} className="rounded-lg border border-gray-200 p-3 cursor-pointer hover:border-gray-300" onClick={(e) => { if ((e.target as HTMLElement).closest('.maplink-stop')) return; onOpenOrder(o.pi); }}>
                  <div className="flex items-center gap-1.5 text-[13px] font-bold text-gray-900">{o.name} <TypeTag type={sj.type} /></div>
                  <div className="text-[12px] text-gray-500 mt-0.5">{o.pi} · BM {o.bm} · <a className="maplink-stop text-blue-600" href={'tel:' + o.phone.replace(/\s/g, '')} onClick={(e) => e.stopPropagation()}>{o.phone}</a></div>
                  <div className="text-[11.5px] text-gray-400 mt-0.5 truncate">{o.addr}</div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                    <div className="text-[12px] font-semibold text-gray-700">{slotStr} · {allNames}</div>
                    <Chip st={o.status === 'partial' && sj.status !== 'completed' ? 'partial' : sj.status} />
                  </div>
                </div>
              );
            }) : <div className="text-center text-gray-400 text-[13px] py-8">No installations scheduled for this day.</div>}
          </div>
        </div>
      </div>
    </>
  );
}
