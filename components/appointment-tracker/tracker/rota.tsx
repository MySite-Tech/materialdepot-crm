'use client';

import { DOW_SHORT, SHIFT_META, SHIFT_ORDER, SLOTS } from '../constants/appointments';
import { capacityForDate, savePlan } from './rota-data';
import { RotaBranchData, RotaPlan, ShiftCode } from '../types/appointments';
import { codeAt, emptyBranchData, isWeekend, mondayKeyOf, mondayOf, newMemberId, shortDate, withCodeAt } from '../utils/appointments';
import { Branch, ymd } from '@/lib/appointments/appt-shared';
import { useEffect, useMemo, useState } from 'react';

export function RotaPlanner({ plan, reloadPlan, branch, branchOptions, allowBranchSwitch = false }: {
  plan: RotaPlan;

  reloadPlan: () => Promise<RotaPlan>;
  branch: Branch;

  branchOptions: Branch[];
  allowBranchSwitch?: boolean;
}) {
  const [editBranch, setEditBranch] = useState<Branch>(branch);
  const [draft, setDraft] = useState<RotaPlan>(plan);
  const [savingState, setSavingState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (touched) return;
    setDraft(plan);
  }, [plan, touched]);
  useEffect(() => { setEditBranch(branch); }, [branch]);

  const b = allowBranchSwitch ? editBranch : branch;
  const isDirty = JSON.stringify(plan) !== JSON.stringify(draft);
  const branchData = draft.branches[b] ?? emptyBranchData();

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return d;
  }), [weekStart]);
  const weekKey = mondayKeyOf(weekStart);
  const today = ymd(new Date());

  const setCell = (memberId: string, dayIdx: number, value: ShiftCode | "-") => {
    setTouched(true);
    setDraft((prev) => {
      const bd = prev.branches[b] ?? emptyBranchData();
      const week = { ...(bd.weeks[weekKey] ?? {}) };
      week[memberId] = withCodeAt(week[memberId], dayIdx, value);
      return { ...prev, branches: { ...prev.branches, [b]: { ...bd, weeks: { ...bd.weeks, [weekKey]: week } } } };
    });
  };

  const addMember = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setTouched(true);
    setDraft((prev) => {
      const bd = prev.branches[b] ?? emptyBranchData();
      return { ...prev, branches: { ...prev.branches, [b]: { ...bd, members: [...bd.members, { id: newMemberId(), name: trimmed }] } } };
    });
    setNewName("");
  };
  const renameMember = (memberId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setTouched(true);
    setDraft((prev) => {
      const bd = prev.branches[b] ?? emptyBranchData();
      return { ...prev, branches: { ...prev.branches, [b]: { ...bd, members: bd.members.map((m) => m.id === memberId ? { ...m, name: trimmed } : m) } } };
    });
  };
  const removeMember = (memberId: string) => {
    setTouched(true);
    setDraft((prev) => {
      const bd = prev.branches[b] ?? emptyBranchData();
      return { ...prev, branches: { ...prev.branches, [b]: { ...bd, members: bd.members.filter((m) => m.id !== memberId) } } };
    });
  };

  const handleSave = async () => {
    setSavingState("saving");
    setSaveError(null);
    try {
      await savePlan(draft, b);

      setTouched(false);
      const fresh = await reloadPlan();
      setDraft(fresh);
      setSavingState("saved");
      setTimeout(() => setSavingState("idle"), 2000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
      setSavingState("error");
    }
  };

  const handleReset = async () => {
    setTouched(false);
    setDraft(plan);
    try {
      setDraft(await reloadPlan());
    } catch { /* keep the local copy if the refresh fails */ }
  };

  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-[13px] font-bold text-gray-800 flex items-center gap-2">
          <span className="inline-block h-3.5 w-1 rounded-full bg-[#EAB308]" />
          Rota planner {allowBranchSwitch ? "" : <>· <span className="rounded-full bg-[#FEF9C3] text-[#7A5C00] px-2 py-0.5 text-[11px] font-semibold">{branch}</span></>}
        </h2>
        <div className="flex items-center gap-2">
          {allowBranchSwitch && (
            <select value={editBranch} onChange={(e) => setEditBranch(e.target.value as Branch)} className="border border-gray-200 rounded px-2.5 py-1 text-[12px] text-gray-700 outline-none focus:border-yellow-400 bg-white">
              {branchOptions.map((br) => <option key={br} value={br}>{br}</option>)}
            </select>
          )}
          {savingState === "saved" && <span className="text-[11px] text-green-600 font-medium">✓ Saved</span>}
          {savingState === "saving" && <span className="text-[11px] text-gray-400">Saving…</span>}
          {savingState === "error" && <span className="text-[11px] text-rose-500" title={saveError || ""}>⚠ Save failed</span>}
          {isDirty && (
            <button onClick={handleReset} className="px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              Discard
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!isDirty || savingState === "saving"}
            className="px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border border-[#EAB308] bg-[#EAB308] text-black hover:bg-[#D4A107] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            Save plan
          </button>
        </div>
      </div>
      <p className="text-[11px] text-gray-400 mb-3">
        Plan who&apos;s on 1st / 2nd / General shift, Week off, Leave or Comp off each day. Appointment-calendar slot
        capacity is derived from this roster (80% of scheduled headcount on weekdays, 50% on weekends) — no manual
        numbers to maintain. Changes save to the Kylas settings lead ({" "}<code>cfResourceplanjson</code>{" "}) — shared
        across all users after Save.
      </p>

      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => setWeekStart((w) => { const d = new Date(w); d.setDate(d.getDate() - 7); return d; })} className="px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all">←</button>
        <span className="rounded border border-gray-200 bg-white px-3 py-1 text-[12px] font-semibold text-gray-700 min-w-[150px] text-center">
          {shortDate(days[0])} – {shortDate(days[6])}
        </span>
        <button onClick={() => setWeekStart((w) => { const d = new Date(w); d.setDate(d.getDate() + 7); return d; })} className="px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all">→</button>
        <button onClick={() => setWeekStart(mondayOf(new Date()))} className="px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all">This week</button>
      </div>

      <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl shadow-sm">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-gray-50 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              <th className="px-3 py-2 border-r border-gray-200 sticky left-0 bg-gray-50 min-w-[150px]">Advisor</th>
              {days.map((d, i) => {
                const isToday = ymd(d) === today;
                const weekend = isWeekend(d);
                return (
                  <th key={i} className={`px-2 py-2 min-w-[110px] text-center ${weekend ? "text-rose-500" : ""} ${isToday ? "bg-[#EAB308]/10" : ""}`}>
                    <div>{DOW_SHORT[i]}</div>
                    <div className="text-gray-400 font-normal normal-case">{d.getDate()}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {branchData.members.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-[12px] text-gray-400">No advisors yet — add one below.</td></tr>
            ) : branchData.members.map((m) => (
              <tr key={m.id} className="group">
                <td className="px-3 py-1.5 border-r border-gray-200 sticky left-0 bg-white text-[11px] font-medium text-gray-700 whitespace-nowrap">
                  {renamingId === m.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => { renameMember(m.id, renameValue); setRenamingId(null); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="w-full rounded border border-[#EAB308] px-1.5 py-0.5 text-[11px] text-gray-700 focus:outline-none"
                    />
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="truncate">{m.name}</span>
                      <span className="hidden group-hover:inline-flex gap-1 ml-auto">
                        <button title="Rename" onClick={() => { setRenamingId(m.id); setRenameValue(m.name); }} className="text-gray-400 hover:text-gray-700">✎</button>
                        <button title="Remove" onClick={() => { if (confirm(`Remove ${m.name} from the roster?`)) removeMember(m.id); }} className="text-gray-400 hover:text-rose-600">×</button>
                      </span>
                    </div>
                  )}
                </td>
                {days.map((d, dayIdx) => {
                  const code = codeAt(branchData.weeks[weekKey]?.[m.id], dayIdx);
                  const meta = code !== "-" ? SHIFT_META[code] : null;
                  return (
                    <td key={dayIdx} className="px-1.5 py-1.5 text-center">
                      <select
                        value={code}
                        onChange={(e) => setCell(m.id, dayIdx, e.target.value as ShiftCode | "-")}
                        className={`w-full rounded border px-1 py-1 text-[11px] font-semibold text-center focus:outline-none ${meta ? meta.bg : "bg-white text-gray-400 border-gray-200"}`}
                      >
                        <option value="-">—</option>
                        {SHIFT_ORDER.map((c) => <option key={c} value={c}>{SHIFT_META[c].label}</option>)}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); addMember(newName); }}
        className="flex items-center gap-2 mt-2"
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={`Add an advisor to ${b}…`}
          className="flex-1 max-w-[220px] border border-gray-200 rounded px-2.5 py-1 text-[12px] text-gray-700 outline-none focus:border-yellow-400 bg-white"
        />
        <button type="submit" className="px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all">Add</button>
      </form>

      <div className="flex flex-wrap gap-3 items-center mt-3 text-[11px] text-gray-600">
        {SHIFT_ORDER.map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5">
            <span className={`inline-block w-2 h-2 rounded-full ${SHIFT_META[c].dot}`} /> {SHIFT_META[c].label}
          </span>
        ))}
      </div>

      <RotaCapacityPreview branchData={branchData} days={days} />
    </div>
  );
}

function RotaCapacityPreview({ branchData, days }: { branchData: RotaBranchData; days: Date[] }) {
  return (
    <div className="mt-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
        Derived slot capacity · this week
      </h3>
      <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl shadow-sm">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-gray-50 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              <th className="px-3 py-1.5 border-r border-gray-200 sticky left-0 bg-gray-50">Slot</th>
              {days.map((d, i) => (
                <th key={i} className={`px-2 py-1.5 min-w-[70px] text-center ${isWeekend(d) ? "text-rose-500" : ""}`}>{DOW_SHORT[i]}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {SLOTS.map((s) => (
              <tr key={s.key}>
                <td className="px-3 py-1 border-r border-gray-200 sticky left-0 bg-white font-medium text-gray-700 text-[11px] whitespace-nowrap">{s.label}</td>
                {days.map((d, i) => (
                  <td key={i} className="px-2 py-1 text-center text-[11px] text-gray-600">{capacityForDate(branchData, d, s)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
