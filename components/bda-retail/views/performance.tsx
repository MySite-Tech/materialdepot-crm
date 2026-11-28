'use client';

import { useMemo, useState } from 'react';
import { Empty } from '../../b2b/ui/inbound-chips';
import { LensPills, LensTileGroup, LensTiles } from '../../b2b/ui/lens-tiles';
import { PLAN_DIALS_A_DAY } from '@/lib/bda-retail/constants';
import type { LeadView } from '@/lib/bda-retail/types';
import { isConnected, istDate, shiftDays, statsByBda } from '@/lib/bda-retail/utils';
import { normalisePhone } from '@/lib/org/utils';
import { PageHead } from '../ui/chips';

type Period = 'today' | 'week' | 'month';

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

const th = 'px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap text-right first:text-left';

export function PerformanceView({ views, phone, name, today }: { views: LeadView[]; phone: string; name: string; today: string }) {
  const [period, setPeriod] = useState<Period>('today');
  const from = period === 'today' ? today : period === 'week' ? shiftDays(today, -6) : `${today.slice(0, 8)}01`;
  const me = normalisePhone(phone);

  const mine = useMemo(() => statsByBda(views, from, today).find((r) => r.phone === me), [views, from, today, me]);
  const due = useMemo(() => views.filter((l) => l.claim?.byPhone === me && l.stage === 'follow_up' && l.nextOn <= today).length, [views, me, today]);

  const days = useMemo(() => {
    const by = new Map<string, { dials: number; first: number; connected: Set<string>; ordered: number }>();
    for (const l of views) l.calls.forEach((c, i) => {
      const day = istDate(c.at);
      if (c.byPhone !== me || day < from || day > today) return;
      const row = by.get(day) ?? { dials: 0, first: 0, connected: new Set<string>(), ordered: 0 };
      row.dials += 1;
      if (i === 0) row.first += 1;
      if (isConnected(c)) row.connected.add(l.key);
      if (c.outcome === 'ordered') row.ordered += 1;
      by.set(day, row);
    });
    return [...by.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [views, me, from, today]);

  const dayCount = days.length || 1;
  const groups: LensTileGroup<string>[] = [{
    title: 'Your calling',
    tiles: [
      { key: 'dials', title: 'Dials', rule: 'Every call you logged', accent: '#0F766E', value: String(mine?.dials ?? 0), sub: `${Math.round((mine?.dials ?? 0) / dayCount)} a calling day · plan about ${PLAN_DIALS_A_DAY}` },
      { key: 'called', title: 'Customers called', rule: 'Different customers you called', accent: '#2563EB', value: String(mine?.leadsCalled ?? 0), sub: `${mine?.firstAttempts ?? 0} first attempts · ${mine?.followUpCalls ?? 0} follow-up calls` },
      { key: 'connected', title: 'Connected', rule: 'Customers you reached at least once', accent: '#7C3AED', value: String(mine?.connectedLeads ?? 0), sub: `${pct(mine?.connectivity ?? null)} connectivity` },
      { key: 'ordered', title: "Said they'll order", rule: 'Calls you closed as Ordered / will order with us', accent: '#16A34A', value: String(mine?.ordered ?? 0), sub: 'Your call outcome, not a matched order' },
      { key: 'due', title: 'Follow-ups due', rule: 'Your follow-ups dated today or earlier', accent: '#D97706', value: String(due), warn: due > 0 },
    ],
  }];

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHead title="My performance" sub={`${name} · from the calls you logged in BDA Retail`}>
        <LensPills
          pills={[
            { key: 'today', title: 'Today', rule: today },
            { key: 'week', title: 'Last 7 days', rule: `${shiftDays(today, -6)} to ${today}` },
            { key: 'month', title: 'This month', rule: `${today.slice(0, 8)}01 to ${today}` },
          ]}
          active={period}
          onPick={setPeriod}
        />
      </PageHead>

      <LensTiles groups={groups} active={null} onPick={() => undefined} />

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                {['Day', 'Dials', 'First attempts', 'Connected', "Said they'll order"].map((h) => <th key={h} className={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {days.map(([day, r]) => (
                <tr key={day} className="border-b border-gray-50 last:border-0">
                  <td className="px-3 py-2 font-semibold text-gray-900">{day}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${r.dials < PLAN_DIALS_A_DAY ? 'text-amber-600' : 'text-gray-900'}`}>{r.dials}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.first}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.connected.size}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.ordered}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {days.length === 0 && <Empty>No calls logged in this period.</Empty>}
      </div>
    </div>
  );
}
