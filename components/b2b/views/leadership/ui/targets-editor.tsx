'use client';

import { revenueTargetL } from '../../../models/performance';
import { Goals, PerfKpiDef, Person, TargetStore, TeamEngine } from '../../../models/performance/types';
import { fmtNumber, goalKey } from '../../../models/performance/utils';
import { saveTargets } from '@/lib/b2b';
import type { B2BTeam } from '@/lib/b2b/team/types';
import { useEffect, useMemo, useState } from 'react';

const th = 'px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap';

type Draft = Record<string, Record<string, string>>;

const UNIT_HINT: Record<PerfKpiDef['unit'], string> = { count: 'a month', '%': '', L: '₹ lakh a month' };

function toGoals(goals: Goals, team: B2BTeam, people: Person[], defs: PerfKpiDef[], draft: Draft): Goals {
  const next: Goals = { ...goals };
  for (const p of people) {
    const key = goalKey(team, p);
    const mine = { ...next[key] };
    for (const d of defs) {
      const raw = draft[key]?.[d.key];
      if (raw === undefined) continue;
      const n = Number(raw);
      if (raw.trim() === '' || !Number.isFinite(n) || n < 0 || n === d.target) delete mine[d.key];
      else mine[d.key] = n;
    }
    if (Object.keys(mine).length) next[key] = mine;
    else delete next[key];
  }
  return next;
}

export function TargetsEditor({ engine, people, store, totals, onSaved }: {
  engine: TeamEngine;
  people: Person[];
  store: TargetStore;
  totals: { team: B2BTeam; label: string; heads: number; revenueL: number }[];
  onSaved: (next: TargetStore) => void;
}) {
  const defs = useMemo(() => engine.defs.filter((d) => d.target !== null), [engine]);
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setDraft({}); setError(''); }, [engine.team]);

  const goals = useMemo(() => toGoals(store.goals, engine.team, people, defs, draft), [store.goals, engine.team, people, defs, draft]);
  const dirty = JSON.stringify(goals) !== JSON.stringify(store.goals);
  const valueOf = (p: Person, d: PerfKpiDef): number => goals[goalKey(engine.team, p)]?.[d.key] ?? (d.target as number);
  const shown = (p: Person, d: PerfKpiDef): string => {
    const key = goalKey(engine.team, p);
    const raw = draft[key]?.[d.key];
    if (raw !== undefined) return raw;
    const set = store.goals[key]?.[d.key];
    return set === undefined ? '' : String(set);
  };
  const edit = (p: Person, d: PerfKpiDef, v: string) => {
    const key = goalKey(engine.team, p);
    setDraft((cur) => ({ ...cur, [key]: { ...cur[key], [d.key]: v } }));
  };
  const teamTotal = (d: PerfKpiDef): number => {
    const sum = people.reduce((a, p) => a + valueOf(p, d), 0);
    return d.unit === '%' ? Math.round(sum / Math.max(1, people.length)) : Math.round(sum * 100) / 100;
  };

  const save = async () => {
    setSaving(true);
    const next = { ...store, goals };
    const err = await saveTargets(next);
    setSaving(false);
    if (err) { setError(`Not saved: ${err}`); return; }
    setError('');
    setDraft({});
    onSaved(next);
  };

  const liveTotals = totals.map((t) => (t.team === engine.team ? { ...t, revenueL: revenueTargetL(engine.team, people, { ...store, goals }) } : t));
  const b2b = Math.round(liveTotals.reduce((a, t) => a + t.revenueL, 0) * 100) / 100;

  return (
    <div className="flex flex-col gap-3">
      <section className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex flex-wrap items-center gap-x-8 gap-y-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">B2B monthly revenue target</div>
          <div className="font-mono text-[22px] font-bold text-gray-900 leading-tight">₹{b2b}L</div>
        </div>
        <div className="text-[11.5px] text-gray-500 flex flex-wrap gap-x-5 gap-y-1">
          {liveTotals.map((t) => (
            <span key={t.team}><span className="font-semibold text-gray-700">{t.label}</span> ₹{Math.round(t.revenueL * 100) / 100}L · {t.heads} {t.heads === 1 ? 'person' : 'people'}</span>
          ))}
        </div>
        <p className="basis-full text-[11px] text-gray-400">The sum of every team member&rsquo;s revenue target. The Dashboard measures against this number.</p>
      </section>

      <section className="bg-white rounded-lg border border-gray-200 min-w-0 overflow-hidden">
        <div className="px-4 pt-3 pb-2 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[13px] font-bold text-gray-900">{engine.label} targets</div>
            <div className="text-[11px] text-gray-400 mt-0.5">A blank cell uses the KPI sheet default shown in grey. Clear a cell to go back to it.</div>
          </div>
          <div className="flex items-center gap-2">
            {dirty && <button onClick={() => setDraft({})} disabled={saving} className="px-3 py-1.5 text-[12px] font-semibold text-gray-600 hover:text-gray-900">Discard</button>}
            <button onClick={save} disabled={!dirty || saving}
              className="px-3 py-1.5 text-[12px] font-semibold rounded-md bg-[#1A1A1A] text-white disabled:bg-gray-200 disabled:text-gray-400">
              {saving ? 'Saving…' : 'Save targets'}
            </button>
          </div>
        </div>
        {!!error && <div className="px-4 py-2 text-[12px] text-red-700 bg-red-50 border-b border-red-100">{error}</div>}
        {!people.length ? (
          <p className="px-4 py-6 text-center text-[12px] text-gray-400">Nobody is on the {engine.label} team list. Add people under B2B → Team.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className={`${th} text-left`}>Person</th>
                  {defs.map((d) => (
                    <th key={d.key} title={d.rule} className={`${th} text-right`}>
                      {d.short}
                      <span className="block font-semibold normal-case tracking-normal text-gray-300">sheet {fmtNumber(d, d.target as number)}{UNIT_HINT[d.unit] && d.unit !== 'L' ? ` ${UNIT_HINT[d.unit]}` : ''}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.key} className="border-b border-gray-50 last:border-0">
                    <td className="px-3 py-1.5 font-semibold text-gray-900 whitespace-nowrap">{p.name}</td>
                    {defs.map((d) => {
                      const v = shown(p, d);
                      return (
                        <td key={d.key} className="px-3 py-1.5 text-right">
                          <input type="number" min={0} value={v} placeholder={String(d.target)} onChange={(e) => edit(p, d, e.target.value)}
                            aria-label={`${p.name} ${d.label} target`}
                            className={`w-20 px-2 py-1 text-right font-mono text-[12px] rounded border outline-none focus:border-[#0F766E] placeholder:text-gray-300 ${v !== '' ? 'border-amber-300 bg-amber-50/60' : 'border-gray-200'}`} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="bg-gray-50/60 border-t border-gray-100">
                  <td className="px-3 py-2 font-bold text-gray-900 whitespace-nowrap">Team <span className="font-normal text-gray-400">· {people.length}</span></td>
                  {defs.map((d) => (
                    <td key={d.key} className="px-3 py-2 text-right font-mono font-bold text-gray-700 whitespace-nowrap">
                      {fmtNumber(d, teamTotal(d))}
                      {d.unit === '%' && <span className="block text-[9.5px] font-normal text-gray-400">average</span>}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
