'use client';

import { fmtL } from '../../../../models/mock-data';
import { OrderType, REVENUE_CHANNELS, RevenueChannel, RevenueFilter, applyCredits, channelSplits, fetchRevenueReport, matchesFilter, monthWindows, revenueTotal } from '@/lib/b2b/revenue';
import { useOrderCredits } from '../../../../order-credit/hooks/use-order-credits';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMonthReport } from '../../hooks/use-month-report';
import { useRevenueTrend } from '../../hooks/use-revenue-trend';
import { Card, Hint, Notice, Pill, Segmented, Stat } from '../../ui';
import { monthPace } from '../../utils';
import { MONTHS_OFFERED, TEAM_OPTIONS } from './constants';
import { Breakdown } from './ui/breakdown';
import { ChannelCard } from './ui/channel-card';
import { TargetBar } from './ui/target-bar';
import { RevenueTrendChart } from './ui/trend';

const SELECT = 'px-2 py-1 text-[11px] font-semibold border border-gray-200 rounded-lg bg-white text-gray-600 cursor-pointer max-w-[170px]';

const NO_FILTER: RevenueFilter = { channel: 'all', type: 'all', team: 'all', person: 'all', store: 'all', search: '' };

export function RevenueSection({ target, refreshKey }: { target: number; refreshKey: number }) {
  const months = useMemo(() => monthWindows(new Date(), MONTHS_OFFERED), []);
  const [monthKey, setMonthKey] = useState(months[0].key);
  const [fellBack, setFellBack] = useState(false);
  const monthPicked = useRef(false);
  const month = months.find((m) => m.key === monthKey) ?? months[0];
  const { report, error, busy, reload } = useMonthReport(fetchRevenueReport, month.from, month.to, true, refreshKey, 'Revenue could not be read');
  const trend = useRevenueTrend(refreshKey);
  const [filter, setFilter] = useState(NO_FILTER);

  useEffect(() => { setFilter(NO_FILTER); }, [monthKey]);

  useEffect(() => {
    if (monthPicked.current || monthKey !== months[0].key) return;
    if (report?.from === months[0].from && !report.orders.length) {
      setMonthKey(months[1].key);
      setFellBack(true);
    }
  }, [report, monthKey, months]);

  const { credits, state: creditsState } = useOrderCredits();
  const orders = useMemo(() => applyCredits(report?.orders ?? [], credits), [report, credits]);
  const isCurrent = monthKey === months[0].key;
  const total = useMemo(() => revenueTotal(orders), [orders]);
  const pace = useMemo(() => monthPace(total, target, new Date()), [total, target]);

  const narrowed = useMemo(() => orders.filter((o) => matchesFilter(o, { ...filter, channel: 'all', type: 'all' })), [orders, filter]);
  const splits = useMemo(() => channelSplits(narrowed), [narrowed]);
  const referredOnBranch = useMemo(() => narrowed.reduce((s, o) => (o.channel === 'referred' && o.bookedOnB2B ? s + o.value : s), 0), [narrowed]);
  const shown = useMemo(() => orders.filter((o) => matchesFilter(o, filter)), [orders, filter]);
  const people = useMemo(() => [...new Set(orders.map((o) => o.person).filter(Boolean))].sort(), [orders]);
  const stores = useMemo(() => [...new Set(orders.map((o) => o.store))].sort(), [orders]);
  const narrowedTotal = REVENUE_CHANNELS.reduce((s, c) => s + splits[c].value, 0);
  const filtering = filter.team !== 'all' || filter.person !== 'all' || filter.store !== 'all' || !!filter.search.trim();

  const hasTarget = target > 0;
  const ahead = pace.achievedPct >= pace.expectedPct;
  const onTrack = pace.projection >= pace.target;
  const set = (patch: Partial<RevenueFilter>) => setFilter((cur) => ({ ...cur, ...patch }));
  const pickChannel = (channel: RevenueChannel) =>
    set(filter.channel === channel && filter.type === 'all' ? { channel: 'all', type: 'all' } : { channel, type: 'all' });
  const pickType = (channel: RevenueChannel, type: OrderType) =>
    set(filter.channel === channel && filter.type === type ? { channel: 'all', type: 'all' } : { channel, type });
  const notes: Partial<Record<RevenueChannel, string>> = referredOnBranch > 0 ? {
    direct: `${fmtL(referredOnBranch)} more on the B2B branch is referred clients, in Referred`,
    referred: `${fmtL(referredOnBranch)} booked on the B2B branch · ${fmtL(splits.referred.value - referredOnBranch)} at a store`,
  } : {};
  const pickMonth = (key: string) => {
    monthPicked.current = true;
    setFellBack(false);
    setMonthKey(key);
  };

  return (
    <Card className={busy ? 'opacity-80 transition-opacity' : 'transition-opacity'}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-500">
            B2B revenue · {isCurrent ? `${pace.monthLabel} so far` : month.label}
            <Hint text="Direct is every order placed on the B2B branch (HQ until June 2026). Studio EC Redirected is store orders from firms the B2B team works with. EC Direct is store orders from Client Database firms with no B2B SPoC. Referred is every order from clients a Studio Space partner referred. By order date. The target is the sum of each person's revenue target." />
          </div>
          <div className="flex items-baseline gap-3 flex-wrap mt-1">
            <span className="tabular-nums text-[34px] sm:text-[40px] leading-none font-bold text-gray-900">{report ? fmtL(total) : error ? 'Unknown' : '…'}</span>
            {hasTarget && <span className="text-[13px] text-gray-400">of {fmtL(target)}</span>}
            {report && hasTarget && isCurrent && <Pill tone={ahead ? 'good' : 'warn'}>{pace.achievedPct}% · {ahead ? 'ahead of pace' : 'behind pace'}</Pill>}
            {report && hasTarget && !isCurrent && <Pill tone={total >= target ? 'good' : 'muted'}>{pace.achievedPct}% of the current target</Pill>}
          </div>
        </div>
        <select aria-label="Month" value={monthKey} onChange={(e) => pickMonth(e.target.value)} className={SELECT}>
          {months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
      </div>

      {fellBack && (
        <p className="text-[11px] text-gray-500 mt-2">{months[0].label} has no orders yet, so this opens on {month.label}.</p>
      )}
      {error && (
        <div className="mt-4">
          <Notice title="Revenue could not be read.">{error}. Nothing below is a zero. <button onClick={reload} className="underline cursor-pointer">Retry</button></Notice>
        </div>
      )}
      {report && !report.studioOk && (
        <div className="mt-4"><Notice title="Studio Space numbers did not load.">Referred clients read Unknown and partner numbers are left out of Studio EC Redirected. Refresh to retry.</Notice></div>
      )}
      {report && !report.redirectsOk && (
        <div className="mt-4"><Notice title="EC redirects did not load.">Redirects logged in the CRM are left out, so Studio EC Redirected may read low and EC Direct high.</Notice></div>
      )}
      {report && creditsState === 'failed' && (
        <div className="mt-4"><Notice title="Manual order credits did not load.">People show who each order is credited to by the rule only, without any manager's change.</Notice></div>
      )}
      {report?.truncated && (
        <div className="mt-4"><Notice title="This month has more orders than one read covers.">The figures are incomplete.</Notice></div>
      )}

      {report && (
        <>
          <TargetBar splits={channelSplits(orders)} target={target} expectedPct={isCurrent ? pace.expectedPct : null} />

          {isCurrent && (
            <div className="grid grid-cols-3 gap-4 mt-4">
              <Stat
                label="Month-end projection"
                value={fmtL(pace.projection)}
                sub={hasTarget ? <span className={onTrack ? 'text-green-700' : 'text-red-500'}>{onTrack ? 'On track' : `${fmtL(pace.target - pace.projection)} short`}</span> : undefined}
              />
              <Stat label="Needed per day" value={hasTarget ? fmtL(pace.perDayNeeded) : '—'} sub="to hit target" />
              <Stat label="Days left" value={String(pace.daysLeft)} sub="in the month" />
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap mt-5">
            <Segmented options={TEAM_OPTIONS} value={filter.team} onChange={(team) => set({ team, person: 'all' })} />
            <select aria-label="Person" value={filter.person} onChange={(e) => set({ person: e.target.value })} className={SELECT}>
              <option value="all">Everyone</option>
              {people.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select aria-label="Rep's branch" value={filter.store} onChange={(e) => set({ store: e.target.value })} className={SELECT}>
              <option value="all">Every branch</option>
              {stores.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input
              aria-label="Search firm, person, number or enquiry ID"
              value={filter.search}
              onChange={(e) => set({ search: e.target.value })}
              placeholder="Firm, person, number, enquiry"
              className="px-2 py-1 text-[11px] border border-gray-200 rounded-lg bg-white w-[160px]"
            />
            {filtering && (
              <span className="text-[11px] text-gray-500 tabular-nums">
                {fmtL(narrowedTotal)} of {fmtL(total)}{' '}
                <button onClick={() => setFilter({ ...NO_FILTER, channel: filter.channel, type: filter.type })} className="font-semibold text-[#0F766E] cursor-pointer hover:underline">Clear</button>
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mt-3">
            {REVENUE_CHANNELS.map((c) => (
              <ChannelCard
                key={c}
                channel={c}
                split={splits[c]}
                total={narrowedTotal}
                selected={filter.channel === c}
                selectedType={filter.type}
                unknown={c === 'referred' && !report.studioOk}
                note={notes[c]}
                onSelect={() => pickChannel(c)}
                onType={(t) => pickType(c, t)}
              />
            ))}
          </div>
        </>
      )}

      <RevenueTrendChart trend={trend.trend} error={trend.error} selected={monthKey} onPick={pickMonth} onRetry={trend.reload} />

      {report && <Breakdown orders={shown} />}
    </Card>
  );
}
