'use client';

import { useRef, useState } from 'react';
import { WDAYS, fmtDate as fmtDateShort, sbPatch } from '../siteAuditShared';
import { FLOOR_DAY_CAP, WALLPANEL_DAY_CAP, WP_DAY_SLOTS, dstr, flLoad, saveSlots, today, wpSlotLoad, wpnlLoad } from './shared';
import { typeLabel } from '../auditRegistry';
import type { InstallOrder, Installer, SlotDef } from './types';

/* ── Slots & timings — device-local config, exactly like the source (kept
   as localStorage, per the porting brief: this is genuinely a local-device
   setting in the original too, not data that belongs in Supabase) ───────── */
export function SlotsView({
  slotsFl, slotsWp, setSlotsFl, setSlotsWp, toast,
}: {
  slotsFl: SlotDef[]; slotsWp: SlotDef[]; setSlotsFl: (s: SlotDef[]) => void; setSlotsWp: (s: SlotDef[]) => void; toast: (m: string) => void;
}) {
  const flRefs = useRef<Array<HTMLInputElement | null>>([]);
  const wpRefs = useRef<Array<HTMLInputElement | null>>([]);

  function saveFl() {
    const next = slotsFl.map((s, i) => ({ ...s, label: flRefs.current[i]?.value ?? s.label }));
    setSlotsFl(next);
    saveSlots('fl', next);
    toast('Flooring slots saved');
  }
  function saveWp() {
    const next = slotsWp.map((s, i) => ({ ...s, label: wpRefs.current[i]?.value ?? s.label }));
    setSlotsWp(next);
    saveSlots('wp', next);
    toast('Wallpaper slots saved');
  }
  function addFl() {
    const next = [...slotsFl, { id: 'sf' + Date.now(), label: 'New window' }];
    setSlotsFl(next); saveSlots('fl', next); toast('Flooring window added');
  }
  function addWp() {
    const next = [...slotsWp, { id: 'sw' + Date.now(), label: 'New window' }];
    setSlotsWp(next); saveSlots('wp', next); toast('Wallpaper window added');
  }
  function delFl(i: number) {
    if (slotsFl.length <= 1) { toast('Keep at least one window'); return; }
    const next = slotsFl.filter((_, ii) => ii !== i);
    setSlotsFl(next); saveSlots('fl', next); toast('Flooring window deleted');
  }
  function delWp(i: number) {
    if (slotsWp.length <= 1) { toast('Keep at least one window'); return; }
    const next = slotsWp.filter((_, ii) => ii !== i);
    setSlotsWp(next); saveSlots('wp', next); toast('Wallpaper window deleted');
  }

  return (
    <>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Slots &amp; timings</h1>
        <p className="text-[13px] text-gray-500 mt-0.5">Configure install windows separately for Wooden Flooring and Wallpaper.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-2">
            <h2 className="text-sm font-bold text-yellow-800 m-0">Wooden Flooring</h2>
            <button className="bg-white border border-blue-500 text-blue-600 px-2.5 py-1 rounded-md text-xs font-semibold" onClick={addFl}>+ Add window</button>
            <button className="bg-[#1F3A5F] text-white px-2.5 py-1 rounded-md text-xs font-semibold" onClick={saveFl}>Save</button>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <table className="w-full">
              <thead><tr><th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left">Window</th><th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left">Timing</th><th className="px-3 py-2"></th></tr></thead>
              <tbody>
                {slotsFl.map((s, i) => (
                  <tr key={s.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-[13px] font-bold">Window {i + 1}</td>
                    <td className="px-3 py-2"><input ref={(el) => { flRefs.current[i] = el; }} defaultValue={s.label} className="px-2 py-1.5 border border-gray-200 rounded-md w-full max-w-[220px] text-[13px]" /></td>
                    <td className="px-3 py-2"><button className="bg-white text-red-600 border border-red-200 px-2.5 py-1 rounded-md text-xs font-semibold" onClick={() => delFl(i)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2.5 mb-2">
            <h2 className="text-sm font-bold text-purple-700 m-0">Wallpapers</h2>
            <button className="bg-white border border-blue-500 text-blue-600 px-2.5 py-1 rounded-md text-xs font-semibold" onClick={addWp}>+ Add window</button>
            <button className="bg-[#1F3A5F] text-white px-2.5 py-1 rounded-md text-xs font-semibold" onClick={saveWp}>Save</button>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <table className="w-full">
              <thead><tr><th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left">Window</th><th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left">Timing</th><th className="px-3 py-2"></th></tr></thead>
              <tbody>
                {slotsWp.map((s, i) => (
                  <tr key={s.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-[13px] font-bold">Window {i + 1}</td>
                    <td className="px-3 py-2"><input ref={(el) => { wpRefs.current[i] = el; }} defaultValue={s.label} className="px-2 py-1.5 border border-gray-200 rounded-md w-full max-w-[220px] text-[13px]" /></td>
                    <td className="px-3 py-2"><button className="bg-white text-red-600 border border-red-200 px-2.5 py-1 rounded-md text-xs font-semibold" onClick={() => delWp(i)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Installers roster ──────────────────────────────────────────────────
   Also the availability editor: a weekly off day and explicit leave dates per
   installer (profiles.weekly_off / profiles.leave_dates). Both are advisory —
   they tag the assignment picker and force an override reason there, they
   never hard-block an assignment. Edits are staged locally and written on
   "Save availability", diffed against the loaded roster. */
export function InstallersView({ installers, orders, onAddStaff, reload, toast }: { installers: Installer[]; orders: InstallOrder[]; onAddStaff: () => void; reload: () => Promise<void>; toast: (m: string) => void }) {
  const todayStr = dstr(today);
  const [draft, setDraft] = useState<Record<string, { weeklyOff: number | null; leaveDates: string[] }>>({});
  const [saving, setSaving] = useState(false);

  const availOf = (a: Installer) => draft[a.id] || { weeklyOff: a.weeklyOff ?? null, leaveDates: a.leaveDates || [] };
  const setAvail = (a: Installer, next: { weeklyOff: number | null; leaveDates: string[] }) => setDraft((d) => ({ ...d, [a.id]: next }));

  async function saveAvailability() {
    const ids = Object.keys(draft);
    if (!ids.length) { toast('No availability changes to save'); return; }
    setSaving(true);
    try {
      await Promise.all(ids.map((id) => {
        const inst = installers.find((i) => i.id === id);
        const d = draft[id];
        if (!inst) return Promise.resolve();
        const body: Record<string, any> = {};
        if ((d.weeklyOff ?? null) !== (inst.weeklyOff ?? null)) body.weekly_off = d.weeklyOff;
        const a = d.leaveDates.slice().sort(), b = (inst.leaveDates || []).slice().sort();
        if (JSON.stringify(a) !== JSON.stringify(b)) body.leave_dates = a;
        return Object.keys(body).length ? sbPatch('profiles', id, body) : Promise.resolve();
      }));
      setDraft({});
      await reload();
      toast('✓ Availability saved');
    } catch (e: any) {
      toast('⚠ Could not save availability — ' + (e?.message || 'try again'));
    }
    setSaving(false);
  }

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Installers</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">Typed installers. Jobs go only to installers of the matching type (Flooring / Wallpaper / Wall Panels).</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button className="bg-white border border-gray-200 text-gray-700 px-3.5 py-2 rounded-md text-[13px] font-semibold" onClick={onAddStaff}>+ Add Staff</button>
          <button className="bg-[#1F3A5F] text-white px-3.5 py-2 rounded-md text-[13px] font-semibold disabled:opacity-60" disabled={saving || !Object.keys(draft).length} onClick={saveAvailability}>
            {saving ? 'Saving…' : 'Save availability'}
          </button>
        </div>
      </div>
      <div className="rounded-md border-l-4 border-blue-400 bg-blue-50 px-3 py-2.5 text-[12px] text-[#1F3A5F] mb-4">
        Capacity rule — Flooring: <b>1 job per installer per day</b>. Wallpaper: <b>3 slots per installer per day</b> — 1-3 rolls = 1 slot (3h), 4-6 rolls = 2 slots (6h), 7+ rolls = 3 slots (9h). Wall Panels: <b>1 job per installer per day</b>. Custom multi-day mode bypasses these limits.
        {' '}<b>Weekly off</b> / <b>On leave</b> dates flag the installer in the assignment picker and require an override reason on those days — remember to click Save availability.
      </div>
      <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full">
          <thead><tr>{['Installer', 'Type', 'Zone', 'Capacity', 'Load', 'Availability'].map((h) => <th key={h} className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>
            {installers.map((a, i) => {
              const load = a.type === 'wallpaper'
                ? wpSlotLoad(orders, a.id, todayStr) + '/' + WP_DAY_SLOTS + ' slots (3h each)'
                : a.type === 'wallpanel'
                  ? wpnlLoad(orders, a.id, todayStr) + '/' + WALLPANEL_DAY_CAP + ' job'
                  : flLoad(orders, a.id, todayStr) + '/' + FLOOR_DAY_CAP + ' job';
              return (
                <tr key={i} className="border-t border-gray-100">
                  <td className="px-3 py-2.5 text-[13px]"><b>{a.name}</b><div className="text-gray-500">{a.phone}</div></td>
                  <td className="px-3 py-2.5 text-[13px]"><span className={`inline-block px-2 py-0.5 rounded-md text-[10.5px] font-bold ${a.type === 'wallpaper' ? 'bg-orange-100 text-orange-800' : a.type === 'wallpanel' ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-700'}`}>{typeLabel(a.type)}</span></td>
                  <td className="px-3 py-2.5 text-[13px]">{a.zone}</td>
                  <td className="px-3 py-2.5 text-[13px]">{a.type === 'wallpaper' ? '3 slots/day (3h each)' : '1 job/day'}</td>
                  <td className="px-3 py-2.5 text-[13px]">{load} today</td>
                  <td className="px-3 py-2.5 text-[13px] min-w-[230px]">
                    {(() => {
                      const av = availOf(a);
                      return (
                        <>
                          <select
                            value={av.weeklyOff == null ? '' : String(av.weeklyOff)}
                            onChange={(e) => setAvail(a, { ...av, weeklyOff: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
                            className="w-full px-2 py-1 border border-gray-200 rounded-md text-[12px] bg-white"
                          >
                            <option value="">No weekly off</option>
                            {WDAYS.map((w, wi) => <option key={w} value={wi}>Off every {w}</option>)}
                          </select>
                          <input
                            type="date" value="" title="Add a leave date"
                            onChange={(e) => { const v = e.target.value; if (v && !av.leaveDates.includes(v)) setAvail(a, { ...av, leaveDates: [...av.leaveDates, v] }); }}
                            className="mt-1 w-full px-2 py-1 border border-gray-200 rounded-md text-[12px]"
                          />
                          <div className="mt-1 flex flex-wrap gap-1">
                            {av.leaveDates.length ? av.leaveDates.slice().sort().map((ld) => (
                              <span key={ld} className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] text-red-700">
                                {fmtDateShort(ld)}
                                <b className="cursor-pointer text-[13px] leading-none" onClick={() => setAvail(a, { ...av, leaveDates: av.leaveDates.filter((x) => x !== ld) })}>×</b>
                              </span>
                            )) : <span className="text-[11px] text-gray-400">no leave dates</span>}
                          </div>
                        </>
                      );
                    })()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
