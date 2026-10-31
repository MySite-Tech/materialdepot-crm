'use client';

import { fmtL } from '../../../../models/mock-data';
import { OrderBucket, REVENUE_CHANNELS, RevenueFilter, bucketSplit, channelSplits, countedValue, matchesFilter } from '@/lib/b2b/revenue';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRevenueReport } from '../../hooks/use-revenue-report';
import { Card, Hint, Notice, Pill, Segmented, Stat } from '../../ui';
import { monthPace } from '../../utils';
import { TEAM_OPTIONS } from './constants';
import { BranchBridge } from './ui/branch-bridge';
import { Breakdown } from './ui/breakdown';
import { ChannelCard } from './ui/channel-card';
import { TargetBar } from './ui/target-bar';
import { monthOptions } from './utils';

const SELECT = 'px-2 py-1 text-[11px] font-semibold border border-gray-200 rounded-lg bg-white text-gray-600 cursor-pointer max-w-[170px]';

const NO_FILTER: Omit<RevenueFilter, 'bucket'> = { team: 'all', person: 'all', store: 'all', search: '' };

export function RevenueSection({ target, refreshKey }: { target: number; refreshKey: number }) {
  const months = useMemo(() => monthOptions(new Date()), []);
  const [monthKey, setMonthKey] = useState(months[0].key);
  const [fellBack, setFellBack] = useState(false);
  const monthPicked = useRef(false);
  const month = months.find((m) => m.key === monthKey) ?? months[0];
  const { report, error, busy, reload } = useRevenueReport(month.from, month.to, refreshKey);
  const [bucket, setBucket] = useState<OrderBucket | 'all'>('all');
  const [filter, setFilter] = useState(NO_FILTER);

  useEffect(() => { setBucket('all'); setFilter(NO_FILTER); }, [monthKey]);

  useEffect(() => {
    if (monthPicked.current || monthKey !== months[0].key) return;
    if (report?.from === months[0].from && !report.orders.length) {
      setMonthKey(months[1].key);
      setFellBack(true);
    }
  }, [report, monthKey, months]);

  const orders = useMemo(() => report?.orders ?? [], [report]);
  const isCurrent = monthKey === months[0].key;
  const total = useMemo(() => countedValue(orders), [orders]);
  const pace = useMemo(() => monthPace(total, target, new Date()), [total, target]);

  const narrowed = useMemo(() => orders.filter((o) => matchesFilter(o, { ...filter, bucket: o.bucket })), [orders, filter]);
  const splits = useMemo(() => channelSplits(narrowed), [narrowed]);
  const unowned = useMemo(() => bucketSplit(narrowed, 'unowned'), [narrowed]);
  const untraced = useMemo(() => bucketSplit(narrowed, 'untraced'), [narrowed]);
  const shown = useMemo(() => orders.filter((o) => matchesFilter(o, { ...filter, bucket })), [orders, filter, bucket]);
  const people = useMemo(() => [...new Set(orders.map((o) => o.person).filter(Boolean))].sort(), [orders]);
  const stores = useMemo(() => [...new Set(orders.map((o) => o.store))].sort(), [orders]);
  const narrowedTotal = REVENUE_CHANNELS.reduce((s, c) => s + splits[c].value, 0);
  const filtering = filter.team !== 'all' || filter.person !== 'all' || filter.store !== 'all' || !!filter.search.trim();

  const hasTarget = target > 0;
  const ahead = pace.achievedPct >= pace.expectedPct;
  const onTrack = pace.projection >= pace.target;
  const toggle = (b: OrderBucket) => setBucket(bucket === b ? 'all' : b);
  const set = (patch: Partial<typeof filter>) => setFilter({ ...filter, ...patch });

  return (
    <Card className={busy ? 'opacity-80 transition-opacity' : 'transition-opacity'}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-500">
            B2B revenue · {isCurrent ? `${pace.monthLabel} so far` : month.label}
            <Hint text="Everything B2B moved: orders the team placed, orders on B2B numbers placed through an EC, and orders from referred clients. By order date, whichever branch booked them. The target is the sum of each person's revenue target." />
          </div>
          <div className="flex items-baseline gap-3 flex-wrap mt-1">
            <span className="tabular-nums text-[34px] sm:text-[40px] leading-none font-bold text-gray-900">{report ? fmtL(total) : error ? 'Unknown' : '…'}</span>
            {hasTarget && <span className="text-[13px] text-gray-400">of {fmtL(target)}</span>}
            {report && hasTarget && isCurrent && <Pill tone={ahead ? 'good' : 'warn'}>{pace.achievedPct}% · {ahead ? 'ahead of pace' : 'behind pace'}</Pill>}
            {report && hasTarget && !isCurrent && <Pill tone={total >= target ? 'good' : 'muted'}>{pace.achievedPct}% of the current target</Pill>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select aria-label="Month" value={monthKey} onChange={(e) => { monthPicked.current = true; setFellBack(false); setMonthKey(e.target.value); }} className={SELECT}>
            {months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <Segmented options={TEAM_OPTIONS} value={filter.team} onChange={(team) => set({ team, person: 'all' })} />
          <select aria-label="Person" value={filter.person} onChange={(e) => set({ person: e.target.value })} className={SELECT}>
            <option value="all">Everyone</option>
            {people.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select aria-label="Store" value={filter.store} onChange={(e) => set({ store: e.target.value })} className={SELECT}>
            <option value="all">Every store</option>
            {stores.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input
            aria-label="Search firm, person, number or enquiry ID"
            value={filter.search}
            onChange={(e) => set({ search: e.target.value })}
            placeholder="Firm, person, number, enquiry"
            className="px-2 py-1 text-[11px] border border-gray-200 rounded-lg bg-white w-[160px]"
          />
        </div>
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
        <div className="mt-4"><Notice title="Studio Space numbers did not load.">Referred clients read Unknown and partner numbers are left out of EC-directed. Refresh to retry.</Notice></div>
      )}
      {report && !report.redirectsOk && (
        <div className="mt-4"><Notice title="EC redirects did not load.">Redirects logged in the CRM are left out, so EC-directed may read low.</Notice></div>
      )}
      {report?.truncated && (
        <div className="mt-4"><Notice title="This month has more orders than one read covers.">The figures are incomplete.</Notice></div>
      )}

      {report && (
        <>
          <TargetBar splits={channelSplits(orders)} target={target} expectedPct={isCurrent ? pace.expectedPct : null} />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-5">
            {REVENUE_CHANNELS.map((c) => (
              <ChannelCard
                key={c}
                channel={c}
                split={splits[c]}
                total={narrowedTotal}
                selected={bucket === c}
                unknown={c === 'referred' && !report.studioOk}
                onSelect={() => toggle(c)}
              />
            ))}
          </div>

          {filtering && (
            <p className="text-[11px] text-gray-500 mt-2 tabular-nums">
              {fmtL(narrowedTotal)} of {fmtL(total)} match these filters.{' '}
              <button onClick={() => setFilter(NO_FILTER)} className="font-semibold text-[#0F766E] cursor-pointer hover:underline">Clear</button>
            </p>
          )}

          {isCurrent && (
            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-100">
              <Stat
                label="Month-end projection"
                value={fmtL(pace.projection)}
                sub={hasTarget ? <span className={onTrack ? 'text-green-700' : 'text-red-500'}>{onTrack ? 'On track' : `${fmtL(pace.target - pace.projection)} short`}</span> : undefined}
              />
              <Stat label="Needed per day" value={hasTarget ? fmtL(pace.perDayNeeded) : '—'} sub="to hit target" />
              <Stat label="Days left" value={String(pace.daysLeft)} sub="in the month" />
            </div>
          )}

          <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mt-4 text-[11px] text-gray-500">
            <span className="font-semibold text-gray-400">Not counted:</span>
            <button onClick={() => toggle('unowned')} aria-pressed={bucket === 'unowned'} className={`cursor-pointer hover:text-gray-800 ${bucket === 'unowned' ? 'font-semibold text-gray-900' : ''}`}>
              <span className="tabular-nums font-semibold">{fmtL(unowned.value)}</span> at {unowned.firms} firms with no KAM
            </button>
            <button onClick={() => toggle('untraced')} aria-pressed={bucket === 'untraced'} className={`cursor-pointer hover:text-gray-800 ${bucket === 'untraced' ? 'font-semibold text-gray-900' : ''}`}>
              <span className="tabular-nums font-semibold">{fmtL(untraced.value)}</span> booked on B2B, number not on any record
            </button>
            <Hint text="Nobody at B2B is on record for these. Assigning a KAM moves a firm's orders into EC-directed. Booked on B2B means the B2B branch, a store rep on the cart, and a number no firm or lead holds." />
          </div>

          <BranchBridge orders={orders} />

          <Breakdown orders={shown} />
        </>
      )}
    </Card>
  );
}
