'use client';

import { StaffExit, WDAYS, sbPatch } from '../../../shared';
import { DEFAULT_CAP, today } from '../../constants';
import { Auditor } from '../../types';
import { addDays, capFor, dstr, fmtDate, offReason } from '../../utils';
import { Empty, Head } from '../cells';
import { TH } from '../../constants';
import { useState } from 'react';

export function AuditorsView({
  auditors, formerAuditors = [], canRetire = false, onAddStaff, onRemove, onRestore, reload, toast,
}: {
  auditors: Auditor[];

  formerAuditors?: Array<Auditor & StaffExit>;

  canRetire?: boolean;
  onAddStaff: () => void;
  onRemove?: (a: Auditor) => void;
  onRestore?: (a: Auditor & StaffExit) => void;
  reload: () => Promise<void>; toast: (m: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(i));
  const todayStr = dstr(today);
  const [showFormer, setShowFormer] = useState(false);

  type Draft = { activeFrom: string | null; weeklyOff: number | null; leaveDates: string[]; dailyCap: number | null; capOverrides: Record<string, number> };
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const stateOf = (a: Auditor): Draft => draft[a.id] || {
    activeFrom: a.activeFrom, weeklyOff: a.weeklyOff ?? null, leaveDates: a.leaveDates || [],
    dailyCap: a.dailyCap ?? null, capOverrides: a.capOverrides || {},
  };
  const setState = (a: Auditor, next: Draft) => setDraft((d) => ({ ...d, [a.id]: next }));

  const dirty = Object.keys(draft).length > 0;

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
          {canRetire ? (
            <button
              onClick={() => setShowFormer((v) => !v)}
              className={showFormer
                ? 'rounded-md bg-gray-800 px-3 py-2 text-[13px] font-semibold text-white'
                : 'rounded-md border border-gray-200 bg-white px-3 py-2 text-[13px] font-semibold text-gray-700'}
            >
              Former staff ({formerAuditors.length})
            </button>
          ) : null}
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
                      {canRetire && onRemove ? (
                        <button
                          onClick={() => onRemove(a)}
                          title={'Mark ' + a.name + ' as no longer staff'}
                          className="rounded-full border border-red-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-red-600"
                        >
                          Remove
                        </button>
                      ) : null}
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

      {canRetire && showFormer ? (
        <div className="mt-4">
          <h2 className="text-[15px] font-bold text-gray-900">Former auditors</h2>
          <p className="mb-2 mt-0.5 text-[12.5px] text-gray-500">
            Removed from the roster, kept on record. They take no jobs and count towards nobody&apos;s capacity — this is the attrition history, and where an accidental removal is undone.
          </p>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full">
              <thead><tr>{['Name', 'City', 'Left on', 'Reason', 'Removed by', ''].map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead>
              <tbody>
                {formerAuditors.length ? formerAuditors.map((a) => (
                  <tr key={a.id} className="border-t border-gray-100">
                    <td className="px-3 py-2.5 text-[13px]"><b>{a.name}</b><div className="text-[11.5px] text-gray-400">{a.email}</div></td>
                    <td className="px-3 py-2.5 text-[12.5px] text-gray-500">{a.city}</td>
                    <td className="px-3 py-2.5 text-[12.5px] text-gray-500">{fmtDate(a.deletedAt)}</td>
                    <td className="px-3 py-2.5 text-[12.5px] text-gray-700">{a.exitReason || '—'}</td>
                    <td className="px-3 py-2.5 text-[11.5px] text-gray-400">{a.deletedBy || '—'}</td>
                    <td className="px-3 py-2.5">
                      {onRestore ? (
                        <button onClick={() => onRestore(a)} className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#1f7a3f]">Bring back</button>
                      ) : null}
                    </td>
                  </tr>
                )) : <Empty cols={6} msg="Nobody has been removed from this city's roster." />}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}
