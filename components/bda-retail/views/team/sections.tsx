'use client';

import { Empty, SectionCard } from '../../../b2b/ui/inbound-chips';
import { CALL_OUTCOMES, PLAN_CONVERSION, PLAN_DIALS_A_DAY } from '@/lib/bda-retail/constants';
import type { CallOutcome } from '@/lib/bda-retail/types';
import { PriorityChip } from '../../ui/chips';
import { CohortRow, Tally, TeamStats, num, pct } from './utils';

export const th = 'px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap text-right first:text-left';
export const td = 'px-3 py-2 text-right tabular-nums whitespace-nowrap';

export const below = (v: number | null, plan: number) => (v !== null && v < plan ? 'text-amber-600 font-semibold' : '');

export function Table({ head, children, empty }: { head: string[]; children: React.ReactNode; empty?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/60">{head.map((h) => <th key={h} className={th}>{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty && <Empty>{empty}</Empty>}
    </div>
  );
}

export function CohortSection({ rows, withBank = true }: { rows: CohortRow[]; withBank?: boolean }) {
  return (
    <SectionCard title="By cohort" subtitle={withBank ? 'Calls in the period; bank counts are as of now' : 'Calls in the period'}>
      <Table head={['Cohort', ...(withBank ? ['In bank', 'Not called'] : []), 'Dials', 'Customers called', 'Connected', 'Connectivity', 'Plan', "Said they'll order", 'Conversion']}>
        {rows.map((r) => (
          <tr key={r.key} className="border-b border-gray-50 last:border-0">
            <td className="px-3 py-2 whitespace-nowrap"><PriorityChip p={r.priority} /> <span className="ml-1 text-gray-800">{r.label}</span></td>
            {withBank && <td className={td}>{num(r.inBank)}</td>}
            {withBank && <td className={td}>{num(r.notCalled)}</td>}
            <td className={td}>{num(r.dials)}</td>
            <td className={td}>{num(r.customers)}</td>
            <td className={td}>{num(r.connected)}</td>
            <td className={`${td} ${below(r.connectivity, r.planConnectivity)}`}>{pct(r.connectivity)}</td>
            <td className={`${td} text-gray-400`}>{pct(r.planConnectivity)}</td>
            <td className={td}>{num(r.ordered)}</td>
            <td className={`${td} ${below(r.conversion, PLAN_CONVERSION)}`}>{pct(r.conversion, 1)}</td>
          </tr>
        ))}
      </Table>
    </SectionCard>
  );
}

export function DaySection({ rows, title = 'By day', withBdas = true }: { rows: Array<{ day: string; bdas: number } & Tally>; title?: string; withBdas?: boolean }) {
  return (
    <SectionCard title={title} subtitle={`Plan: about ${PLAN_DIALS_A_DAY} dials a BDA a day`}>
      <Table
        head={['Day', ...(withBdas ? ['BDAs calling', 'Dials a BDA'] : []), 'Dials', 'First attempts', 'Follow-up calls', 'Connected', 'Connectivity', "Said they'll order"]}
        empty={rows.length ? undefined : 'No calls logged in this period.'}
      >
        {rows.map((r) => {
          const perBda = r.bdas ? r.dials / r.bdas : null;
          return (
            <tr key={r.day} className="border-b border-gray-50 last:border-0">
              <td className="px-3 py-2 font-semibold text-gray-900 whitespace-nowrap">{r.day}</td>
              {withBdas && <td className={td}>{r.bdas}</td>}
              {withBdas && <td className={`${td} ${below(perBda, PLAN_DIALS_A_DAY)}`}>{num(perBda)}</td>}
              <td className={`${td} ${withBdas ? '' : below(r.dials, PLAN_DIALS_A_DAY)}`}>{num(r.dials)}</td>
              <td className={td}>{num(r.firstAttempts)}</td>
              <td className={td}>{num(r.followUpCalls)}</td>
              <td className={td}>{num(r.connected)}</td>
              <td className={td}>{pct(r.connectivity)}</td>
              <td className={td}>{num(r.ordered)}</td>
            </tr>
          );
        })}
      </Table>
    </SectionCard>
  );
}

const OUTCOME_COLOR: Record<CallOutcome, string> = {
  rnr: '#9CA3AF', busy: '#9CA3AF', switched_off: '#9CA3AF', invalid: '#DC2626',
  follow_up: '#7C3AED', visit_booked: '#0F766E', call_back: '#2563EB',
  ordered: '#16A34A', bought_elsewhere: '#D97706', not_interested: '#B91C1C',
};

export function OutcomeSection({ t }: { t: Tally }) {
  const max = Math.max(1, ...Object.values(t.outcomes));
  return (
    <SectionCard title="What happened on the calls" subtitle={`${num(t.dials)} dials`}>
      {t.dials === 0 ? <Empty>No calls logged in this period.</Empty> : (
        <ul className="space-y-1.5">
          {CALL_OUTCOMES.map((o) => (
            <li key={o.key} className="grid grid-cols-[170px_1fr_70px] items-center gap-2 text-[12px]">
              <span className="text-gray-700 truncate">{o.label}</span>
              <span className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                <span className="block h-full rounded-full" style={{ width: `${(t.outcomes[o.key] / max) * 100}%`, background: OUTCOME_COLOR[o.key] }} />
              </span>
              <span className="text-right tabular-nums text-gray-600">{t.outcomes[o.key]} · {pct(t.dials ? t.outcomes[o.key] / t.dials : null)}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function HourSection({ hours }: { hours: TeamStats['byHour'] }) {
  const shown = hours.map((n, h) => ({ h, n })).filter(({ h, n }) => n > 0 || (h >= 9 && h <= 20));
  const max = Math.max(1, ...hours);
  return (
    <SectionCard title="Dials by hour" subtitle="IST, every BDA together">
      <div className="flex items-end gap-1 h-28">
        {shown.map(({ h, n }) => (
          <div key={h} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0" title={`${h}:00–${h + 1}:00 · ${n} dials`}>
            <span className="text-[9.5px] tabular-nums text-gray-500">{n || ''}</span>
            <span className="w-full rounded-t bg-[#0F766E]" style={{ height: `${(n / max) * 80}px`, opacity: n ? 1 : 0.15, minHeight: 2 }} />
            <span className="text-[9.5px] text-gray-400">{h}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
