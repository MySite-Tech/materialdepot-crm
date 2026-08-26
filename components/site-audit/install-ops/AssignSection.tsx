'use client';

/* Installer/slot assignment — the highest-stakes piece of the port. Kept as
   a near-verbatim port of AssignSection in SMInstall.jsx (source lines
   1111-1293), including its ref-based mutable-draft + forced-redraw style
   (assignsRef/customModeRef/editingSlotRef), because the load-balancing
   inputs (flLoad/wpSlotLoad) and the standard-vs-custom/date-range/slot
   logic are exactly the kind of business rule this port must not
   reinterpret. Only the persistence plumbing changes: instead of mutating
   module-level ORDERS and calling the module's own loadOrders()/toast(),
   it calls the `reload`/`toast`/`onOpenOrder` props threaded down from the
   root view. */

import { useMemo, useRef, useState } from 'react';
import { inCity, isOffDay, joinShadowers, offDayReason, parseShadowers, sbPatch, type CityFilter, type Shadower } from '../siteAuditShared';
import { useNoteModal } from '../NoteModal';
import ShadowerSelect, { type ShadowerOption } from './ShadowerSelect';
import {
  STATUS, dateRange, fmtDate, installerById, sjDeliveryDate, slotLabel, slotsForWp, syncParentStatus, totalRolls, dstr, today,
} from './shared';
import type { Assignment, InstallOrder, Installer, SlotDef, Subjob } from './types';

interface Props {
  order: InstallOrder;
  subjob: Subjob;
  installers: Installer[];
  shadowerPool: ShadowerOption[];
  city: CityFilter;
  slotsFl: SlotDef[];
  slotsWp: SlotDef[];
  attribution: string;
  /* True when the roster FAILED to load, as opposed to genuinely having nobody
     of this trade — an empty <select> alone reads as "the team is full". */
  installersErr?: boolean;
  onRetryInstallers?: () => void;
  reload: () => Promise<void>;
  toast: (m: string) => void;
  onOpenOrder: (pi: string) => void;
}

/* An empty pool has three different causes and an empty dropdown states none of
   them, sending the SM chasing a capacity problem that isn't there. */
function EmptyInstallerPool({ err, anyLoaded, type, onRetry }: { err: boolean; anyLoaded: boolean; type: string; onRetry?: () => void }) {
  if (err) {
    return (
      <div className="mb-2.5 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] font-semibold text-red-700">
        ⚠ Couldn&apos;t load the installer list, so there&apos;s nobody to assign — this is a connection problem, not a full team. Retrying automatically.
        {onRetry ? <button onClick={onRetry} className="ml-2 rounded-md border border-red-300 bg-white px-2 py-0.5 text-[11.5px] font-semibold text-red-700">Retry now</button> : null}
      </div>
    );
  }
  return (
    <div className="mb-2.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] font-semibold text-amber-800">
      {anyLoaded
        ? `⚠ No ${type} installers are registered in this city. Switch the city filter, or add them under Installers.`
        : '⚠ No installers are registered yet — add them under Installers before assigning.'}
    </div>
  );
}

