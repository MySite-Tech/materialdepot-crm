'use client';

import { useMemo, useState } from 'react';
import { SectionCard } from '../../../b2b/ui/inbound-chips';
import { LensPills, LensTileGroup, LensTiles } from '../../../b2b/ui/lens-tiles';
import { PLAN_CONNECTIVITY, PLAN_CONVERSION, PLAN_DIALS_A_DAY } from '@/lib/bda-retail/constants';
import type { AccessRow, LeadView } from '@/lib/bda-retail/types';
import { PageHead } from '../../ui/chips';
import { BdaDetail } from './bda-detail';
import { CohortSection, DaySection, HourSection, OutcomeSection, Table, below, td } from './sections';
import { Period, num, pct, periodRange, teamStats } from './utils';

const PERIODS: Array<{ key: Period; title: string }> = [
  { key: 'today', title: 'Today' },
  { key: 'yesterday', title: 'Yesterday' },
  { key: 'week', title: 'Last 7 days' },
  { key: 'month', title: 'This month' },
  { key: 'lastMonth', title: 'Last month' },
];

const since = (iso: string, now: number): string => {
  if (!iso) return '—';
  const mins = Math.round((now - Date.parse(iso)) / 60_000);
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} d ago`;
};

export function TeamView({ views, today, access, onOpen }: { views: LeadView[]; today: string; access: AccessRow[]; onOpen: (l: LeadView) => void }) {
  const [period, setPeriod] = useState<Period>('today');
  const [picked, setPicked] = useState<string | null>(null);
  const { from, to } = periodRange(period, today);
  const stats = useMemo(() => teamStats(views, from, to, today), [views, from, to, today]);
  const t = stats.total;
  const bda = picked ? stats.bdas.find((b) => b.phone === picked) ?? null : null;
  const now = Date.now();

  const calling = stats.bdas.filter((b) => b.dials > 0).length;
  const perBdaDay = t.days && calling ? t.dials / stats.byDay.reduce((n, d) => n + d.bdas, 0) : null;
  const overdue = stats.bdas.reduce((n, b) => n + b.overdue, 0);

  const groups: LensTileGroup<string>[] = [{
    title: 'The team',
    tiles: [
      { key: 'dials', title: 'Dials', rule: 'Every call logged in the period', accent: '#0F766E', value: num(t.dials), sub: `${num(perBdaDay)} a BDA a calling day · plan ${PLAN_DIALS_A_DAY}`, warn: perBdaDay !== null && perBdaDay < PLAN_DIALS_A_DAY },
      { key: 'bdas', title: 'BDAs calling', rule: 'People who logged a call in the period', accent: '#6B7280', value: num(calling), sub: `${stats.bdas.length} have worked a lead` },
      { key: 'customers', title: 'Customers called', rule: 'Different customers called', accent: '#2563EB', value: num(t.customers), sub: `${num(t.firstAttempts)} first attempts · ${num(t.followUpCalls)} follow-ups` },
      { key: 'connected', title: 'Connected', rule: 'Customers reached at least once', accent: '#7C3AED', value: num(t.connected), sub: `${pct(t.connectivity)} · plan ${pct(PLAN_CONNECTIVITY.P1)} on P1`, warn: t.connectivity !== null && t.connectivity < PLAN_CONNECTIVITY.P1 },
      { key: 'ordered', title: "Said they'll order", rule: 'Calls closed as Ordered / will order with us', accent: '#16A34A', value: num(t.ordered), sub: `${pct(t.conversion, 1)} of connected · plan ${pct(PLAN_CONVERSION, 1)}` },
      { key: 'overdue', title: 'Follow-ups overdue', rule: 'Follow-up dates already past, across the team', accent: '#D97706', value: num(overdue), warn: overdue > 0 },
    ],
  }];

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHead title="Team performance" sub={`${from === to ? from : `${from} to ${to}`} · from the calls BDAs logged`}>
        <LensPills pills={PERIODS.map((p) => ({ ...p, rule: Object.values(periodRange(p.key, today)).join(' to ') }))} active={period} onPick={setPeriod} />
      </PageHead>

      {bda ? (
        <BdaDetail bda={bda} views={views} from={from} to={to} today={today} onOpen={onOpen} onBack={() => setPicked(null)} />
      ) : (
        <>
          <LensTiles groups={groups} active={null} onPick={() => undefined} />

          <SectionCard title="By BDA" subtitle="Open one for their day-by-day, cohorts, follow-ups and call notes">
            <Table
              head={['BDA', 'Dials', 'A calling day', 'First attempts', 'Follow-up calls', 'Customers', 'Connected', 'Connectivity', 'Interested', 'Visit booked', "Said they'll order", 'Not interested', 'Leads held', 'Overdue', 'Last call']}
              empty={stats.bdas.length ? undefined : 'No BDA has worked a lead yet.'}
            >
              {stats.bdas.map((b) => (
                <tr key={b.phone} onClick={() => setPicked(b.phone)} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                  <td className="px-3 py-2 font-semibold text-gray-900 whitespace-nowrap">{b.name}</td>
                  <td className={td}>{num(b.dials)}</td>
                  <td className={`${td} ${below(b.dialsPerDay, PLAN_DIALS_A_DAY)}`}>{num(b.dialsPerDay)}</td>
                  <td className={td}>{num(b.firstAttempts)}</td>
                  <td className={td}>{num(b.followUpCalls)}</td>
                  <td className={td}>{num(b.customers)}</td>
                  <td className={td}>{num(b.connected)}</td>
                  <td className={`${td} ${below(b.connectivity, PLAN_CONNECTIVITY.P1)}`}>{pct(b.connectivity)}</td>
                  <td className={td}>{num(b.outcomes.follow_up + b.outcomes.call_back)}</td>
                  <td className={td}>{num(b.outcomes.visit_booked)}</td>
                  <td className={td}>{num(b.ordered)}</td>
                  <td className={td}>{num(b.outcomes.not_interested + b.outcomes.bought_elsewhere)}</td>
                  <td className={td}>{num(b.held)}</td>
                  <td className={`${td} ${b.overdue ? 'text-amber-600 font-semibold' : ''}`}>{num(b.overdue)}</td>
                  <td className={`${td} text-gray-500`}>{since(b.lastCallAt, now)}</td>
                </tr>
              ))}
            </Table>
          </SectionCard>

          <CohortSection rows={stats.cohorts} />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <OutcomeSection t={t} />
            <HourSection hours={stats.byHour} />
          </div>

          <DaySection rows={stats.byDay} />

          <p className="text-[10px] text-gray-400 leading-snug">
            &quot;Said they&apos;ll order&quot; is the BDA&apos;s call outcome. It is not yet matched to placed orders, so it is not revenue.
            Plans are the B Plan sheet&apos;s: about {PLAN_DIALS_A_DAY} dials a BDA a day, connectivity {pct(PLAN_CONNECTIVITY.P1)} / {pct(PLAN_CONNECTIVITY.P2)} / {pct(PLAN_CONNECTIVITY.P3)} for P1 / P2 / P3, and {pct(PLAN_CONVERSION, 1)} of connected customers converting.
          </p>

          <SectionCard title="Who can open BDA Retail as an admin" subtitle="BDAs get in through the BDA Retail role">
            <ul className="divide-y divide-gray-50">
              {access.map((a) => (
                <li key={a.name} className="flex items-center justify-between py-1.5 text-[12.5px]">
                  <span className="font-medium text-gray-800">{a.name}</span>
                  <span className={`text-[11.5px] ${a.logins === 1 ? 'text-teal-700' : 'text-amber-600 font-semibold'}`}>
                    {a.logins === 1 ? 'Matched to one login' : a.logins === 0 ? 'No login has this exact name' : `${a.logins} logins share this name, so none get in`}
                  </span>
                </li>
              ))}
            </ul>
          </SectionCard>
        </>
      )}
    </div>
  );
}
