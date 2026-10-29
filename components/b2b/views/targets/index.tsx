'use client';

import { istToday } from '../../models/outreach';
import { monthPeriod } from '../../models/outreach/kpis';
import { ENGINES, TEAM_ORDER, failedSources, scoreCard, selfOn } from '../../models/performance';
import { Goals, PerfKpiDef, Person, TargetStore } from '../../models/performance/types';
import { goalKey, targetFor } from '../../models/performance/utils';
import { fmtL } from '../../models/mock-data';
import { useInboundAssigned } from '../leadership/hooks/use-inbound-assigned';
import { usePerformanceData } from '../leadership/hooks/use-performance-data';
import { PersonCard } from './ui/person-card';
import { saveTargets } from '@/lib/b2b';
import type { B2BTeam, B2BTeamLoad, Viewer } from '@/lib/b2b/team/types';
import { ReactNode, useEffect, useMemo, useState } from 'react';

function Notice({ tone = 'amber', children }: { tone?: 'amber' | 'red'; children: ReactNode }) {
  const cls = tone === 'red' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900';
  return <div className={`rounded-lg border px-4 py-2.5 text-[12px] ${cls}`}>{children}</div>;
}

function withGoal(goals: Goals, team: B2BTeam, person: Person, def: PerfKpiDef, v: number | null): Goals {
  const key = goalKey(team, person);
  const mine = { ...goals[key] };
  if (v === null) delete mine[def.key];
  else mine[def.key] = v;
  const next = { ...goals };
  if (Object.keys(mine).length) next[key] = mine;
  else delete next[key];
  return next;
}

