'use client';

import { MonthWindow, RevenueOrder, applyCredits, monthWindows } from '@/lib/b2b/revenue';
import { useOrderCredits } from '../../../order-credit/hooks/use-order-credits';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { MONTHS_OFFERED } from '../sections/revenue/constants';
import { OrderDrawer } from '../sections/revenue/ui/order-drawer';
import { Card, Notice, Segmented } from '../ui';
import { DIM_META, DIM_ORDER, SCOPES, STUDIO_SCOPE, TREND_SPAN } from './constants';
import { useMonthReports } from '../hooks/use-month-reports';
import type { AnalysisFilter, DimKey, Option } from './types';
import { ChangeTable } from './ui/changes';
import { FilterBar } from './ui/filter-bar';
import { HeatTable } from './ui/heat-table';
import { KpiStrip } from './ui/kpis';
import { Movers } from './ui/movers';
import { throughDay } from '@/lib/b2b/revenue/journey';
import { matches, moversByDim, optionsOf, ordersFor, totals } from './utils';

const SELECT = 'px-2 py-1 text-[12px] font-semibold border border-gray-200 rounded-lg bg-white text-gray-700 cursor-pointer';

interface Drawer { title: string; rows: RevenueOrder[] }

export function RevenueAnalysis({ head }: { head: (right: ReactNode) => ReactNode }) {
  const months = useMemo(() => monthWindows(new Date(), MONTHS_OFFERED), []);
  const [focusKey, setFocusKey] = useState(months[0].key);
  const [compareKey, setCompareKey] = useState(months[1].key);
  const [sameDays, setSameDays] = useState(true);
  const [filter, setFilter] = useState<AnalysisFilter>({ channel: STUDIO_SCOPE });
  const [dim, setDim] = useState<DimKey>('channel');
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const picked = useRef(false);

  const byKey = (key: string) => months.find((m) => m.key === key) ?? months[0];
  const focusMonth = byKey(focusKey);
  const compareMonth = byKey(compareKey);
  const trendMonths = useMemo(() => months.slice(0, TREND_SPAN).reverse(), [months]);
  const wanted = useMemo(
    () => [...new Map([...trendMonths, focusMonth, compareMonth].map((m) => [m.key, m])).values()],
    [trendMonths, focusMonth, compareMonth],
  );
  const reports = useMonthReports(wanted, refreshKey);
  const { credits, state: creditsState } = useOrderCredits();

  const ordersByMonth = useMemo(() => {
    const out: Record<string, RevenueOrder[] | null> = {};
    for (const [key, s] of Object.entries(reports)) out[key] = s.report ? applyCredits(s.report.orders, credits) : null;
    return out;
  }, [reports, credits]);

  useEffect(() => {
    if (picked.current) return;
    const current = reports[months[0].key]?.report;
    if (current && !current.orders.length && focusKey === months[0].key) {
      setFocusKey(months[1].key);
      setCompareKey(months[2].key);
    }
  }, [reports, months, focusKey]);

  const picks = filter.channel ?? [];
  const scope = !picks.length ? 'all' : picks.length === STUDIO_SCOPE.length && STUDIO_SCOPE.every((c) => picks.includes(c)) ? 'studio' : null;
  const pickScope = (s: keyof typeof SCOPES) => setFilter((f) => ({ ...f, channel: s === 'studio' ? STUDIO_SCOPE : [] }));

  const partial = focusKey === months[0].key || compareKey === months[0].key;
  const cutoff = partial && sameDays ? Number(months[0].to.slice(8)) : null;
  const focusAll = useMemo(() => throughDay(ordersByMonth[focusKey] ?? [], cutoff), [ordersByMonth, focusKey, cutoff]);
  const compareAll = useMemo(() => throughDay(ordersByMonth[compareKey] ?? [], cutoff), [ordersByMonth, compareKey, cutoff]);
  const focus = useMemo(() => focusAll.filter((o) => matches(o, filter)), [focusAll, filter]);
  const compare = useMemo(() => compareAll.filter((o) => matches(o, filter)), [compareAll, filter]);

  const options = useMemo(() => Object.fromEntries(DIM_ORDER.map((d) => [d, optionsOf(
    focusAll.filter((o) => matches(o, filter, d)),
    compareAll.filter((o) => matches(o, filter, d)),
    d,
  )])) as Record<DimKey, Option[]>, [focusAll, compareAll, filter]);
  const movers = useMemo(() => moversByDim(focus, compare, filter), [focus, compare, filter]);
  const trendOrders = useMemo(
    () => trendMonths.map((m) => ordersByMonth[m.key]?.filter((o) => matches(o, filter)) ?? null),
    [trendMonths, ordersByMonth, filter],
  );

  const focusState = reports[focusKey];
  const compareState = reports[compareKey];
  const focusKnown = !!focusState?.report;
  const compareKnown = !!compareState?.report;
  const days = cutoff ? ` 1–${cutoff}` : '';
  const focusLabel = `${focusMonth.label.split(' ')[0]}${days}`;
  const compareLabel = `${compareMonth.label.split(' ')[0]}${days}`;
  const failed = wanted.filter((m) => reports[m.key]?.error);
  const truncated = wanted.filter((m) => reports[m.key]?.report?.truncated);
  const loading = wanted.some((m) => !reports[m.key] || reports[m.key].loading);
  const studioDown = [focusState, compareState].some((s) => s?.report && !s.report.studioOk);
  const redirectsDown = [focusState, compareState].some((s) => s?.report && !s.report.redirectsOk);

  const pickFocus = (key: string) => {
    picked.current = true;
    if (key === compareKey) setCompareKey(focusKey);
    setFocusKey(key);
  };
  const pickCompare = (key: string) => {
    picked.current = true;
    if (key === focusKey) setFocusKey(compareKey);
    setCompareKey(key);
  };
  const drill = (d: DimKey, key: string) => {
    const next = { ...filter, [d]: [key] };
    setFilter(next);
    if (d === dim) setDim(DIM_ORDER.find((x) => x !== d && !next[x]?.length) ?? dim);
  };
  const open = (title: string, rows: RevenueOrder[]) => setDrawer({ title, rows });
  const openMonth = (key: string | null, m: MonthWindow) => {
    const rows = (ordersByMonth[m.key] ?? []).filter((o) => matches(o, filter));
    open(`${key ?? 'All filtered'} · ${m.label}`, key === null ? [...rows].sort((a, b) => b.value - a.value) : ordersFor(rows, dim, key));
  };

  const refreshButton = (
    <button
      onClick={() => setRefreshKey((k) => k + 1)}
      disabled={loading}
      className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-lg bg-white text-gray-600 hover:border-gray-300 cursor-pointer disabled:opacity-50 disabled:cursor-default"
    >
      {loading ? 'Loading…' : 'Refresh'}
    </button>
  );

  return (
    <>
      {head(refreshButton)}

      <Card className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap text-[12px] text-gray-500">
          <Segmented options={SCOPES} value={scope as keyof typeof SCOPES} onChange={pickScope} />
          <span className="font-semibold text-gray-700 ml-1">Compare</span>
          <select aria-label="Month to analyse" value={focusKey} onChange={(e) => pickFocus(e.target.value)} className={SELECT}>
            {months.map((m) => <option key={m.key} value={m.key}>{m.label}{m.key === months[0].key ? ' (so far)' : ''}</option>)}
          </select>
          <span>with</span>
          <select aria-label="Month to compare with" value={compareKey} onChange={(e) => pickCompare(e.target.value)} className={SELECT}>
            {months.map((m) => <option key={m.key} value={m.key}>{m.label}{m.key === months[0].key ? ' (so far)' : ''}</option>)}
          </select>
          {partial && (
            <label className="inline-flex items-center gap-1.5 ml-1 cursor-pointer select-none">
              <input type="checkbox" checked={sameDays} onChange={(e) => setSameDays(e.target.checked)} className="accent-[#0F766E]" />
              Same days only (1–{Number(months[0].to.slice(8))} of each month)
            </label>
          )}
        </div>
        <FilterBar options={options} filter={filter} onChange={setFilter} />
      </Card>

      {!!failed.length && (
        <Notice title={`${failed.map((m) => m.label).join(', ')} could not be read.`}>
          Those months read Unknown, never zero. <button onClick={() => setRefreshKey((k) => k + 1)} className="underline cursor-pointer">Retry</button>
        </Notice>
      )}
      {!!truncated.length && <Notice title={`${truncated.map((m) => m.label).join(', ')} has more orders than one read covers.`}>Its figures are incomplete.</Notice>}
      {studioDown && <Notice title="Studio Space numbers did not load.">Referred clients are missing, and partner numbers are left out of Studio EC Redirected.</Notice>}
      {redirectsDown && <Notice title="EC redirects did not load.">Redirects logged in the CRM are left out, so Studio EC Redirected may read low and EC Direct high.</Notice>}
      {creditsState === 'failed' && <Notice title="Manual order credits did not load.">Credited to follows the rule only, without any manager&rsquo;s change.</Notice>}

      <KpiStrip
        focus={focusKnown ? totals(focus) : null}
        compare={compareKnown ? totals(compare) : null}
        compareLabel={compareLabel}
      />

      {focusKnown && compareKnown ? (
        <>
          <Card>
            <Movers rows={movers} focusLabel={focusLabel} compareLabel={compareLabel} onPick={drill} />
          </Card>
          <Card>
            <ChangeTable
              focus={focus}
              compare={compare}
              focusLabel={focusLabel}
              compareLabel={compareLabel}
              dim={dim}
              dims={DIM_ORDER}
              onDim={setDim}
              onFilter={(key) => drill(dim, key)}
              onOpen={(key, which) => open(
                `${key} · ${(which === 'focus' ? focusMonth : compareMonth).label}`,
                ordersFor(which === 'focus' ? focus : compare, dim, key),
              )}
            />
          </Card>
        </>
      ) : (
        <Card>
          <p className="text-[12px] text-gray-400">
            {focusState?.error || compareState?.error ? 'One of the two months could not be read, so nothing is compared. Retry above.' : `Reading ${focusMonth.label} and ${compareMonth.label}…`}
          </p>
        </Card>
      )}

      <Card>
        <HeatTable
          months={trendMonths}
          monthOrders={trendOrders}
          busy={trendMonths.map((m) => !reports[m.key] || reports[m.key].loading)}
          dim={dim}
          focusKey={focusKey}
          compareKey={compareKey}
          onPickMonth={pickFocus}
          onFilter={(key) => drill(dim, key)}
          onOpen={openMonth}
        />
        <p className="text-[11px] text-gray-400 mt-2">
          {`${DIM_META[dim].label}: ${DIM_META[dim].hint} Whole months here, whatever the same-days setting.`}
        </p>
      </Card>

      {drawer && <OrderDrawer title={drawer.title} orders={drawer.rows} onClose={() => setDrawer(null)} />}
    </>
  );
}