export default function AssignSection({ order: o, subjob: sj, installers, shadowerPool, city, slotsFl, slotsWp, attribution, installersErr = false, onRetryInstallers, reload, toast, onOpenOrder }: Props) {
  const [, setTick] = useState(0);
  const redraw = () => setTick((x) => x + 1);
  const { ask: askNote, modal: noteModal } = useNoteModal();

  // Pool is city-scoped (an installer can only take jobs in their own city);
  // installerById below still resolves against the FULL roster so an existing
  // cross-city assignment keeps rendering its installer's name.
  const pool = useMemo(() => inCity(installers.filter((i) => i.type === sj.type), city), [installers, sj.type, city]);
  // A split sub-job can carry its own delivery date — the warning below has to
  // be about THIS sub-job's material landing, not the order's.
  const sjDeliv = sjDeliveryDate(o, sj);
  /* Pickers open from TODAY, never from the delivery date. Material routinely
     lands before its recorded delivery date, and a hard `min` of
     max(today, delivery) greyed out tomorrow with no explanation at all — SMs
     read it as a broken calendar. The delivery date is a SOFT gate now:
     `delivFloor` drives the amber note under the Date field plus a confirm and
     a logged override on save, the same shape as the availability override in
     saveAssign. Do NOT fold delivFloor back into `min`. */
  const minDate = dstr(today);
  const delivFloor = (sjDeliv && sjDeliv > minDate) ? sjDeliv : '';
  const beforeDeliv = (d?: string | null) => !!(delivFloor && d && d < delivFloor);
  const confirmEarly = (d: string) => window.confirm(`${fmtDate(d)} is BEFORE the material delivery date (${fmtDate(delivFloor)}).\n\nOnly book this if the material is already at site. Continue?`);

  const assignsRef = useRef<Assignment[] | null>(null);
  if (assignsRef.current === null) {
    let assigns: Assignment[] = sj.assignments && sj.assignments.length
      ? sj.assignments.map((a) => ({ ...a }))
      : sj.installer_email
        ? [{ installer_id: sj.installer || '', installer_email: sj.installer_email, installer_name: installerById(installers, sj.installer)?.name || '?', mode: 'standard', date: sj.date || '', slots: sj.slot ? [sj.slot] : [], dates: [], primary: true }]
        : [];
    if (assigns.length && !assigns.some((a) => a.primary)) assigns[0].primary = true;
    assignsRef.current = assigns;
  }
  /* Shadowers are edited alongside the assignment and saved with it (Save
     assignments), and cleared whenever the slot/assignment is cleared — a
     shadower has nothing to observe once the visit is gone. */
  const [shadowers, setShadowers] = useState<Shadower[]>(() => parseShadowers(sj.shadower_email, sj.shadower_name));
  /* Mirrors the Step-1 date input purely so the delivery warning can react to
     typing — the authoritative value still comes off stepDateRef at Book-slot
     time, keeping the input uncontrolled like the rest of this section. */
  const [pickedDate, setPickedDate] = useState<string>(() => sj.date || (sj.assignments && sj.assignments[0] && sj.assignments[0].date) || delivFloor || dstr(today));

  const customModeRef = useRef(assignsRef.current.length > 0 && assignsRef.current[0].mode === 'custom');
  const editingSlotRef = useRef(sj.status === 'reschedule' || !sj.date);
  const stepDateRef = useRef<HTMLInputElement | null>(null);
  const stepTimeRef = useRef<HTMLInputElement | null>(null);
  const remarkRef = useRef<HTMLTextAreaElement | null>(null);

  const assigns = assignsRef.current;
  const customMode = customModeRef.current;

  const rolls = totalRolls(sj);
  const slotsN = slotsForWp(rolls);
  const curDate = sj.date || assigns[0]?.date || '';
  const rawSlot = sj.slot || assigns[0]?.slots?.[0] || '';
  const curTime = /^\d{1,2}:\d{2}$/.test(rawSlot) ? rawSlot : '09:00';

  function setMode(mode: 'standard' | 'custom') {
    customModeRef.current = mode === 'custom';
    assigns.forEach((a) => { a.mode = customModeRef.current ? 'custom' : 'standard'; });
    editingSlotRef.current = !customModeRef.current && !sj.date;
    redraw();
  }
  function pickInstaller(idx: number, val: string) {
    const inst = installerById(installers, val);
    assigns[idx].installer_id = val;
    assigns[idx].installer_email = inst ? inst.email : '';
    assigns[idx].installer_name = inst ? inst.name : '';
    redraw();
  }
  function removeAssign(idx: number) {
    assigns.splice(idx, 1);
    if (!assigns.some((a) => a.primary) && assigns.length) assigns[0].primary = true;
    redraw();
  }
  function makePrimary(idx: number) {
    assigns.forEach((a, i) => { a.primary = i === idx; });
    redraw();
  }
  function addAssign() {
    const curDate2 = sj.date || assigns[0]?.date || '';
    const rawSlot2 = sj.slot || assigns[0]?.slots?.[0] || '';
    const curTime2 = /^\d{1,2}:\d{2}$/.test(rawSlot2) ? rawSlot2 : '09:00';
    assigns.push({ installer_id: '', installer_email: '', installer_name: '', mode: customMode ? 'custom' : 'standard', date: customMode ? '' : curDate2, slots: customMode ? [] : [curTime2], dates: [], primary: false });
    redraw();
  }
  function fromChange(idx: number, val: string) {
    const a = assigns[idx];
    const to = (a.dates && a.dates[a.dates.length - 1]) || val;
    a.dates = dateRange(val, to);
    a.date = val;
    redraw();
  }
  function toChange(idx: number, val: string) {
    const a = assigns[idx];
    const from = (a.dates && a.dates[0]) || val;
    a.dates = dateRange(from, val);
    redraw();
  }
  function timeChange(idx: number, val: string) {
    assigns[idx].slots = [val];
    redraw();
  }

  function replaceSubjob(nextSj: Subjob): Subjob[] {
    return (o.subjobs || []).map((s) => (s.id === sj.id ? nextSj : s));
  }

  const bookSlot = async () => {
    const d = stepDateRef.current ? stepDateRef.current.value : '';
    const t = (stepTimeRef.current && stepTimeRef.current.value) || '09:00';
    if (!d) { toast('Please set a date for the slot'); return; }
    let delivOverride = '';
    if (beforeDeliv(d)) {
      if (!confirmEarly(d)) return;
      delivOverride = ' · ⚠ booked before delivery (' + fmtDate(delivFloor) + ') — SM override';
    }
    const wasResched = sj.status === 'reschedule';
    const remark = remarkRef.current ? (remarkRef.current.value || '').trim() : '';
    if (wasResched && !remark) { toast('Please enter a reason for the reschedule'); return; }
    const nextSj: Subjob = { ...sj, date: d, slot: t, status: 'scheduled' };
    if (wasResched) { nextSj.assignments = []; assignsRef.current = []; nextSj.shadower_email = null; nextSj.shadower_name = null; setShadowers([]); }
    else if (nextSj.assignments && nextSj.assignments.length) {
      nextSj.assignments = nextSj.assignments.map((a) => ({ ...a, date: d, slots: [t] }));
    }
    const nextSubjobs = replaceSubjob(nextSj);
    const nextStatus = syncParentStatus(nextSubjobs, o.status);
    const logLabel = wasResched ? sj.type + ' slot rescheduled' + (remark ? ' — ' + remark : '') : sj.type + ' slot booked';
    const nextLog = [...o.log, { t: logLabel + ': ' + fmtDate(d) + ' · ' + slotLabel(t, slotsFl, slotsWp) + delivOverride, d: new Date().toISOString(), by: 'manual' as const, who: attribution }];
    if (o.id) await sbPatch('install_orders', String(o.id), { status: nextStatus, subjobs: nextSubjobs, log: nextLog });
    await reload();
    toast(wasResched ? 'Slot rescheduled' : 'Slot booked');
    onOpenOrder(o.pi);
  };

  const clearSlot = async () => {
    if (!window.confirm(`Clear the ${sj.type} slot and remove all installer assignments? The order will return to "Service Created" status.`)) return;
    const nextSj: Subjob = { ...sj, date: null, slot: null, assignments: [], status: 'created', shadower_email: null, shadower_name: null };
    setShadowers([]);
    const nextSubjobs = replaceSubjob(nextSj);
    const nextStatus = syncParentStatus(nextSubjobs, o.status);
    const nextLog = [...o.log, { t: `${sj.type} slot cleared and installer released`, d: new Date().toISOString(), by: 'manual' as const, who: attribution }];
    if (o.id) await sbPatch('install_orders', String(o.id), { status: nextStatus, subjobs: nextSubjobs, log: nextLog });
    await reload();
    toast('Slot cleared');
    onOpenOrder(o.pi);
  };

  const saveAssign = async () => {
    const valid = assigns.filter((a) => a.installer_id);
    if (!valid.length) { toast('Select at least one installer'); return; }
    let delivOverrideNote = '';
    if (customMode) {
      const missingDate = valid.find((a) => !a.dates || !a.dates.length);
      if (missingDate) { toast('Please set dates for each installer before saving'); return; }
      if (sj.type === 'wallpaper') {
        const missingSlots = valid.find((a) => !a.slots || !a.slots.length || !a.slots[0]);
        if (missingSlots) { toast('Please set a start time for each wallpaper installer'); return; }
      }
      /* Custom mode owns its own dates, so it asks here rather than inheriting
         Step 1's confirm. */
      const early = valid.filter((a) => beforeDeliv((a.dates && a.dates[0]) || a.date));
      if (early.length) {
        const firstEarly = (early[0].dates && early[0].dates[0]) || early[0].date || '';
        if (!confirmEarly(firstEarly)) return;
        delivOverrideNote = ' · ⚠ starts before delivery (' + fmtDate(delivFloor) + ') — SM override';
      }
    } else {
      const d = sj.date;
      const t = sj.slot && /^\d{1,2}:\d{2}$/.test(sj.slot) ? sj.slot : '09:00';
      valid.forEach((a) => { a.date = d; a.slots = [t]; a.mode = 'standard'; });
    }
    /* Availability guard — assigning an installer on their weekly off or a
       leave date is allowed, but only with a logged override reason (soft
       gate, same shape as the source app's conflict override). */
    let availOverrideNote = '';
    const conflicts: string[] = [];
    for (const a of valid) {
      const inst = installerById(installers, a.installer_id);
      if (!inst) continue;
      const ds = a.mode === 'custom' ? a.dates || [] : a.date ? [a.date] : [];
      ds.forEach((d) => { if (isOffDay(inst, d)) conflicts.push(inst.name + ' on ' + fmtDate(d) + ' (' + offDayReason(inst, d) + ')'); });
    }
    if (conflicts.length) {
      const note = await askNote('Reason for assigning despite unavailability', '⚠ Unavailable: ' + conflicts.join('; '));
      if (!note) { toast('Reason required — nothing saved'); return; }
      availOverrideNote = ' · ⚠ assigned despite unavailability (' + conflicts.join('; ') + ') — SM override: "' + note + '"';
    }

    const wasResched = sj.status === 'reschedule';
    const remark = remarkRef.current ? (remarkRef.current.value || '').trim() : '';
    if (wasResched && !remark) { toast('Please enter a reason for the reschedule'); return; }
    /* A reschedule already carries a mandatory remark above — don't prompt twice. */
    const assignNote = wasResched ? remark : await askNote('Assign ' + sj.type + ' installer(s): ' + valid.map((a) => a.installer_name).join(', '));
    if (assignNote === null) return;

    const joined = joinShadowers(shadowers);
    const prevSh = parseShadowers(sj.shadower_email, sj.shadower_name);
    /* A (re)assignment resets the sub-job to `assigned`, so an installer whose
       booking actually MOVED has to reset with it — `assigns` is seeded by
       spreading the existing rows, so without this a re-assign after a reschedule
       left `status:'reschedule'` on the assignment while the sub-job said
       `assigned`, and the field app (which reads the installer's own status via
       statusForInstaller) showed them "To Reschedule — nothing to do" on a job
       just booked for them.

       But resetting EVERY assignee is the opposite bug, and it is the one the
       field sees: the SM re-opens this form to add a second installer or to fix a
       note, and a colleague who is already On The Way is yanked back to
       "Call the customer". They confirm they're on the way again, the next edit
       resets them again, and the order collects a run of identical log lines with
       no way to reach At Site — the exact shape of ENQ2026071780139's 32 "on the
       way" entries on 2026-08-26, each burst following an SM re-assignment.

       So the reset is scoped to assignees whose work actually changed: someone
       new to the sub-job, someone whose date or slots moved, or someone still
       carrying `reschedule` (which is never a state to leave a fresh booking in).
       `completed` stays terminal exactly as in OrderDrawer's setStatus. */
    const prevByKey = new Map<string, Assignment>();
    (sj.assignments || []).forEach((a) => {
      const k = (a.installer_email || a.installer_id || '').toString();
      if (k) prevByKey.set(k, a);
    });
    const sameDates = (x: Assignment, y: Assignment) => {
      const dx = x.mode === 'custom' ? (x.dates || []) : x.date ? [x.date] : [];
      const dy = y.mode === 'custom' ? (y.dates || []) : y.date ? [y.date] : [];
      return dx.length === dy.length && dx.every((d, i) => d === dy[i]);
    };
    const sameSlots = (x: Assignment, y: Assignment) =>
      (x.slots || []).length === (y.slots || []).length && (x.slots || []).every((sl, i) => sl === (y.slots || [])[i]);
    valid.forEach((a) => {
      if (a.status === 'completed') return;
      const prev = prevByKey.get((a.installer_email || a.installer_id || '').toString());
      const bookingMoved = !prev || a.mode !== prev.mode || !sameDates(a, prev) || !sameSlots(a, prev);
      if (bookingMoved || a.status === 'reschedule' || !a.status) a.status = 'assigned';
    });
    const nextSj: Subjob = {
      ...sj,
      assignments: valid,
      installer: valid[0].installer_id,
      installer_email: valid[0].installer_email || null,
      date: customMode ? (valid[0].mode === 'custom' ? (valid[0].dates && valid[0].dates[0]) || null : valid[0].date || null) : sj.date,
      slot: customMode ? (valid[0].slots && valid[0].slots[0]) || null : sj.slot,
      status: 'assigned',
      shadower_email: joined.email,
      shadower_name: joined.name,
    };
    const nextSubjobs = replaceSubjob(nextSj);
    const nextStatus = syncParentStatus(nextSubjobs, o.status);
    const logLabel = wasResched ? sj.type + ' rescheduled' + (remark ? ' — ' + remark : '') : sj.type + ' assigned';
    const prevSet = new Set(prevSh.map((s) => s.email)), newSet = new Set(shadowers.map((s) => s.email));
    const addedSh = shadowers.filter((s) => !prevSet.has(s.email)), removedSh = prevSh.filter((s) => !newSet.has(s.email));
    const shLogs = [
      ...(addedSh.length ? [{ t: 'Shadower(s) assigned: ' + addedSh.map((s) => s.name).join(', ') + ' (observing ' + sj.type + ' installation)', d: new Date().toISOString(), by: 'manual' as const, who: attribution }] : []),
      ...(removedSh.length ? [{ t: 'Shadower(s) removed from ' + sj.type + ' installation: ' + removedSh.map((s) => s.name).join(', '), d: new Date().toISOString(), by: 'manual' as const, who: attribution }] : []),
    ];
    const noteSuffix = wasResched ? '' : ' — note: "' + assignNote + '"';
    const nextLog = [...o.log, ...shLogs, { t: logLabel + ': ' + valid.map((a) => a.installer_name).join(', ') + delivOverrideNote + availOverrideNote + noteSuffix, d: new Date().toISOString(), by: 'manual' as const, who: attribution }];
    if (o.id) await sbPatch('install_orders', String(o.id), { status: nextStatus, subjobs: nextSubjobs, log: nextLog });
    await reload();
    toast(wasResched ? 'Rescheduled' : 'Assignments saved');
    onOpenOrder(o.pi);
  };

  const slotDone = !!curDate && !editingSlotRef.current;

  function AcardBody({ a, idx, showDates }: { a: Assignment; idx: number; showDates: boolean }) {
    const inst = a.installer_id ? installerById(installers, a.installer_id) : null;
    const isPrimary = !!a.primary;
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 mb-2.5">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-full bg-[#1F3A5F] text-white text-[11px] font-bold grid place-items-center shrink-0">{idx + 1}</div>
          <div className="flex-1">
            <div className="font-bold text-[13px]">{inst ? inst.name : 'Select installer'}</div>
            {/* This installer's OWN progress. On a shared sub-job only the primary
                writes `sj.status`, so for everyone else this is the only place
                their visit is recorded — and the only way the SM can see that
                someone has already finished. */}
            <div className="text-[11px] text-gray-500 flex items-center gap-1.5">
              {sj.type} installer
              {a.status ? <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${(STATUS[a.status] || { badge: 'bg-gray-100 text-gray-600' }).badge}`}>{(STATUS[a.status] || { l: a.status }).l}</span> : null}
            </div>
          </div>
          {isPrimary
            ? <span className="text-[10px] font-extrabold bg-yellow-100 text-yellow-800 rounded-md px-2 py-1">★ Primary</span>
            : <button className="bg-white border border-blue-500 text-blue-600 rounded-md px-2 py-1 text-[11px] font-semibold" onClick={() => makePrimary(idx)}>Make primary</button>}
          {assigns.length > 1 ? <button className="bg-white text-red-600 border border-red-200 rounded-md px-2 py-1 text-[11px] font-semibold" onClick={() => removeAssign(idx)}>Remove</button> : null}
        </div>
        <div className="flex flex-col gap-2">
          <div>
            <label className="block text-[10.5px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Installer</label>
            <select className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-[13px] bg-white" value={a.installer_id || ''} onChange={(e) => pickInstaller(idx, e.target.value)}>
              <option value="">— pick installer —</option>
              {pool.map((p) => {
                // Flag (but never block) an installer who's off on the date being assigned.
                const dateForOff = showDates ? (a.dates && a.dates[0]) || a.date || '' : curDate;
                const off = isOffDay(p, dateForOff);
                return <option key={p.id} value={p.id}>{p.name}{off ? ' · ' + offDayReason(p, dateForOff) : ''}</option>;
              })}
            </select>
          </div>
          {showDates ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10.5px] font-semibold uppercase tracking-wide text-gray-400 mb-1">From</label>
                  <input type="date" className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-[13px]" min={minDate} defaultValue={(a.dates && a.dates[0]) || a.date || ''} onChange={(e) => fromChange(idx, e.target.value)} />
                </div>
                <div>
                  <label className="block text-[10.5px] font-semibold uppercase tracking-wide text-gray-400 mb-1">To</label>
                  <input type="date" className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-[13px]" min={minDate} defaultValue={(a.dates && a.dates[a.dates.length - 1]) || a.date || ''} onChange={(e) => toChange(idx, e.target.value)} />
                </div>
              </div>
              {sj.type === 'wallpaper'
                ? (
                  <div>
                    <label className="block text-[10.5px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Start time per day</label>
                    <input type="time" className="border border-gray-200 rounded-md px-2.5 py-1.5 text-[13px] font-bold text-[#1F3A5F] bg-white" defaultValue={a.slots && a.slots.length && /^\d{1,2}:\d{2}$/.test(a.slots[0]) ? a.slots[0] : '09:00'} onChange={(e) => timeChange(idx, e.target.value)} />
                  </div>
                )
                : <div className="text-[11.5px] text-green-700">Full day (8 AM – 5 PM) per selected date</div>}
            </>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div>
      {noteModal}
      {/* Shown in BOTH modes — the dropdown is equally empty in either. */}
      {pool.length ? null : <EmptyInstallerPool err={installersErr} anyLoaded={!!installers.length} type={sj.type} onRetry={onRetryInstallers} />}
      <div className="flex rounded-md border border-gray-200 overflow-hidden mb-3 text-[12.5px] font-semibold">
        <div className={`flex-1 text-center py-1.5 cursor-pointer ${!customMode ? 'bg-[#1F3A5F] text-white' : 'bg-white text-gray-600'}`} onClick={() => setMode('standard')}>Standard</div>
        <div className={`flex-1 text-center py-1.5 cursor-pointer ${customMode ? 'bg-[#1F3A5F] text-white' : 'bg-white text-gray-600'}`} onClick={() => setMode('custom')}>Custom / Multi-day</div>
      </div>

      {customMode ? (
        <>
          <div className="rounded-md border-l-4 border-amber-500 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-800 mb-2.5">Custom mode: no capacity limits enforced. You control all dates and slots.</div>
          {assigns.map((a, idx) => <AcardBody key={idx} a={a} idx={idx} showDates />)}
          <div className="border border-dashed border-blue-500 text-blue-600 bg-white rounded-md text-center py-2 text-[12.5px] font-semibold cursor-pointer" onClick={addAssign}>＋ Add another installer</div>
          <ShadowerSelect options={shadowerPool} value={shadowers} onChange={setShadowers} label="Shadowed by (optional) — search & tick anyone observing this installation" />
          {sj.status === 'reschedule' ? (
            <div className="mt-2.5">
              <label className="block text-[10.5px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Reschedule reason <span className="text-red-600">*</span></label>
              <textarea ref={remarkRef} placeholder="Reason for reschedule, customer notes…" className="w-full min-h-[64px] px-2.5 py-2 border border-gray-200 rounded-md text-[12.5px] resize-y" />
            </div>
          ) : null}
          <button className="bg-[#1F3A5F] text-white w-full mt-2 py-2 rounded-md text-[13px] font-semibold" onClick={saveAssign}>{sj.status === 'reschedule' ? 'Save reschedule' : 'Save assignments'}</button>
        </>
      ) : (
        <>
          <div className="rounded-lg border border-gray-200 mb-3">
            <div className={`flex items-center gap-2 px-3 py-2 border-b border-gray-100 ${slotDone ? 'bg-green-50' : ''}`}>
              <div className="w-6 h-6 rounded-full bg-[#1F3A5F] text-white text-[11px] font-bold grid place-items-center shrink-0">{slotDone ? '✓' : '1'}</div>
              <div className="text-[13px] font-bold">{slotDone ? 'Slot booked' : 'Step 1 — Book a slot'}</div>
              {slotDone ? <button className="ml-auto bg-white border border-blue-500 text-blue-600 rounded-md px-2 py-1 text-[11px] font-semibold" onClick={() => { editingSlotRef.current = true; redraw(); }}>Edit</button> : null}
            </div>
            {slotDone ? (
              <div className="px-3 py-2.5">
                <span className="font-bold text-[13.5px] text-[#1F3A5F]">{fmtDate(curDate)}</span>
                <span className="text-gray-500 text-[12.5px] ml-1.5">· {slotLabel(curTime, slotsFl, slotsWp)}</span>
              </div>
            ) : (
              <div className="px-3 py-2.5 flex flex-col gap-2">
                {sj.type === 'wallpaper' ? <div className="text-[11.5px] text-gray-500">{rolls} roll{rolls === 1 ? '' : 's'} → {slotsN * 3}h of work. Choose date &amp; start time.</div> : null}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10.5px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Date{delivFloor ? <span className="normal-case font-normal tracking-normal text-gray-400"> · delivery {fmtDate(delivFloor)}</span> : null}</label>
                    <input ref={stepDateRef} type="date" className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-[13px]" min={minDate} defaultValue={curDate || delivFloor || dstr(today)} onChange={(e) => setPickedDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-[10.5px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Start time</label>
                    <input ref={stepTimeRef} type="time" className="border border-gray-200 rounded-md px-2.5 py-1.5 text-[13px] font-bold text-[#1F3A5F] bg-white w-full" defaultValue={curTime} />
                  </div>
                </div>
                {beforeDeliv(pickedDate) ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11.5px] font-semibold text-amber-800">
                    ⚠ Before the material delivery date ({fmtDate(delivFloor)}) — book it only if the material is already at site.
                  </div>
                ) : null}
                {sj.status === 'reschedule' ? (
                  <div>
                    <label className="block text-[10.5px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Reschedule reason <span className="text-red-600">*</span></label>
                    <textarea ref={remarkRef} placeholder="Reason for reschedule, customer notes…" className="w-full min-h-[56px] px-2.5 py-2 border border-gray-200 rounded-md text-[12.5px] resize-y" />
                  </div>
                ) : null}
                <button className="bg-[#1F3A5F] text-white w-full py-2 rounded-md text-[13px] font-semibold" onClick={bookSlot}>{sj.status === 'reschedule' ? 'Book new slot' : 'Book slot'}</button>
                {(sj.date || (sj.assignments && sj.assignments.length)) ? <button className="bg-white text-red-600 border border-red-200 w-full mt-1 py-2 rounded-md text-[13px] font-semibold" onClick={clearSlot}>Clear slot &amp; release installer</button> : null}
              </div>
            )}
          </div>
          {slotDone ? (
            <div className="rounded-lg border border-gray-200">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
                <div className="w-6 h-6 rounded-full bg-[#1F3A5F] text-white text-[11px] font-bold grid place-items-center shrink-0">2</div>
                <div className="text-[13px] font-bold">Step 2 — Assign installer</div>
              </div>
              <div className="px-3 py-2.5">
                {assigns.map((a, idx) => <AcardBody key={idx} a={a} idx={idx} showDates={false} />)}
                <div className="border border-dashed border-blue-500 text-blue-600 bg-white rounded-md text-center py-2 text-[12.5px] font-semibold cursor-pointer" onClick={addAssign}>＋ Add another installer</div>
                <ShadowerSelect options={shadowerPool} value={shadowers} onChange={setShadowers} label="Shadowed by (optional) — search & tick anyone observing this installation" />
                <button className="bg-[#1F3A5F] text-white w-full mt-1.5 py-2 rounded-md text-[13px] font-semibold" onClick={saveAssign}>Save assignment</button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
