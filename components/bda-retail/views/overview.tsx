'use client';

import { useMemo } from 'react';
import { SectionCard } from '../../b2b/ui/inbound-chips';
import { LensTileGroup, LensTiles } from '../../b2b/ui/lens-tiles';
import { COHORT_BY_KEY, COHORTS, PLAN_LEADS, PRIORITIES } from '@/lib/bda-retail/constants';
import type { BankState, LeadView, Priority } from '@/lib/bda-retail/types';
import { BankLens, COHORT_GROUPS, bankLensMatches, isConnected, istDate } from '@/lib/bda-retail/utils';
import { PRIORITY_COLOR, PageHead, labelCls, selectCls } from '../ui/chips';

const n = (v: number) => v.toLocaleString('en-IN');

export function OverviewView({ bank, views, months, month, setMonth, active, planIsDefault, onPlan, today, onLens, fetchButton }: {
  bank: BankState;
  views: LeadView[];
  months: string[];
  month: string;
  setMonth: (m: string) => void;
  active: Priority[];
  planIsDefault: boolean;
  onPlan: (p: Priority[] | null) => Promise<void>;
  today: string;
  onLens: (lens: BankLens) => void;
  fetchButton: React.ReactNode;
}) {
  const inMonth = useMemo(() => views.filter((l) => l.month === month), [views, month]);

  const groups: LensTileGroup<BankLens>[] = useMemo(() => COHORT_GROUPS.map((g) => ({
    title: g,
    tiles: COHORTS.filter((c) => c.group === g).map((c) => {
      const rows = inMonth.filter((l) => bankLensMatches(c.key, l));
      const worked = rows.filter((l) => l.stage !== 'new').length;
      return {
        key: c.key,
        title: `${c.priority} · ${c.label}`,
        rule: c.rule,
        accent: PRIORITY_COLOR[c.priority],
        value: n(rows.length),
        sub: active.includes(c.priority) ? `${n(worked)} worked` : 'Not in this month\'s queue',
        muted: !active.includes(c.priority),
      };
    }),
  })), [inMonth, active]);

  const byPriority = useMemo(() => PRIORITIES.map((p) => ({
    p,
    bank: inMonth.filter((l) => l.priority === p).length,
    plan: PLAN_LEADS[month]?.[p],
  })), [inMonth, month]);

  const todayCalls = useMemo(() => {
    let dials = 0;
    const connected = new Set<string>();
    const people = new Set<string>();
    for (const l of views) for (const c of l.calls) {
      if (istDate(c.at) !== today) continue;
      dials += 1;
      people.add(c.byPhone);
      if (isConnected(c)) connected.add(l.key);
    }
    const due = views.filter((l) => l.stage === 'follow_up' && l.nextOn <= today).length;
    return { dials, connected: connected.size, people: people.size, due };
  }, [views, today]);

  const last = bank.imports[0];
  const toggle = (p: Priority) => {
    const next = active.includes(p) ? active.filter((x) => x !== p) : PRIORITIES.filter((x) => x === p || active.includes(x));
    void onPlan(next);
  };

  return (
    <div className="p-4 sm:p-6">
      <PageHead title="Overview" sub="The month's lead library, the calling plan and today's calling">
        <div>
          <label className={labelCls}>Month</label>
          <select value={month} onChange={(e) => setMonth(e.target.value)} className={selectCls}>
            {months.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        {fetchButton}
      </PageHead>

      <LensTiles groups={groups} active={null} onPick={onLens} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <SectionCard title="Calling plan" subtitle={month}>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-[9px] font-bold uppercase tracking-wider text-gray-400 text-left">
                <th className="py-1">In queue</th><th className="py-1">Priority</th><th className="py-1 text-right">In bank</th><th className="py-1 text-right">B Plan</th>
              </tr>
            </thead>
            <tbody>
              {byPriority.map((r) => (
                <tr key={r.p} className="border-t border-gray-50">
                  <td className="py-1.5"><input type="checkbox" checked={active.includes(r.p)} onChange={() => toggle(r.p)} aria-label={`Call ${r.p} leads in ${month}`} /></td>
                  <td className="py-1.5 font-semibold" style={{ color: PRIORITY_COLOR[r.p] }}>{r.p}</td>
                  <td className="py-1.5 text-right tabular-nums">{n(r.bank)}</td>
                  <td className="py-1.5 text-right tabular-nums text-gray-500">{r.plan === undefined ? '—' : n(r.plan)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10.5px] text-gray-400 mt-2 leading-snug">
            The plan calls P1 from December, adds P2 in January and P3 in March. Ticking a box puts that priority in every BDA&apos;s queue for {month}.
            {!planIsDefault && <button onClick={() => void onPlan(null)} className="ml-1 underline">Back to the plan</button>}
          </p>
        </SectionCard>

        <SectionCard title="Today" subtitle={today}>
          <div className="grid grid-cols-2 gap-3">
            <Figure label="Dials" value={n(todayCalls.dials)} />
            <Figure label="Customers connected" value={n(todayCalls.connected)} />
            <Figure label="BDAs calling" value={n(todayCalls.people)} />
            <Figure label="Follow-ups due" value={n(todayCalls.due)} warn={todayCalls.due > 0} />
          </div>
        </SectionCard>

        <SectionCard title="Last fetch" subtitle={last ? new Date(last.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'never'}>
          {last ? (
            <div className="text-[12px] text-gray-600 space-y-1.5">
              <p><strong className="text-gray-900">{n(last.added)}</strong> new, {n(last.refreshed)} already in the bank, {n(last.samePerson ?? 0)} already in under another cohort. By {last.by}.</p>
              <p>
                Left out because a BM is on the cart: <strong className="text-gray-900">{n(last.skippedActive)}</strong>
                {last.read.skippedFollowUp ? ` (a follow-up date ahead also counted until 26 Nov: ${n(last.read.skippedFollowUp)} of these)` : ' (a remark on the cart in the last 7 days)'}.
              </p>
              <p className="text-[11px] text-gray-400">
                Read {n(last.read.carts ?? 0)} carts, {n((last.read.civil ?? 0) + (last.read.carpentry ?? 0) + (last.read.decorative ?? 0))} recent orders
                {last.read.ecVisitors !== undefined && `, ${n(last.read.ecVisitors)} EC visitors in the last 3 months`}.
              </p>
              {Object.entries(last.byCohort).length > 0 && (
                <ul className="text-[11px] text-gray-500 pt-1">
                  {Object.entries(last.byCohort).map(([k, v]) => (
                    <li key={k}>{COHORT_BY_KEY[k as keyof typeof COHORT_BY_KEY]?.label}: {n(v ?? 0)}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="text-[12px] text-gray-500">The bank is empty. Fetch new leads to fill it.</p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function Figure({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`text-[22px] font-bold tabular-nums ${warn ? 'text-amber-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}
