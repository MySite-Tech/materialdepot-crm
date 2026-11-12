'use client';

import { istToday } from '../../models/outreach';
import { Period } from '../../models/outreach/kpis';
import { ENGINES, TEAM_ORDER, dailyCards, failedSources, revenueTargetL, scoreCard, selfOn } from '../../models/performance';
import { creditedOrders, revenueValue } from '../../models/performance/measures/revenue';
import { Person } from '../../models/performance/types';
import { addDays, memberPeople, paceFor, targetFor, weightedScore } from '../../models/performance/utils';
import { isWholeMonth } from '../../models/outreach/kpis';
import { OrderDrawer } from '../overview/sections/revenue/ui/order-drawer';
import { fmtL } from '../../models/mock-data';
import { ActivityPanel } from './sections/activity';
import { RevenueHero } from './sections/revenue';
import { Summary } from './sections/summary';
import type { RevenueOrder } from '@/lib/b2b/revenue';
import { B2B_TEAM_LABEL } from '@/lib/b2b/team/constants';
import { useInboundAssigned } from './hooks/use-inbound-assigned';
import { usePerformanceData } from './hooks/use-performance-data';
import { DailyTable } from './ui/daily';
import { PeriodPicker } from './ui/period';
import { RowsPanel, Scorecard } from './ui/scorecard';
import { TargetsEditor } from './ui/targets-editor';
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
  const [mode, setMode] = useState<'performance' | 'targets'>('performance');
  const setting = manager && mode === 'targets';

  const { data, pending, reload, targets, targetsOk, setTargets, revenueBusy, revenueError, creditsFailed, redirectsFailed } = usePerformanceData(teamKey, today, period);
  const [drawer, setDrawer] = useState<{ title: string; orders: RevenueOrder[] } | null>(null);
  const goals = useMemo(() => targets?.goals ?? {}, [targets]);

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
  const roster = useMemo(() => (manager && data && !team.loading
    ? TEAM_ORDER.map((t) => ({ team: t, people: [...ENGINES[t].people(data, team.members, live)].sort((a, b) => a.name.localeCompare(b.name)) }))
    : []), [manager, data, team.loading, team.members, live]);
  const focus = useMemo(() => (picked ? [picked] : people), [picked, people]);

  const kylas = useInboundAssigned(people, period, teamKey === 'inbound' && !!data);
  const full = useMemo(() => data && { ...data, assigned: kylas.assigned, members: live ? team.members : undefined }, [data, kylas.assigned, live, team.members]);
  const loading = (key: string) => pending
    || (teamKey === 'inbound' && key === 'coverage' && kylas.loading)
    || (teamKey !== 'outreach' && key === 'revenue' && revenueBusy);

  const card = useMemo(() => (engine && full && focus.length ? scoreCard(engine, full, focus, period) : null), [engine, full, focus, period]);
  const rows = useMemo(
    () => (manager && !picked && engine && full ? people.map((person) => ({ person, card: scoreCard(engine, full, [person], period) })) : []),
    [manager, picked, engine, full, people, period],
  );
  const daily = useMemo(() => (engine && full && focus.length ? dailyCards(engine, full, focus, period) : null), [engine, full, focus, period]);
  const sales = useMemo(() => (engine && full && focus.length ? revenueValue(creditedOrders(full, engine.team, focus, period)) : null), [engine, full, focus, period]);
  const activity = useMemo(() => (engine && full && card ? engine.activity(full, focus, period, card) : []), [engine, full, focus, period, card]);
  const score = useMemo(() => (engine && card ? weightedScore(engine.defs, card, engine.team, focus, goals, period, today) : null), [engine, card, focus, goals, period, today]);
  const revenueDef = engine?.defs.find((d) => d.key === 'revenue');
  const heroTarget = engine && revenueDef && engine.team !== 'outreach'
    ? { targetL: targetFor(revenueDef, engine.team, focus, goals, period, today), pace: paceFor(revenueDef, period, today) }
    : { targetL: null, pace: null };

  useEffect(() => setLens(null), [teamKey, pickedKey]);

  const failed = engine && data ? failedSources(engine, data) : [];
  const teams = manager ? TEAM_ORDER : selves.map((s) => s.team);
  const lensDef = engine?.defs.find((d) => d.key === lens);
  const who = picked ? picked.name : engine ? `Whole ${engine.label} team` : '';

  const listed = useMemo(
    () => (engine ? (live ? memberPeople(team.members, engine.team) : people.filter((p) => p.onTeam)) : []),
    [engine, live, team.members, people],
  );
  const totals = useMemo(() => (targets ? TEAM_ORDER.map((t) => {
    const heads = live ? memberPeople(team.members, t) : t === teamKey ? listed : [];
    return { team: t, label: ENGINES[t].label, heads: heads.length, revenueL: revenueTargetL(t, heads, targets) };
  }) : []), [targets, live, team.members, teamKey, listed]);

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-gray-800">{manager ? 'Leadership Board' : 'My performance'}</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {setting
              ? 'Monthly targets per person. Every number on the Performance view is measured against these'
              : <>{manager ? 'Effort and output for every person on Inbound, Outreach and KAM' : 'Your own effort and output, worked out from what you log'}{' · '}{fmtPeriod(period)}</>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {manager && (
            <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5">
              {(['performance', 'targets'] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`px-3 py-1 text-[12px] font-semibold rounded ${mode === m ? 'bg-[#1A1A1A] text-white' : 'text-gray-500 hover:text-gray-900'}`}>
                  {m === 'performance' ? 'Performance' : 'Set targets'}
                </button>
              ))}
            </div>
          )}
          {!setting && <PeriodPicker value={preset} onChange={setPreset} custom={custom} setCustom={setCustom} today={today} />}
        </div>
      </div>

      {(teams.length > 1 || (manager && !setting)) && (
        <div className="flex items-center gap-2 flex-wrap">
          {teams.length > 1 && (
            <div className="flex items-center gap-1 flex-wrap">
              {teams.map((t) => (
                <button key={t} onClick={() => { setTeamKey(t); setPickedKey(null); }}
                  className={`px-3 py-1.5 text-[12px] font-semibold rounded-md border cursor-pointer ${teamKey === t ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                  {ENGINES[t].label}
                </button>
              ))}
            </div>
          )}
          {manager && !setting && (
            <select aria-label="Person" value={picked && teamKey ? `${teamKey}|${picked.key}` : ''}
              onChange={(e) => {
                const [t, ...key] = e.target.value.split('|');
                if (!e.target.value) { setPickedKey(null); return; }
                setTeamKey(t as B2BTeam);
                setPickedKey(key.join('|'));
              }}
              className="px-3 py-1.5 text-[12px] font-semibold rounded-md border border-gray-200 bg-white text-gray-700 cursor-pointer outline-none focus:border-[#0F766E] max-w-[260px]">
              <option value="">Everyone on {engine?.label ?? 'the team'}</option>
              {roster.map(({ team: t, people: list }) => (
                <optgroup key={t} label={ENGINES[t].label}>
                  {list.map((p) => <option key={`${t}|${p.key}`} value={`${t}|${p.key}`}>{p.name}{p.onTeam ? '' : ' (not on team)'}</option>)}
                </optgroup>
              ))}
            </select>
          )}
        </div>
      )}

      {manager && !team.loading && !live && (
        <Notice>
          {team.tableMissing ? 'The B2B team list is not set up yet' : `The B2B team list did not load (${team.error})`}, so the people below are
          {' '}whoever holds work in the data, matched by name. Add them under B2B → Team to match them by phone and Kylas user.
        </Notice>
      )}
      {!setting && !!failed.length && (
        <Notice action={<button onClick={reload} className="shrink-0 font-semibold underline">Retry</button>}>
          <span className="font-semibold">Partly loaded.</span> {failed.join(', ')} could not be read, so every number that needs it reads Unknown.
        </Notice>
      )}
      {!targetsOk && (
        <Notice>Saved targets could not be read, so every target below is the KPI sheet default, not what was set on the Targets tab.</Notice>
      )}
      {!manager && data && !team.loading && !selves.length && (
        <Notice>
          You are not on a B2B team, and no lead, call or firm in the CRM carries your name yet. A manager can add you under B2B → Team.
        </Notice>
      )}

      {setting ? (
        !targets || team.loading || !engine ? <div className="text-sm text-gray-400 py-6">Loading targets…</div> : (
          <TargetsEditor engine={engine} people={listed} store={targets} totals={totals} onSaved={setTargets} />
        )
      ) : (pending && !card) || team.loading ? (
        <div className="text-sm text-gray-400 py-6">Loading performance…</div>
      ) : engine && card && (
        <>
          {manager && picked && (
            <div className="flex items-center gap-2 text-[13px]">
              <button onClick={() => setPickedKey(null)} className="font-semibold text-gray-500 hover:text-gray-900 cursor-pointer">← Whole {engine.label} team</button>
              <span className="text-gray-300">/</span>
              <span className="font-bold text-gray-900">{picked.name}</span>
            </div>
          )}

          <Summary name={who} team={B2B_TEAM_LABEL[engine.team]} period={fmtPeriod(period)} score={score} wholeMonth={isWholeMonth(period)} manager={manager} />

          {sales && (
            <RevenueHero
              title={picked || !manager ? 'Revenue credited to you' : `Revenue credited to the ${engine.label} team`}
              sub="Every order placed in the period and credited to this person"
              value={sales}
              target={heroTarget}
              loading={pending || revenueBusy}
              error={revenueError}
              note={<>
                {engine.team === 'outreach' && card?.revenue && !pending && (
                  <>The <strong>New revenue</strong> KPI below counts only first orders of new conversions: {card.revenue.value === null ? 'Unknown' : fmtL((card.revenue.value ?? 0) * 1_00_000)}.{' '}</>
                )}
                An order counts here when they were the B2B rep on the cart, held the client&apos;s number, or a manager credited the enquiry to them. Open any order to see why
                {manager ? ', and to credit it to someone else.' : '.'}
                {creditsFailed && <span className="text-amber-700"> Manager credits could not be read, so this follows the rule only.</span>}
              </>}
              onOpen={(title, orders) => setDrawer({ title: picked || !manager ? `${title} · ${who}` : title, orders })}
            />
          )}

          <Scorecard defs={engine.defs} card={card} team={engine.team} people={focus} goals={goals} period={period} today={today}
            loading={loading} active={lens} onPick={(k) => setLens(lens === k ? null : k)} hide={engine.team === 'outreach' ? [] : ['revenue']} />

          {lensDef && <RowsPanel def={lensDef} k={card[lensDef.key]} who={who} onClose={() => setLens(null)} />}

          {manager && !picked && (
            <>
              <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mt-2">Compare people · click a row to open their card</div>
              <TeamTable defs={engine.defs} team={engine.team} goals={goals} rows={rows} total={card} people={people} period={period} today={today} teamLive={live} loading={loading} onPick={(p) => setPickedKey(p.key)} />
            </>
          )}

          <ActivityPanel items={activity} who={who}
            notes={[
              'Calls and meetings follow the same rules as their KPIs above, so the counts match. Notes, EC redirects and lead updates are listed by whoever logged them.',
              redirectsFailed ? 'EC redirects could not be read, so none are listed.' : '',
            ].filter(Boolean)} />

          {daily && <DailyTable defs={engine.defs} days={daily.rows} clipped={daily.clipped} range={card} team={engine.team} people={focus} goals={goals} period={period} today={today} />}

          {!!engine.notMeasured.length && (
            <p className="text-[11px] text-gray-400">
              <span className="font-semibold text-gray-500">Not scored yet:</span> {engine.notMeasured.join('; ')}.
            </p>
          )}
        </>
      )}
      {drawer && <OrderDrawer title={drawer.title} orders={drawer.orders} onClose={() => setDrawer(null)} />}
    </div>
  );
}
