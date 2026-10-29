'use client';

import { istToday } from '../../models/outreach';
import { Period } from '../../models/outreach/kpis';
import { ENGINES, TEAM_ORDER, dailyCards, failedSources, scoreCard, selfOn } from '../../models/performance';
import { Person } from '../../models/performance/types';
import { addDays } from '../../models/performance/utils';
import { KYLAS_COUNT_CAP } from './constants';
import { useInboundAssigned } from './hooks/use-inbound-assigned';
import { usePerformanceData } from './hooks/use-performance-data';
import { DailyTable } from './ui/daily';
import { PeriodPicker } from './ui/period';
import { RowsPanel, Scorecard } from './ui/scorecard';
import { TeamTable } from './ui/team-table';
import { fmtPeriod, periodFor } from './utils';
import type { B2BTeam, B2BTeamLoad, Viewer } from '@/lib/b2b/team/types';
import { ReactNode, useEffect, useMemo, useState } from 'react';

function Notice({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12px] text-amber-900 flex items-start justify-between gap-3">
      <div>{children}</div>
      {action}
    </div>
  );
}

export default function Leadership({ team, viewer }: { team: B2BTeamLoad; viewer: Viewer }) {
  const today = istToday();
  const manager = viewer.isManager;
  const live = !team.tableMissing && !team.error;

  const [preset, setPreset] = useState('month');
  const [custom, setCustom] = useState<Period>({ from: addDays(today, -6), to: today });
  const period = useMemo(() => periodFor(preset, today, custom), [preset, today, custom]);

  const [teamKey, setTeamKey] = useState<B2BTeam | null>(manager ? viewer.member?.team ?? 'inbound' : viewer.member?.team ?? null);
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const [lens, setLens] = useState<string | null>(null);

  const { data, pending, reload } = usePerformanceData(teamKey, today);

  const selves = useMemo(
    () => (!manager && data && !team.loading ? selfOn(data, viewer, team.members, live) : []),
    [manager, data, viewer, team.members, team.loading, live],
  );
  useEffect(() => {
    if (!manager && selves.length && !selves.some((s) => s.team === teamKey)) setTeamKey(selves[0].team);
  }, [manager, selves, teamKey]);

  const engine = teamKey ? ENGINES[teamKey] : null;
  const people = useMemo<Person[]>(() => {
    if (!engine || !data || team.loading) return [];
    if (!manager) return selves.filter((s) => s.team === engine.team).map((s) => s.person);
    return engine.people(data, team.members, live);
  }, [engine, data, manager, selves, team.members, team.loading, live]);

  const picked = manager ? people.find((p) => p.key === pickedKey) ?? null : people[0] ?? null;
  const focus = useMemo(() => (picked ? [picked] : people), [picked, people]);

  const kylas = useInboundAssigned(people, period, teamKey === 'inbound' && !!data);
  const full = useMemo(() => data && { ...data, assigned: kylas.assigned }, [data, kylas.assigned]);
  const loading = (key: string) => pending || (teamKey === 'inbound' && key === 'coverage' && kylas.loading);

  const card = useMemo(() => (engine && full && focus.length ? scoreCard(engine, full, focus, period) : null), [engine, full, focus, period]);
  const rows = useMemo(
    () => (manager && !picked && engine && full ? people.map((person) => ({ person, card: scoreCard(engine, full, [person], period) })) : []),
    [manager, picked, engine, full, people, period],
  );
  const daily = useMemo(() => (engine && full && focus.length ? dailyCards(engine, full, focus, period) : null), [engine, full, focus, period]);

  useEffect(() => setLens(null), [teamKey, pickedKey]);

  const failed = engine && data ? failedSources(engine, data) : [];
  const teams = manager ? TEAM_ORDER : selves.map((s) => s.team);
  const lensDef = engine?.defs.find((d) => d.key === lens);
  const who = picked ? picked.name : engine ? `Whole ${engine.label} team` : '';

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-gray-800">{manager ? 'Leadership Board' : 'My performance'}</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {manager ? 'Effort and output for every person on Inbound, Outreach and KAM' : 'Your own effort and output, worked out from what you log'}
            {' · '}{fmtPeriod(period)}
          </p>
        </div>
        <PeriodPicker value={preset} onChange={setPreset} custom={custom} setCustom={setCustom} today={today} />
      </div>

      {teams.length > 1 && (
        <div className="flex items-center gap-1 flex-wrap">
          {teams.map((t) => (
            <button key={t} onClick={() => { setTeamKey(t); setPickedKey(null); }}
              className={`px-3 py-1.5 text-[12px] font-semibold rounded-md border ${teamKey === t ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
              {ENGINES[t].label}
            </button>
          ))}
        </div>
      )}

      {manager && !team.loading && !live && (
        <Notice>
          {team.tableMissing ? 'The B2B team list is not set up yet' : `The B2B team list did not load (${team.error})`}, so the people below are
          {' '}whoever holds work in the data, matched by name. Add them under B2B → Team to match them by phone and Kylas user.
        </Notice>
      )}
      {!!failed.length && (
        <Notice action={<button onClick={reload} className="shrink-0 font-semibold underline">Retry</button>}>
          <span className="font-semibold">Partly loaded.</span> {failed.join(', ')} could not be read, so every number that needs it reads Unknown.
        </Notice>
      )}
      {teamKey === 'inbound' && kylas.capped && (
        <Notice>Coverage reads Kylas once per person, so only the first {KYLAS_COUNT_CAP} linked inbound people get it. The rest read Unknown.</Notice>
      )}
      {!manager && data && !team.loading && !selves.length && (
        <Notice>
          You are not on a B2B team, and no lead, call or firm in the CRM carries your name yet. A manager can add you under B2B → Team.
        </Notice>
      )}

      {(pending && !card) || team.loading ? (
        <div className="text-sm text-gray-400 py-6">Loading performance…</div>
      ) : engine && card && (
        <>
          {manager && picked && (
            <div className="flex items-center gap-2 text-[13px]">
              <button onClick={() => setPickedKey(null)} className="font-semibold text-gray-500 hover:text-gray-900">← Whole {engine.label} team</button>
              <span className="text-gray-300">/</span>
              <span className="font-bold text-gray-900">{picked.name}</span>
            </div>
          )}

          <Scorecard defs={engine.defs} card={card} heads={focus.length} period={period} today={today}
            loading={loading} active={lens} onPick={(k) => setLens(lens === k ? null : k)} />

          {lensDef && <RowsPanel def={lensDef} k={card[lensDef.key]} who={who} onClose={() => setLens(null)} />}

          {manager && !picked && (
            <>
              <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mt-2">Compare people · click a row to open their card</div>
              <TeamTable defs={engine.defs} rows={rows} total={card} period={period} today={today} teamLive={live} loading={loading} onPick={(p) => setPickedKey(p.key)} />
            </>
          )}

          {daily && <DailyTable defs={engine.defs} days={daily.rows} clipped={daily.clipped} range={card} heads={focus.length} period={period} today={today} />}

          {!!engine.notMeasured.length && (
            <p className="text-[11px] text-gray-400">
              <span className="font-semibold text-gray-500">Not scored yet:</span> {engine.notMeasured.join('; ')}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
