'use client';

import { useRef, useState } from 'react';
import { WDAYS, fmtDate as fmtDateShort, offDayReason, sbPatch, type StaffExit } from '../siteAuditShared';
import { FLOOR_DAY_CAP, WALLPANEL_DAY_CAP, WP_DAY_SLOTS, dstr, flLoad, installerDayCap, saveSlots, today, typeDayCap, wpSlotLoad, wpnlLoad } from './shared';
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
export function InstallersView({
  installers, orders, formerInstallers = [], canRetire = false, onAddStaff, onRemove, onRestore, reload, toast,
}: {
  installers: Installer[]; orders: InstallOrder[];
  /* City-scoped by the caller, same as `installers`. */
  formerInstallers?: Array<Installer & StaffExit>;
  /* False until migration 004 has been run, which hides the whole
     former-staff affordance rather than offering a Remove that can only fail. */
  canRetire?: boolean;
  onAddStaff: () => void;
  onRemove?: (a: Installer) => void;
  onRestore?: (a: Installer & StaffExit) => void;
  reload: () => Promise<void>; toast: (m: string) => void;
}) {
  const todayStr = dstr(today);
  const [showFormer, setShowFormer] = useState(false);
  type Draft = { weeklyOff: number | null; leaveDates: string[]; activeFrom: string | null; dailyCap: number | null; capOverrides: Record<string, number> };
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() + i); return d; });

  const availOf = (a: Installer): Draft => draft[a.id] || {
    weeklyOff: a.weeklyOff ?? null, leaveDates: a.leaveDates || [],
    activeFrom: a.activeFrom ?? null, dailyCap: a.dailyCap ?? null, capOverrides: a.capOverrides || {},
  };
  const setAvail = (a: Installer, next: Draft) => setDraft((d) => ({ ...d, [a.id]: next }));

  /* A per-date cap. Setting it back to this installer's own default clears the
     override instead of storing a redundant one, so `cap_overrides` stays a
     record of real exceptions rather than growing a key per rendered day. */
  const setCap = (a: Installer, ds: string, v: number) => {
    const av = availOf(a);
    const dflt = av.dailyCap ?? typeDayCap(a.type);
    const next = { ...av.capOverrides };
    if (v === dflt) delete next[ds];
    else next[ds] = v;
    setAvail(a, { ...av, capOverrides: next });
  };

  async function saveAvailability() {
    const ids = Object.keys(draft);
    if (!ids.length) { toast('No changes to save'); return; }
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
        if ((d.activeFrom || null) !== (inst.activeFrom || null)) body.active_from = d.activeFrom || null;
        if ((d.dailyCap ?? null) !== (inst.dailyCap ?? null)) body.daily_cap = d.dailyCap;
        if (JSON.stringify(d.capOverrides || {}) !== JSON.stringify(inst.capOverrides || {})) body.cap_overrides = d.capOverrides || {};
        return Object.keys(body).length ? sbPatch('profiles', id, body) : Promise.resolve();
      }));
      setDraft({});
      await reload();
      toast('✓ Installer settings saved');
    } catch (e: any) {
      toast('⚠ Could not save — ' + (e?.message || 'try again'));
    }
    setSaving(false);
  }

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Installers</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">Typed installers. Jobs go only to installers of the matching type (Flooring / Wallpaper / Wall Panels). Set each one&apos;s start date and daily capacity below.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {canRetire ? (
            <button
              onClick={() => setShowFormer((v) => !v)}
              className={showFormer
                ? 'rounded-md bg-gray-800 px-3.5 py-2 text-[13px] font-semibold text-white'
                : 'rounded-md border border-gray-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-gray-700'}
            >
              Former staff ({formerInstallers.length})
            </button>
          ) : null}
          <button className="bg-white border border-gray-200 text-gray-700 px-3.5 py-2 rounded-md text-[13px] font-semibold" onClick={onAddStaff}>+ Add Staff</button>
          <button className="bg-[#1F3A5F] text-white px-3.5 py-2 rounded-md text-[13px] font-semibold disabled:opacity-60" disabled={saving || !Object.keys(draft).length} onClick={saveAvailability}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      <div className="rounded-md border-l-4 border-blue-400 bg-blue-50 px-3 py-2.5 text-[12px] text-[#1F3A5F] mb-4">
        Default capacity — Flooring: <b>{FLOOR_DAY_CAP} job/installer/day</b>. Wallpaper: <b>{WP_DAY_SLOTS} slots/installer/day</b> — 1-3 rolls = 1 slot (3h), 4-6 rolls = 2 slots (6h), 7+ rolls = 3 slots (9h). Wall Panels: <b>{WALLPANEL_DAY_CAP} job/installer/day</b>. Custom multi-day mode bypasses these limits.
        {' '}<b>Daily cap</b> overrides the default for one installer; the day cells override it for one date only — <b>0</b> makes them unavailable that day. <b>Active from</b>, <b>Weekly off</b> and <b>On leave</b> flag the installer in the assignment picker and require an override reason on those days. All of it is shared with every service manager — remember to click Save.
      </div>
      <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full">
          <thead><tr>
            {['Installer', 'Type', 'Daily cap', 'Load', 'Availability'].map((h) => <th key={h} className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">{h}</th>)}
            {days.map((d) => <th key={dstr(d)} className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">{d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' })}</th>)}
          </tr></thead>
          <tbody>
            {installers.map((a, i) => {
              /* Load is shown against the installer's EFFECTIVE cap for today,
                 not the per-type constant — otherwise an SM who caps someone
                 to 0 for a day still sees "0/1 job" and reads it as spare
                 capacity. */
              const todayCap = installerDayCap({ ...a, ...availOf(a) }, todayStr);
              const load = a.type === 'wallpaper'
                ? wpSlotLoad(orders, a.id, todayStr) + '/' + todayCap + ' slots (3h each)'
                : a.type === 'wallpanel'
                  ? wpnlLoad(orders, a.id, todayStr) + '/' + todayCap + ' job'
                  : flLoad(orders, a.id, todayStr) + '/' + todayCap + ' job';
              return (
                <tr key={i} className="border-t border-gray-100">
                  <td className="px-3 py-2.5 text-[13px]">
                    <b>{a.name}</b>
                    <div className="text-gray-500">{a.contact || a.phone}</div>
                    {canRetire && onRemove ? (
                      <button
                        onClick={() => onRemove(a)}
                        title={'Mark ' + a.name + ' as no longer staff'}
                        className="mt-1 rounded-full border border-red-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-red-600"
                      >
                        Remove
                      </button>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-[13px]"><span className={`inline-block px-2 py-0.5 rounded-md text-[10.5px] font-bold ${a.type === 'wallpaper' ? 'bg-orange-100 text-orange-800' : a.type === 'wallpanel' ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-700'}`}>{typeLabel(a.type)}</span></td>
                  <td className="px-3 py-2.5 text-[13px]">
                    <input
                      type="number" min={0}
                      placeholder={String(typeDayCap(a.type))}
                      value={availOf(a).dailyCap == null ? '' : availOf(a).dailyCap!}
                      onChange={(e) => setAvail(a, { ...availOf(a), dailyCap: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0) })}
                      title={`Blank = the ${typeLabel(a.type)} default of ${typeDayCap(a.type)}`}
                      className="w-16 rounded-md border border-gray-200 px-2 py-1 text-[13px]"
                    />
                    <div className="mt-0.5 text-[10.5px] text-gray-400">{a.type === 'wallpaper' ? 'slots/day' : 'jobs/day'}</div>
                  </td>
                  <td className="px-3 py-2.5 text-[13px]">{load} today</td>
                  <td className="px-3 py-2.5 text-[13px] min-w-[230px]">
                    {(() => {
                      const av = availOf(a);
                      return (
                        <>
                          <div className="text-[10.5px] text-gray-400">Active from:</div>
                          <input
                            type="date" value={av.activeFrom || ''}
                            title="Blank = taking jobs now; a future date means they start then"
                            onChange={(e) => setAvail(a, { ...av, activeFrom: e.target.value || null })}
                            className="mb-1 w-full rounded-md border border-gray-200 px-2 py-1 text-[12px]"
                          />
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
                  {days.map((d) => {
                    const ds = dstr(d);
                    const av = availOf(a);
                    const view: Installer = { ...a, weeklyOff: av.weeklyOff, leaveDates: av.leaveDates, activeFrom: av.activeFrom, dailyCap: av.dailyCap, capOverrides: av.capOverrides };
                    const inactive = !!(av.activeFrom && ds < av.activeFrom);
                    const off = !!offDayReason(view, ds);
                    const dim = inactive || off;
                    const hasOverride = av.capOverrides[ds] !== undefined;
                    return (
                      <td key={ds} className="px-3 py-2.5">
                        <input
                          type="number" min={0} disabled={dim}
                          title={off ? offDayReason(view, ds) : inactive ? 'Before start date' : hasOverride ? 'Overrides the daily cap for this date' : ''}
                          value={dim ? 0 : installerDayCap(view, ds)}
                          onChange={(e) => setCap(a, ds, Math.max(0, parseInt(e.target.value, 10) || 0))}
                          className={`w-16 rounded-md border px-2 py-1 text-[13px] ${dim ? 'border-gray-200 bg-gray-100 opacity-40' : hasOverride ? 'border-amber-400 bg-amber-50 font-semibold' : 'border-gray-200'}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canRetire && showFormer ? (
        <div className="mt-4">
          <h2 className="text-[15px] font-bold text-gray-900">Former installers</h2>
          <p className="mb-2 mt-0.5 text-[12.5px] text-gray-500">
            Removed from the roster, kept on record. They take no jobs and count towards nobody&apos;s capacity — this is the attrition history, and where an accidental removal is undone.
          </p>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full">
              <thead><tr>{['Name', 'Type', 'City', 'Left on', 'Reason', 'Removed by', ''].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
              ))}</tr></thead>
              <tbody>
                {formerInstallers.length ? formerInstallers.map((a) => (
                  <tr key={a.id} className="border-t border-gray-100">
                    <td className="px-3 py-2.5 text-[13px]"><b>{a.name}</b><div className="text-[11.5px] text-gray-400">{a.email}</div></td>
                    <td className="px-3 py-2.5 text-[12.5px] text-gray-600">{typeLabel(a.type)}</td>
                    <td className="px-3 py-2.5 text-[12.5px] text-gray-500">{a.city}</td>
                    <td className="px-3 py-2.5 text-[12.5px] text-gray-500">{fmtDateShort(a.deletedAt)}</td>
                    <td className="px-3 py-2.5 text-[12.5px] text-gray-700">{a.exitReason || '—'}</td>
                    <td className="px-3 py-2.5 text-[11.5px] text-gray-400">{a.deletedBy || '—'}</td>
                    <td className="px-3 py-2.5">
                      {onRestore ? (
                        <button onClick={() => onRestore(a)} className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#1f7a3f]">Bring back</button>
                      ) : null}
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={7} className="border-t border-gray-100 py-8 text-center text-[13px] text-gray-400">Nobody has been removed from this city&apos;s roster.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}