export default function Targets({ team, viewer }: { team: B2BTeamLoad; viewer: Viewer }) {
  const today = istToday();
  const period = useMemo(() => monthPeriod(today.slice(0, 7)), [today]);
  const manager = viewer.isManager;
  const live = !team.tableMissing && !team.error;

  const [teamKey, setTeamKey] = useState<B2BTeam>(viewer.member?.team ?? 'inbound');
  const [saveError, setSaveError] = useState('');
  const { data, pending, targets, targetsOk, setTargets } = usePerformanceData(teamKey, today);

  const selves = useMemo(
    () => (!manager && data && !team.loading ? selfOn(data, viewer, team.members, live) : []),
    [manager, data, viewer, team.members, team.loading, live],
  );
  useEffect(() => {
    if (!manager && selves.length && !selves.some((s) => s.team === teamKey)) setTeamKey(selves[0].team);
  }, [manager, selves, teamKey]);

  const engine = ENGINES[teamKey];
  const everyone = useMemo(
    () => (data && !team.loading ? engine.people(data, team.members, live) : []),
    [engine, data, team.members, team.loading, live],
  );
  const people = useMemo<Person[]>(() => {
    if (!manager) return selves.filter((s) => s.team === teamKey).map((s) => s.person);
    return live ? everyone.filter((p) => p.onTeam) : everyone;
  }, [manager, selves, teamKey, live, everyone]);
  const offList = live ? everyone.filter((p) => !p.onTeam) : [];

  const kylas = useInboundAssigned(people, period, teamKey === 'inbound' && !!data);
  const full = useMemo(() => data && { ...data, assigned: kylas.assigned }, [data, kylas.assigned]);
  const loading = (key: string) => pending || (teamKey === 'inbound' && key === 'coverage' && kylas.loading);

  const cards = useMemo(
    () => (full ? people.map((person) => ({ person, card: scoreCard(engine, full, [person], period) })) : []),
    [engine, full, people, period],
  );
  const teamCard = useMemo(() => (full && people.length ? scoreCard(engine, full, people, period) : null), [engine, full, people, period]);

  const achieved = useMemo(() => {
    if (!data) return null;
    let total = 0;
    for (const t of TEAM_ORDER) {
      const e = ENGINES[t];
      const all = e.people(data, team.members, live);
      const k = all.length ? scoreCard(e, data, all, period).revenue : null;
      if (k?.unknown) return null;
      total += k?.value ?? 0;
    }
    return total;
  }, [data, team.members, live, period]);

  if (!targets || team.loading) return <div className="p-4 sm:p-6 text-sm text-gray-400">Loading targets…</div>;

  const goals = targets.goals;
  const persist = async (next: TargetStore) => {
    setTargets(next);
    const err = await saveTargets(next);
    setSaveError(err ? `Not saved: ${err}` : '');
  };

  const targetRs = targets.monthlyTargetL * 1_00_000;
  const pct = achieved !== null && targetRs > 0 ? Math.round(((achieved * 1_00_000) / targetRs) * 100) : 0;
  const teams = manager ? TEAM_ORDER : selves.map((s) => s.team);

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-3">
      <div>
        <h1 className="text-lg font-bold text-gray-800">Targets</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Every KPI from the Studio Team KPI sheet, per person on the B2B team list · achieved is this month only
        </p>
      </div>

      {!targetsOk && (
        <Notice><span className="font-semibold">Saved targets could not be read.</span> The goals below are the KPI sheet defaults, not what your team saved.{manager ? ' Editing one will try to write again.' : ''}</Notice>
      )}
      {!!saveError && (
        <Notice tone="red"><span className="font-semibold">{saveError}</span> The number on screen is not stored. Reload and try again.</Notice>
      )}
      {manager && !live && (
        <Notice>
          {team.tableMissing ? 'The B2B team list is not set up yet' : `The B2B team list did not load (${team.error})`}, so the people below are
          {' '}whoever holds work in the data, matched by name. Add them under B2B → Team.
        </Notice>
      )}
      {!!data?.failed.length && (
        <Notice><span className="font-semibold">Partly loaded.</span> {data.failed.join(', ')} could not be read, so the numbers that need it read Unknown.</Notice>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="text-xs font-bold uppercase tracking-wider text-gray-700">B2B Target</div>
          <div className="text-[11px] text-gray-400" title="Inbound, Outreach and KAM revenue KPIs added together, Enq-fetched order values only. A lead credited to two teams counts for both.">
            Overall monthly revenue goal
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <div className="font-mono text-2xl font-bold text-black">
              {achieved === null ? (pending ? '…' : 'Unknown') : fmtL(achieved * 1_00_000)}{' '}
              <span className="text-sm font-normal text-gray-400">of {fmtL(targetRs)}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-200 overflow-hidden mt-3 max-w-md">
              <div className="h-full bg-[#0F766E] rounded-full transition-[width] duration-500" style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            <div className="text-[11px] text-gray-400 mt-2">{achieved === null ? 'Revenue could not be read' : `${pct}% achieved`}</div>
          </div>
          {manager && (
            <label className="block shrink-0">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Set Target (₹ Lacs)</span>
              <input type="number" min={0} defaultValue={targets.monthlyTargetL} key={targets.monthlyTargetL}
                onBlur={(e) => { const v = Number(e.target.value) || 0; if (v !== targets.monthlyTargetL) persist({ ...targets, monthlyTargetL: v }); }}
                className="w-28 px-2.5 py-1.5 text-[13px] font-mono border border-gray-200 rounded-md outline-none focus:border-[#0F766E]" />
            </label>
          )}
        </div>
      </div>

      {teams.length > 1 && (
        <div className="flex items-center gap-1 flex-wrap">
          {teams.map((t) => (
            <button key={t} onClick={() => setTeamKey(t)}
              className={`px-3 py-1.5 text-[12px] font-semibold rounded-md border ${teamKey === t ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
              {ENGINES[t].label}
            </button>
          ))}
        </div>
      )}

      {manager && teamKey === 'inbound' && kylas.capped && (
        <Notice>Coverage reads Kylas once per person, so only the first few linked inbound people get it. The rest read Unknown.</Notice>
      )}
      {!!offList.length && (
        <Notice>
          {offList.map((p) => p.name).join(', ')} {offList.length === 1 ? 'holds' : 'hold'} {engine.label} work but {offList.length === 1 ? 'is' : 'are'} not on
          {' '}the {engine.label} team list, so {offList.length === 1 ? 'has' : 'have'} no card here. Add them under B2B → Team.
        </Notice>
      )}
      {!manager && data && !selves.length && (
        <Notice>You are not on a B2B team, and no lead, call or firm carries your name yet. A manager can add you under B2B → Team.</Notice>
      )}

      {pending && !cards.length ? (
        <div className="text-sm text-gray-400 py-6">Loading {engine.label} targets…</div>
      ) : manager && !people.length ? (
        <Notice>Nobody is on the {engine.label} team yet. Add people under B2B → Team and their targets appear here.</Notice>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {manager && teamCard && people.length > 1 && (
            <PersonCard title={`Whole ${engine.label} team`} badge={<span className="text-[11px] text-gray-400">{people.length} people · sum of their targets</span>}
              defs={engine.defs} card={teamCard} targetOf={(d) => targetFor(d, teamKey, people, goals, period, today)}
              period={period} today={today} loading={loading} />
          )}
          {cards.map(({ person, card }) => (
            <PersonCard key={person.key} title={person.name}
              badge={!person.onTeam && live ? <span className="text-[10px] font-semibold text-amber-600">not on team</span> : undefined}
              defs={engine.defs} card={card} targetOf={(d) => targetFor(d, teamKey, [person], goals, period, today)}
              period={period} today={today} loading={loading}
              onSave={manager ? (d, v) => persist({ ...targets, goals: withGoal(goals, teamKey, person, d, v) }) : undefined} />
          ))}
        </div>
      )}

      {!!engine.notMeasured.length && (
        <p className="text-[11px] text-gray-400">
          <span className="font-semibold text-gray-500">In the KPI sheet but not scored yet:</span> {engine.notMeasured.join('; ')}.
        </p>
      )}
    </div>
  );
}
