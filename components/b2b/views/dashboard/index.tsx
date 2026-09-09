'use client';

import { HealthOverview, buildHealthOverview } from '../../models/accountHealth';
import { ClientMetricsMap, DashboardMetrics, KamDashboard, computeDashboard, computeKamDashboard } from '../../models/analytics';
import { ACTIVE_WINDOW_MONTHS, CLIENT_STATUS_COLORS, CLIENT_STATUS_HINT, ClientEntity, contactNumbers } from '../../models/clientModel';
import { INBOUND_STAGE_COLORS, fmtINR, fmtL } from '../../models/mockData';
import { CLIENT_STATUS_ORDER, RANGE_LABELS, SOURCE_COLORS } from '../../constants/b2b-dashboard';
import { AccountHealthPanel } from './health';
import { KamDashboardSection } from './kam';
import { RangeKey } from '../../types/b2b-dashboard';
import { MetricCard, Panel } from './ui';
import { rangeFor } from '../../utils/b2b-dashboard';
import { B2BData, B2BPipelineStats, ORDER_DETAIL_PHONE_CAP, VerticalStats, clientMetricsFrom, fetchB2BData, fetchB2BPipelineStats, fetchClientOrderHistories, fetchClientOrderRows, fetchTargets, fetchVerticalStats, firstOrderValue, istToday, orderDatesFromRows, resolveKamOrders } from '@/lib/b2bLeads';
import { useCallback, useEffect, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

export default function B2BDashboard() {
  const [d, setD] = useState<DashboardMetrics | null>(null);
  const [stats, setStats] = useState<B2BPipelineStats | null>(null);
  const [verticals, setVerticals] = useState<VerticalStats[]>([]);
  const [monthRevenue, setMonthRevenue] = useState(0);
  const [range, setRange] = useState<RangeKey>('month');
  const [monthlyTarget, setMonthlyTarget] = useState(0);
  const [runRate, setRunRate] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [health, setHealth] = useState<HealthOverview<ClientEntity> | null>(null);
  const [kamDash, setKamDash] = useState<KamDashboard | null>(null);
  const [failed, setFailed] = useState<B2BData['failed']>([]);
  const [clientCount, setClientCount] = useState(0);
  const [datesCapped, setDatesCapped] = useState(0);
  const [datesFailed, setDatesFailed] = useState(0);
  const [unresolvedOrders, setUnresolvedOrders] = useState(0);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const now = new Date();

      const selected = rangeFor(range, now);
      const [fetched, targets, pipeline, byVertical, monthVertical] = await Promise.all([
        fetchB2BData(), fetchTargets(), fetchB2BPipelineStats(selected),
        fetchVerticalStats(selected),
        range === 'month' ? Promise.resolve(null) : fetchVerticalStats(rangeFor('month', now)),
      ]);
      let data = fetched;
      const today = istToday(now);

      const { resolutions } = await resolveKamOrders(data.kam);
      const resolvedById = new Map(resolutions.filter((r) => r.resolved).map((r) => [r.order.id, r.resolved!]));
      const kamUnresolved = data.kam.filter((o) =>
        !!String(o.enqId || '').trim() && !resolvedById.has(o.id) && o.orderValue === undefined).length;
      data = { ...data, kam: data.kam.map((o) => resolvedById.get(o.id) ?? o) };
      setUnresolvedOrders(kamUnresolved);

      const clientPhones = data.clients.flatMap((c) => contactNumbers(c.contacts));
      const aggregates = await fetchClientOrderHistories(clientPhones);
      const capped = clientPhones.slice(0, ORDER_DETAIL_PHONE_CAP);
      const details = await fetchClientOrderRows(capped);
      const dates = orderDatesFromRows(details, capped);
      const clientMetrics: ClientMetricsMap = {};
      for (const c of data.clients) {
        clientMetrics[c.id] = clientMetricsFrom(c.contacts, aggregates, dates);
      }
      setDatesCapped(Math.max(0, clientPhones.length - capped.length));
      setDatesFailed(details.failedPhones.length);

      const m = computeDashboard(data, clientMetrics, today);
      setKamDash(computeKamDashboard(data, {
        clientMetrics,
        firstOrderValueFor: (c) => firstOrderValue(details, contactNumbers(c.contacts)),
        today,
        month: { from: today.slice(0, 8) + '01', to: today },
      }));
      setFailed(data.failed);
      setClientCount(data.clients.length);

      setHealth(buildHealthOverview(
        data.clients,
        today,
        (c: ClientEntity) => contactNumbers(c.contacts)
          .reduce((t, p) => t + (aggregates[p]?.openValue ?? 0), 0),
      ));
      const dayOfMonth = now.getDate();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const revenue = (monthVertical ?? byVertical).reduce((s, v) => s + v.won.value, 0);
      setD(m);
      setStats(pipeline);
      setVerticals(byVertical);
      setMonthRevenue(revenue);
      setMonthlyTarget(targets.monthlyTargetL * 100000);
      setRunRate(Math.round((revenue / dayOfMonth) * daysInMonth));
      setUpdatedAt(now);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  if (loading || !d) {
    return <div className="p-4 sm:p-6 text-sm text-gray-400">Loading dashboard…</div>;
  }

  const totalValue = stats?.total.value ?? 0;
  const pctWon = totalValue ? ((stats?.won.value ?? 0) / totalValue) * 100 : 0;
  const pctActive = totalValue ? ((stats?.active.value ?? 0) / totalValue) * 100 : 0;
  const pctLost = totalValue ? ((stats?.lost.value ?? 0) / totalValue) * 100 : 0;

  const achievedPct = monthlyTarget > 0 ? Math.round((monthRevenue / monthlyTarget) * 100) : 0;
  const overallPipeline = verticals.reduce((s, v) => s + v.active.value, 0);
  const revenueBySource = verticals.map((v) => ({ source: v.label, value: v.won.value }));
  const gap = runRate - monthlyTarget;

  const maxStage = Math.max(...d.pipelineByStage.map((s) => s.count), 1);
  const clientData = CLIENT_STATUS_ORDER.map((name) => ({ name, value: d.clients[name] }));

  const stageColor = (label: string): string =>
    label === 'Won' ? '#22C55E' : label === 'In Progress' ? '#F59E0B' : (INBOUND_STAGE_COLORS as Record<string, string>)[label] || '#EAB308';

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-end justify-between mb-4 gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-800">Dashboard</h1>
          <p className="text-xs text-gray-400 mt-0.5">Revenue, pipeline &amp; run rate</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-[11px] text-gray-400 text-right hidden sm:block">
            Target set on the <span className="font-semibold text-gray-600">Targets</span> tab
            {updatedAt && <div>Updated {updatedAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}</div>}
          </div>
          <button
            onClick={load}
            disabled={refreshing}
            className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 hover:border-gray-300 cursor-pointer disabled:opacity-50 disabled:cursor-default"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {!!failed.length && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12px] text-amber-900">
          <span className="font-semibold">Partly loaded.</span>{' '}
          {failed.join(', ')}{' '}could not be read, so every figure below excludes {failed.length === 1 ? 'it' : 'them'}.{' '}
          Refresh to retry.
        </div>
      )}
      {!failed.length && clientCount === 0 && (
        <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-[12px] text-blue-900">
          <span className="font-semibold">The Client Database is empty.</span>{' '}
          Client status, the cohort, temperature and call compliance all read from it — seed it from the
          <span className="font-semibold"> Client Database </span>tab and these panels fill in.
        </div>
      )}

      <div className="bg-white rounded-lg px-4 sm:px-6 py-4 border border-gray-200 mb-3">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Pipeline · carts created {range === 'all' ? 'all time' : RANGE_LABELS[range].toLowerCase()}
          </div>
          <div className="flex gap-1">
            {(Object.keys(RANGE_LABELS) as RangeKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setRange(k)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border cursor-pointer ${
                  range === k
                    ? 'bg-[#0F766E] border-[#0F766E] text-white'
                    : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                {RANGE_LABELS[k]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-3 sm:flex sm:justify-between sm:gap-4">
          {[
            { label: 'Total Pipeline', sub: ' Value', b: stats?.total, tone: 'text-black', big: true },
            { label: 'Active Pipeline', b: stats?.active, tone: 'text-[#EAB308]' },
            { label: 'Order Won', b: stats?.won, tone: 'text-green-700' },
            { label: 'Order Lost', sub: ' / Refunded', b: stats?.lost, tone: 'text-gray-400' },
          ].map((k) => (
            <div key={k.label}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {k.label}{k.sub && <span className="hidden sm:inline">{k.sub}</span>}
              </div>
              <div className={`font-mono font-bold break-all sm:break-normal ${k.big ? 'text-[13px] sm:text-[22px]' : 'text-[13px] sm:text-lg'} ${k.tone}`}>
                {fmtINR(Math.round(k.b?.value ?? 0))}
              </div>
              <div className="text-[11px] text-gray-400">{k.b?.count ?? 0} carts</div>
            </div>
          ))}
        </div>
        <div className="flex h-1.5 rounded-sm overflow-hidden mt-4 bg-gray-200">
          <div className="bg-green-500 transition-[width] duration-300" style={{ width: pctWon + '%' }} />
          <div className="bg-[#EAB308] transition-[width] duration-300" style={{ width: pctActive + '%' }} />
          <div className="bg-gray-400 transition-[width] duration-300" style={{ width: pctLost + '%' }} />
        </div>
      </div>

      {(stats?.byStatus.length ?? 0) > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 mb-3">
          {stats!.byStatus.map((s) => (
            <div key={s.status} className="bg-white rounded-lg border border-gray-200 px-4 py-3 text-center min-w-[130px] flex-[1_0_140px]">
              <div className="text-xl font-bold text-gray-700">{s.count}</div>
              <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 mt-0.5">{s.status}</div>
              <div className="font-mono text-[11px] font-semibold text-gray-600 mt-1">{fmtINR(Math.round(s.value))}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Revenue Generated" value={fmtL(monthRevenue)} sub={`of ${fmtL(monthlyTarget)} target`} />
        <MetricCard label="Target Achieved" value={`${achievedPct}%`} />
        <MetricCard label="Run Rate" value={fmtL(runRate)} sub={runRate < monthlyTarget ? 'Below required' : 'On track'} subTone={runRate < monthlyTarget ? 'warn' : 'muted'} />
        <MetricCard label="Month Projection" value={fmtL(runRate)} />
      </div>

      {health && <AccountHealthPanel overview={health} />}

      <Panel title="Revenue vs Target" className="mt-3">
        <div className="font-mono text-lg font-bold text-black">
          {fmtL(monthRevenue)} <span className="text-sm font-normal text-gray-400">of {fmtL(monthlyTarget)}</span>
        </div>
        <div className="h-2 rounded-full bg-gray-200 overflow-hidden mt-3">
          <div className="h-full bg-[#0F766E] rounded-full transition-[width] duration-500" style={{ width: `${achievedPct}%` }} />
        </div>
        <div className="text-[11px] text-gray-400 mt-2">{achievedPct}% of monthly target achieved</div>
      </Panel>

      <Panel title="Pipeline by Stage" className="mt-3">
        <div className="flex flex-col gap-3">
          {d.pipelineByStage.map((s) => (
            <div key={s.label} className="flex items-center gap-3">
              <div className="w-24 text-[11px] font-semibold text-gray-500 shrink-0">{s.label}</div>
              <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
                <div
                  className="h-full rounded flex items-center px-2 text-[11px] font-bold text-white transition-[width] duration-500"
                  style={{ width: `${Math.max((s.count / maxStage) * 100, 8)}%`, background: stageColor(s.label) }}
                >
                  {s.count}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Pipeline by Vertical — Overall Pipeline" className="mt-3">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            ...verticals.map((v) => ({ label: v.label, value: v.active.value, count: v.active.count, accent: false })),
            { label: 'Overall Pipeline', value: overallPipeline, count: verticals.reduce((s, v) => s + v.active.count, 0), accent: true },
          ].map((v) => (
            <div key={v.label} className={`rounded-lg px-4 py-3 border ${v.accent ? 'border-[#0F766E]/30 bg-[#0F766E]/5' : 'border-gray-200'}`}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{v.label}</div>
              <div className={`font-mono text-lg font-bold mt-1 ${v.accent ? 'text-[#0F766E]' : 'text-black'}`}>{fmtL(v.value)}</div>
              <div className="text-[11px] text-gray-400 mt-0.5">{v.count} open</div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">

        <Panel title="Client Status">
          {d.clientMasterEmpty ? (
            <p className="text-[12px] text-gray-400 py-6 text-center">
              No clients in the Client Database yet. Seed it from the
              <span className="font-semibold text-gray-600"> Client Database </span>
              tab — until then this split has nothing to report, which is not the same as “no active clients”.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="45%" height={150}>
                  <PieChart>
                    <Pie data={clientData.filter((c) => c.value > 0)} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={30} outerRadius={62} paddingAngle={2}>
                      {clientData.filter((c) => c.value > 0).map((c) => <Cell key={c.name} fill={CLIENT_STATUS_COLORS[c.name]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 flex flex-col gap-2">
                  {clientData.map((c) => (
                    <div key={c.name} className="flex items-center justify-between text-[13px]" title={CLIENT_STATUS_HINT[c.name]}>
                      <span className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: CLIENT_STATUS_COLORS[c.name] }} />
                        {c.name}
                      </span>
                      <span className="font-mono font-semibold">{c.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-[10px] text-gray-400 mt-2">
                Active = an order in the last {ACTIVE_WINDOW_MONTHS}{' '}months, from the deal tickets. System-computed, never set by hand.{' '}
                {!!datesCapped && ` ${datesCapped} contact number${datesCapped === 1 ? '' : 's'} beyond the ${ORDER_DETAIL_PHONE_CAP}-number cap were not date-checked and count as Unknown.`}
                {!!datesFailed && ` ${datesFailed} number${datesFailed === 1 ? '' : 's'} could not be read.`}
              </p>
            </>
          )}
        </Panel>

        <Panel title="Revenue by Source">
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="45%" height={150}>
              <PieChart>
                <Pie data={revenueBySource.filter((s) => s.value > 0)} dataKey="value" nameKey="source" cx="50%" cy="50%" innerRadius={30} outerRadius={62} paddingAngle={2}>
                  {revenueBySource.filter((s) => s.value > 0).map((_, i) => <Cell key={i} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => fmtL(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 flex flex-col gap-2">
              {revenueBySource.map((s, i) => (
                <div key={s.source} className="flex items-center justify-between text-[13px]">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: SOURCE_COLORS[i % SOURCE_COLORS.length] }} />
                    {s.source}
                  </span>
                  <span className="font-mono font-semibold">{fmtL(s.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      {kamDash && <KamDashboardSection k={kamDash} monthlyTarget={monthlyTarget} unresolved={unresolvedOrders} />}

      <Panel title="Run Rate vs Required Run Rate" className="mt-3">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Current Run Rate</div>
            <div className="font-mono text-xl font-bold text-black mt-1">{fmtL(runRate)}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Required Run Rate</div>
            <div className="font-mono text-xl font-bold text-black mt-1">{fmtL(monthlyTarget)}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Gap</div>
            <div className="font-mono text-xl font-bold text-red-500 mt-1">{gap < 0 ? '-' : ''}{fmtL(Math.abs(gap))}</div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
