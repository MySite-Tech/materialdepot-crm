'use client';

import { useMemo } from 'react';
import { Empty, SectionCard } from '../../../b2b/ui/inbound-chips';
import { LensTileGroup, LensTiles } from '../../../b2b/ui/lens-tiles';
import { CALL_OUTCOMES, COHORT_BY_KEY, PLAN_DIALS_A_DAY } from '@/lib/bda-retail/constants';
import type { LeadView } from '@/lib/bda-retail/types';
import { istDate } from '@/lib/bda-retail/utils';
import { LeadTable } from '../../ui/lead-table';
import { CohortSection, DaySection, OutcomeSection } from './sections';
import { BdaRow, num, pct, teamStats } from './utils';

const RECENT_CALLS = 40;

export function BdaDetail({ bda, views, from, to, today, onOpen, onBack }: {
  bda: BdaRow;
  views: LeadView[];
  from: string;
  to: string;
  today: string;
  onOpen: (l: LeadView) => void;
  onBack: () => void;
}) {
  const held = useMemo(() => views.filter((l) => l.claim?.byPhone === bda.phone), [views, bda.phone]);
  const theirs = useMemo(() => held.map((l) => ({ ...l, calls: l.calls.filter((c) => c.byPhone === bda.phone) })), [held, bda.phone]);
  const stats = useMemo(() => teamStats(theirs, from, to, today), [theirs, from, to, today]);
  const t = stats.total;

  const followUps = useMemo(
    () => held.filter((l) => l.stage === 'follow_up' && l.nextOn <= today).sort((a, b) => a.nextOn.localeCompare(b.nextOn)),
    [held, today],
  );
  const recent = useMemo(() => theirs
    .flatMap((l) => l.calls.filter((c) => istDate(c.at) >= from && istDate(c.at) <= to).map((c) => ({ c, l })))
    .sort((a, b) => b.c.at.localeCompare(a.c.at))
    .slice(0, RECENT_CALLS), [theirs, from, to]);

  const groups: LensTileGroup<string>[] = [{
    title: bda.name,
    tiles: [
      { key: 'dials', title: 'Dials', rule: 'Calls logged in the period', accent: '#0F766E', value: num(t.dials), sub: `${num(t.dialsPerDay)} a calling day · plan ${PLAN_DIALS_A_DAY}`, warn: t.dialsPerDay !== null && t.dialsPerDay < PLAN_DIALS_A_DAY },
      { key: 'customers', title: 'Customers called', rule: 'Different customers called', accent: '#2563EB', value: num(t.customers), sub: `${num(t.firstAttempts)} first attempts · ${num(t.followUpCalls)} follow-ups` },
      { key: 'connected', title: 'Connected', rule: 'Customers reached at least once', accent: '#7C3AED', value: num(t.connected), sub: `${pct(t.connectivity)} connectivity` },
      { key: 'ordered', title: "Said they'll order", rule: 'Closed as Ordered / will order with us', accent: '#16A34A', value: num(t.ordered), sub: `${pct(t.conversion, 1)} of connected` },
      { key: 'held', title: 'Leads held', rule: 'Open leads this BDA has claimed', accent: '#6B7280', value: num(bda.held), sub: `${bda.overdue} follow-ups overdue`, warn: bda.overdue > 0 },
    ],
  }];

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-[12px] text-gray-500 hover:text-gray-900">← Every BDA</button>
      <LensTiles groups={groups} active={null} onPick={() => undefined} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <DaySection rows={stats.byDay} title="Day by day" withBdas={false} />
        <OutcomeSection t={t} />
      </div>
      <CohortSection rows={stats.cohorts} withBank={false} />

      <div className="space-y-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-600">Follow-ups due or overdue ({followUps.length})</h3>
        <LeadTable leads={followUps} onOpen={onOpen} empty="Nothing due." resetKey={bda.phone} />
      </div>

      <SectionCard title="Recent calls" subtitle={`Latest ${RECENT_CALLS} in the period, with notes, for call audits`}>
        {recent.length === 0 ? <Empty>No calls logged in this period.</Empty> : (
          <ol className="divide-y divide-gray-50">
            {recent.map(({ c, l }) => (
              <li key={c.id} className="py-2 text-[12px] grid grid-cols-[130px_1fr] gap-3 cursor-pointer hover:bg-gray-50" onClick={() => onOpen(l)}>
                <span className="text-gray-400 tabular-nums">{new Date(c.at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</span>
                <span className="min-w-0">
                  <span className="font-semibold text-gray-800">{CALL_OUTCOMES.find((o) => o.key === c.outcome)?.label}</span>
                  <span className="text-gray-500"> · {l.name || l.phone} · {COHORT_BY_KEY[l.cohort].label}{c.followUpOn ? ` · follow up ${c.followUpOn}` : ''}</span>
                  {c.note && <span className="block text-gray-700 whitespace-pre-wrap">{c.note}</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>
    </div>
  );
}
