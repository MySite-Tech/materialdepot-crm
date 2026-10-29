'use client';

import { Period } from '../../../models/outreach/kpis';
import { Goals, PerfCard, PerfKpiDef, Person } from '../../../models/performance/types';
import { fmtNumber, fmtValue, goalKey, paceFor, targetFor, tone } from '../../../models/performance/utils';
import type { B2BTeam } from '@/lib/b2b/team/types';
import { useMemo, useState } from 'react';

const th = 'px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap select-none';

export interface PersonRow { person: Person; card: PerfCard }

export function TeamTable({ defs, team, goals, rows, total, people, period, today, teamLive, loading, onPick }: {
  defs: PerfKpiDef[];
  team: B2BTeam;
  goals: Goals;
  rows: PersonRow[];
  total: PerfCard;
  people: Person[];
  period: Period;
  today: string;
  teamLive: boolean;
  loading: (key: string) => boolean;
  onPick: (p: Person) => void;
}) {
  const [sort, setSort] = useState<{ key: string; desc: boolean }>({ key: defs[0]?.key ?? '', desc: true });
  const sorted = useMemo(() => {
    const v = (r: PersonRow) => r.card[sort.key]?.value;
    return [...rows].sort((a, b) => {
      const x = v(a);
      const y = v(b);
      if (x === y) return a.person.name.localeCompare(b.person.name);
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return sort.desc ? y - x : x - y;
    });
  }, [rows, sort]);

  const set = (def: PerfKpiDef) => people.some((p) => goals[goalKey(team, p)]?.[def.key] !== undefined);
  const cell = (def: PerfKpiDef, card: PerfCard, who: Person[]) => {
    if (loading(def.key)) return <span className="text-gray-300">…</span>;
    const k = card[def.key];
    const t = targetFor(def, team, who, goals, period, today);
    return <span title={k.sub} className={tone(k.value, t, paceFor(def, period, today)).text}>{fmtValue(def, k)}</span>;
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 min-w-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              <th className={`${th} text-left`}>Person</th>
              {defs.map((d) => {
                const t = targetFor(d, team, [], goals, period, today);
                const on = sort.key === d.key;
                return (
                  <th key={d.key} title={`${d.rule}\nClick to sort.`} onClick={() => setSort({ key: d.key, desc: on ? !sort.desc : true })}
                    className={`${th} text-right cursor-pointer hover:text-gray-700 ${on ? 'text-gray-700' : ''}`}>
                    {d.short}{on ? (sort.desc ? ' ↓' : ' ↑') : ''}
                    <span className="block font-semibold normal-case tracking-normal text-gray-300">{t === null ? d.kind : set(d) ? 'set per person' : `/ ${fmtNumber(d, t)} each`}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100 bg-gray-50/40">
              <td className="px-3 py-2 font-bold text-gray-900 whitespace-nowrap">Whole team <span className="font-normal text-gray-400">· {rows.length}</span></td>
              {defs.map((d) => <td key={d.key} className="px-3 py-2 text-right font-mono font-bold whitespace-nowrap">{cell(d, total, people)}</td>)}
            </tr>
            {sorted.map(({ person, card }) => (
              <tr key={person.key} onClick={() => onPick(person)} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                <td className="px-3 py-2 font-semibold text-gray-900 whitespace-nowrap">
                  {person.name}
                  {teamLive && !person.onTeam && (
                    <span title="Holds work in the data but is not on this team's list. Add them under B2B → Team." className="ml-1.5 text-[9.5px] font-semibold text-amber-600">not on team</span>
                  )}
                </td>
                {defs.map((d) => <td key={d.key} className="px-3 py-2 text-right font-mono whitespace-nowrap">{cell(d, card, [person])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="px-4 py-6 text-center text-[12px] text-gray-400">Nobody on this team holds any work yet.</p>}
    </div>
  );
}
