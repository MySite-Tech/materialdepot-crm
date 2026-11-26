'use client';

import { useMemo, useState } from 'react';
import { Empty, SectionCard } from '../../b2b/ui/inbound-chips';
import { LensPills } from '../../b2b/ui/lens-tiles';
import type { AccessRow, LeadView } from '@/lib/bda-retail/types';
import { shiftDays, statsByBda } from '@/lib/bda-retail/utils';
import { PageHead } from '../ui/chips';

type Period = 'today' | 'week' | 'month';

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

const th = 'px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap';

export function TeamView({ views, today, access }: { views: LeadView[]; today: string; access: AccessRow[] }) {
  const [period, setPeriod] = useState<Period>('today');
  const from = period === 'today' ? today : period === 'week' ? shiftDays(today, -6) : `${today.slice(0, 8)}01`;
  const rows = useMemo(() => statsByBda(views, from, today), [views, from, today]);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHead title="Team" sub="Calling effort per BDA, from the calls logged here">
        <LensPills
          pills={[
            { key: 'today', title: 'Today', rule: today },
            { key: 'week', title: 'Last 7 days', rule: `${from} to ${today}` },
            { key: 'month', title: 'This month', rule: `${today.slice(0, 8)}01 to ${today}` },
          ]}
          active={period}
          onPick={setPeriod}
        />
      </PageHead>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60 text-left">
                <th className={th}>BDA</th>
                <th className={`${th} text-right`}>Dials</th>
                <th className={`${th} text-right`}>First attempts</th>
                <th className={`${th} text-right`}>Follow-up calls</th>
                <th className={`${th} text-right`}>Customers called</th>
                <th className={`${th} text-right`}>Connected</th>
                <th className={`${th} text-right`}>Connectivity</th>
                <th className={`${th} text-right`}>Said they&apos;ll order</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.phone} className="border-b border-gray-50 last:border-0">
                  <td className="px-3 py-2 font-semibold text-gray-900">{r.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.dials}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.firstAttempts}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.followUpCalls}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.leadsCalled}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.connectedLeads}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(r.connectivity)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.ordered}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <Empty>No calls logged in this period.</Empty>}
      </div>
      <p className="text-[10px] text-gray-400 leading-snug">
        &quot;Said they&apos;ll order&quot; is the BDA&apos;s call outcome. It is not yet matched to placed orders, so it is not a conversion count.
      </p>

      <SectionCard title="Who can open BDA Retail" subtitle="Everyone else gets access later">
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
    </div>
  );
}
