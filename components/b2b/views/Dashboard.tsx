'use client';

import { useCallback, useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { INBOUND_STAGE_COLORS, fmtL, fmtINR } from '../models/mockData';
import {
  fetchB2BData, fetchTargets, fetchB2BPipelineStats, fetchVerticalStats, istToday,
  fetchClientOrderHistories, fetchClientOrderRows, orderDatesFromRows,
  clientMetricsFrom, firstOrderValue, ORDER_DETAIL_PHONE_CAP, resolveKamOrders,
  type B2BData, type B2BPipelineStats, type VerticalStats,
} from '@/lib/b2bLeads';
import { computeDashboard, computeKamDashboard, type ClientMetricsMap, type DashboardMetrics, type KamDashboard } from '../models/analytics';
import {
  buildHealthOverview, ESCALATION_CATEGORIES, HEALTH_META, HEALTH_WINDOW_DAYS,
  type HealthOverview, type HealthStatus,
} from '../models/accountHealth';
import {
  contactNumbers, CLIENT_STATUS_COLORS, CLIENT_STATUS_HINT, ACTIVE_WINDOW_MONTHS,
  type ClientEntity, type ClientStatus,
} from '../models/clientModel';
import { DAILY_CALL_TARGET } from '../models/kamModel';

const CLIENT_STATUS_ORDER: ClientStatus[] = ['Active', 'Inactive', 'Unknown'];
const SOURCE_COLORS = ['#1A1A1A', '#EAB308', '#0F766E', '#C2410C'];

function MetricCard({ label, value, sub, subTone }: { label: string; value: string; sub?: string; subTone?: 'muted' | 'warn' }) {
  return (
    <div className="bg-white rounded-lg px-5 py-4 border border-gray-200">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className="font-mono text-[26px] leading-tight font-bold text-black mt-1">{value}</div>
      {sub && <div className={`text-[11px] mt-1 ${subTone === 'warn' ? 'text-red-500 font-medium' : 'text-gray-400'}`}>{sub}</div>}
    </div>
  );
}

function Panel({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-5 ${className}`}>
      <div className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-4">{title}</div>
      {children}
    </div>
  );
}

// Created-date windows for the pipeline strip. 'all' sends no date filter.
type RangeKey = 'month' | 'lastMonth' | 'all';

const RANGE_LABELS: Record<RangeKey, string> = {
  month: 'This Month',
  lastMonth: 'Last Month',
  all: 'All Time',
};

// IST day arithmetic — the API filters created dates on the Indian day.
function rangeFor(key: RangeKey, now: Date): { from?: string; to?: string } {
  if (key === 'all') return {};
  const today = istToday(now);
  const [y, m] = today.split('-').map(Number);
  if (key === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const mm = String(pm).padStart(2, '0');
  const lastDay = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  return { from: `${py}-${mm}-01`, to: `${py}-${mm}-${lastDay}` };
}

// ── Account health widget ─────────────────────────────────────────────────────

function HealthPill({ status }: { status: HealthStatus }) {
  const meta = HEALTH_META[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
      style={{ background: meta.color + '18', color: meta.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}

// What the brief asks to happen at each level. These are flags for a human to
// act on — nothing is dispatched from here, since this app has no notification
// transport of its own.
const HEALTH_ACTION: Record<HealthStatus, string> = {
  green: '—',
  amber: 'Notify KAM to intervene',
  red: 'Escalate to manager',
};

function HealthTile({ status, count, pipeline, active }: {
  status: HealthStatus;
  count: number;
  pipeline: number;
  active: boolean;
}) {
  const meta = HEALTH_META[status];
  return (
    <div
      className="rounded-lg border px-4 py-3 transition-colors"
      style={{
        borderColor: active ? meta.color : '#E5E7EB',
        background: active ? meta.color + '0D' : '#FFFFFF',
      }}
    >
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.color }} />
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: meta.color }}>{meta.label}</span>
      </div>
      <div className="font-mono text-[26px] leading-tight font-bold text-black mt-1">{count}</div>
      <div className="text-[11px] text-gray-400 mt-0.5">{fmtL(pipeline)} active pipeline</div>
      <div className="text-[10px] text-gray-400 mt-1 leading-snug">{meta.description}</div>
    </div>
  );
}

function AccountHealthPanel({ overview }: { overview: HealthOverview }) {
  const [filter, setFilter] = useState<HealthStatus | null>(null);
  const total = overview.rows.length;

  const listed = filter
    ? overview.rows.filter((r) => r.health.status === filter)
    : overview.attention;

  return (
    <Panel title="Account Health" className="mt-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap -mt-2 mb-3">
        <p className="text-[11px] text-gray-400">
          {total} account{total === 1 ? '' : 's'} scored on escalations in the last {HEALTH_WINDOW_DAYS}{' '}days.{' '}
          Resolved issues decay automatically, so a score recovers on its own.
        </p>
        <div className="flex items-baseline gap-3">
          <span className="text-[11px] text-gray-400">
            <span className="font-mono font-bold text-gray-700">{overview.escalationCount}</span> escalations logged
          </span>
          <span className="text-[11px] text-gray-400">
            <span className="font-mono font-bold text-gray-700">{overview.openCount}</span> still open
          </span>
        </div>
      </div>

      {/* Tiles double as a filter — clicking one lists those accounts. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {(['red', 'amber', 'green'] as HealthStatus[]).map((s) => (
          <button key={s} onClick={() => setFilter(filter === s ? null : s)} className="text-left cursor-pointer">
            <HealthTile status={s} count={overview.counts[s]} pipeline={overview.pipelineAtRisk[s]} active={filter === s} />
          </button>
        ))}
      </div>

      {/* Category mix — which kind of issue is actually driving the reds. */}
      {overview.escalationCount > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {ESCALATION_CATEGORIES.map((c) => (
            <span key={c} className="inline-flex items-baseline gap-1 px-2 py-0.5 rounded-md bg-gray-50 text-[11px] text-gray-500">
              <span className="font-mono font-bold text-gray-700">{overview.byCategory[c]}</span>
              {c}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            {filter ? `${HEALTH_META[filter].label} accounts` : 'Needs attention'}
          </span>
          {filter && (
            <button onClick={() => setFilter(null)} className="text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer">
              Show all at-risk
            </button>
          )}
        </div>

        {!listed.length ? (
          <p className="text-[11px] text-gray-300 text-center py-4">
            {filter ? 'No accounts at this level.' : 'Every account is healthy — no escalations in the window.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] min-w-[560px]">
              <thead>
                <tr className="text-gray-400 text-[9px] uppercase tracking-wider border-b border-gray-100">
                  <th className="text-left font-semibold py-1.5 pr-2">Account</th>
                  <th className="text-left font-semibold py-1.5 pr-2">KAM</th>
                  <th className="text-left font-semibold py-1.5 pr-2">Health</th>
                  <th className="text-right font-semibold py-1.5 pr-2">Esc.</th>
                  <th className="text-right font-semibold py-1.5 pr-2">Active Pipeline</th>
                  <th className="text-left font-semibold py-1.5">Action</th>
                </tr>
              </thead>
              <tbody>
                {listed.map(({ client, health, activePipeline }) => (
                  <tr key={client.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-1.5 pr-2">
                      <div className="font-medium text-gray-700">{client.company}</div>
                      <div className="text-[10px] text-gray-400">
                        {health.reason}
                        {health.daysToRecovery !== null && ` · recovers in ${health.daysToRecovery}d`}
                        {health.openTier1 && <span className="text-red-500 font-semibold"> · tier-1 open</span>}
                      </div>
                    </td>
                    <td className="py-1.5 pr-2 text-gray-500 whitespace-nowrap">{client.kam}</td>
                    <td className="py-1.5 pr-2"><HealthPill status={health.status} /></td>
                    <td className="py-1.5 pr-2 text-right font-mono text-gray-600">
                      {health.activeCount}
                      {health.escalationCount !== health.activeCount && (
                        <span className="text-gray-300"> / {health.escalationCount}</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono font-semibold text-gray-700 whitespace-nowrap">{fmtL(activePipeline)}</td>
                    <td className="py-1.5 text-gray-500">{HEALTH_ACTION[health.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Panel>
  );
}

// ── KAM PRD §6 ────────────────────────────────────────────────────────────────
//
// One rule runs through every rupee below and it is worth stating once: a
// figure from a deal ticket and a figure a rep typed are NEVER added together.
// Pipeline tiles show both, side by side, labelled — because at Quote Shared no
// ticket exists yet, so the estimate is the only number there is, and calling
// it pipeline without saying so is how the old board reported a guess as money.

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-3 py-2.5">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 truncate" title={label}>{label}</div>
      <div className="font-mono text-lg font-bold mt-0.5" style={{ color: tone || '#111827' }}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-0.5 leading-tight">{sub}</div>}
    </div>
  );
}

function Bars({ rows, colorFor }: { rows: { label: string; count: number }[]; colorFor?: (label: string) => string }) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500 w-28 shrink-0 truncate" title={r.label}>{r.label}</span>
          <div className="flex-1 h-3.5 bg-gray-100 rounded-sm overflow-hidden">
            <div className="h-full rounded-sm" style={{ width: `${(r.count / max) * 100}%`, background: colorFor?.(r.label) || '#0F766E' }} />
          </div>
          <span className="text-[11px] font-mono font-semibold text-gray-700 w-8 text-right">{r.count}</span>
        </div>
      ))}
    </div>
  );
}

function KamDashboardSection({ k, monthlyTarget, unresolved }: { k: KamDashboard; monthlyTarget: number; unresolved: number }) {
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
  const compliancePct = pct(k.complianceTotals.logged, k.complianceTotals.target);

  return (
    <>
      {/* §6 — Today's / month pipeline, and the three source pipelines */}
      <Panel title="KAM Module §6 · Pipeline" className="mt-3">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
          <Tile
            label="Today's Pipeline"
            value={fmtL(k.todayPipeline.pipeline)}
            sub={`${k.todayPipeline.count} order${k.todayPipeline.count === 1 ? '' : 's'}${k.todayPipeline.estimatedPipeline ? ` · ${fmtL(k.todayPipeline.estimatedPipeline)} est.` : ''}`}
          />
          <Tile
            label="Pipeline this month"
            value={fmtL(k.monthPipeline.pipeline)}
            sub={`${k.monthPipeline.count} order${k.monthPipeline.count === 1 ? '' : 's'}${k.monthPipeline.estimatedPipeline ? ` · ${fmtL(k.monthPipeline.estimatedPipeline)} est.` : ''}`}
          />
          {k.verticals.map((v) => (
            <Tile
              key={v.label}
              label={`${v.label} Pipeline`}
              value={fmtL(v.pipeline)}
              tone={v.label === 'KAM' ? '#0F766E' : undefined}
              sub={`${v.count} at ${v.statuses.join(' / ')}${v.estimatedPipeline ? ` · ${fmtL(v.estimatedPipeline)} est.` : ''}`}
            />
          ))}
        </div>
        <p className="text-[10px] text-gray-400 mt-2">
          §6.1: pipeline is the deal-ticket order value on orders at Quote Shared or PI Shared, split by source.
          “est.” beside a tile is the reps’ own estimate on the same orders — an order at Quote Shared has no ticket
          yet, so that is the only figure available. The two are never summed.
        </p>
      </Panel>

      {/* §6 — Target vs revenue, and the revenue split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
        <Panel title="Target vs Revenue">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-2xl font-bold text-gray-800">{fmtL(k.revenue.total)}</span>
            <span className="text-[12px] text-gray-400">of {fmtL(monthlyTarget)}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-[#0F766E] rounded-full" style={{ width: `${Math.min(100, pct(k.revenue.total, monthlyTarget))}%` }} />
          </div>
          <div className="text-[11px] text-gray-400 mt-1">{pct(k.revenue.total, monthlyTarget)}% achieved · closed orders only, at deal-ticket value</div>
          {!!unresolved && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 mt-2">
              {unresolved} closed or open KAM order{unresolved === 1 ? '' : 's'} carr{unresolved === 1 ? 'ies' : 'y'}{' '}
              an Enquiry ID that has not resolved to a deal ticket, so {unresolved === 1 ? 'it counts' : 'they count'}{' '}
              as ₹0 here. A KAM order&apos;s revenue is the ticket&apos;s figure, never the estimate typed on the order —
              open the <span className="font-semibold">KAM</span> tab to retry the fetch, or fix the Enquiry ID on the order.
            </p>
          )}
        </Panel>

        <Panel title="Total Revenue Split">
          <div className="grid grid-cols-3 gap-2">
            {([['Inbound', k.revenue.inbound], ['Outreach', k.revenue.outreach], ['KAM', k.revenue.kam]] as const).map(([label, v]) => (
              <div key={label}>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
                <div className="font-mono text-base font-bold text-gray-800 mt-0.5">{fmtL(v)}</div>
                <div className="text-[10px] text-gray-400">{pct(v, k.revenue.total)}%</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* §6 — the three funnels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-3">
        <Panel title="Inbound Funnel">
          <Bars rows={k.funnels.inbound} colorFor={(l) => (INBOUND_STAGE_COLORS as Record<string, string>)[l] || '#0F766E'} />
        </Panel>
        <Panel title="Outreach Funnel">
          <Bars rows={k.funnels.outreach} />
        </Panel>
        <Panel title="KAM Funnel">
          <Bars
            rows={k.funnels.kam.steps.map((s) => ({ label: s.label, count: s.count }))}
            colorFor={(l) => (l === 'Closed' ? '#22C55E' : l === 'Lost' ? '#EF4444' : '#8B5CF6')}
          />
          <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-gray-500">
            {k.funnels.kam.winRate !== undefined && <span>Win rate <span className="font-mono font-bold text-gray-700">{Math.round(k.funnels.kam.winRate * 100)}%</span></span>}
            {k.funnels.kam.averageCycleDays !== undefined && <span>Avg cycle <span className="font-mono font-bold text-gray-700">{k.funnels.kam.averageCycleDays}d</span></span>}
            {!!k.funnels.kam.untimed && <span className="text-amber-600">{k.funnels.kam.untimed} untimed</span>}
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5">
            Counted on each order’s current status — nothing records when an order passed through a status it has
            since left, so each step reads “standing here or beyond”. Orders with no status date are reported as
            untimed, not counted into a range.
          </p>
        </Panel>
      </div>

      {/* §6 — cohort + SPOC split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
        <Panel title="New Clients by Month · Inbound + Outreach + KAM Cohort">
          {!k.cohort.length ? (
            <p className="text-[11px] text-gray-300 py-6 text-center">No clients in the master yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] min-w-[320px]">
                <thead>
                  <tr className="text-gray-400 text-[9px] uppercase tracking-wider border-b border-gray-100">
                    <th className="text-left font-semibold py-1.5">Month</th>
                    <th className="text-right font-semibold py-1.5">Inbound</th>
                    <th className="text-right font-semibold py-1.5">Outreach</th>
                    <th className="text-right font-semibold py-1.5">Existing</th>
                    <th className="text-right font-semibold py-1.5">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {k.cohort.map((m) => (
                    <tr key={m.month} className="border-b border-gray-50 last:border-0">
                      <td className="py-1.5 font-mono text-gray-600">{m.month}</td>
                      <td className="py-1.5 text-right font-mono text-gray-600">{m.inbound}</td>
                      <td className="py-1.5 text-right font-mono text-gray-600">{m.outreach}</td>
                      <td className="py-1.5 text-right font-mono text-gray-600">{m.existing}</td>
                      <td className="py-1.5 text-right font-mono font-bold text-gray-800">{m.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="KAM Accounts, SPOC-wise">
          {!k.spocSplit.length ? (
            <p className="text-[11px] text-gray-300 py-6 text-center">No KAM holds an account or an order yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] min-w-[480px]">
                <thead>
                  <tr className="text-gray-400 text-[9px] uppercase tracking-wider border-b border-gray-100">
                    <th className="text-left font-semibold py-1.5">KAM</th>
                    <th className="text-right font-semibold py-1.5">Clients</th>
                    <th className="text-right font-semibold py-1.5">Active</th>
                    <th className="text-right font-semibold py-1.5">Open orders</th>
                    <th className="text-right font-semibold py-1.5">Pipeline</th>
                    <th className="text-right font-semibold py-1.5">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {k.spocSplit.map((r) => (
                    <tr key={r.kam} className="border-b border-gray-50 last:border-0">
                      <td className="py-1.5 text-gray-700 font-medium whitespace-nowrap">{r.kam}</td>
                      <td className="py-1.5 text-right font-mono text-gray-600">{r.clients}</td>
                      <td className="py-1.5 text-right font-mono text-gray-600">
                        {r.active}
                        {!!r.unknown && <span className="text-blue-400" title={`${r.unknown} account(s) with unreadable order dates`}> +{r.unknown}?</span>}
                      </td>
                      <td className="py-1.5 text-right font-mono text-gray-600">{r.openOrders}</td>
                      <td className="py-1.5 text-right font-mono text-gray-600 whitespace-nowrap">{fmtL(r.pipeline)}</td>
                      <td className="py-1.5 text-right font-mono font-bold text-gray-800 whitespace-nowrap">{fmtL(r.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {/* §4.1 measured, §3.2 measured — the two §6.2 additions this module's own
          sections already promise. The other six are flagged in the PRD "for
          review rather than assuming they're wanted" and are not built. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
        <Panel title="Call Compliance · §4.1">
          <div className="flex items-baseline justify-between mb-2">
            <span className="font-mono text-2xl font-bold text-gray-800">{k.complianceTotals.logged}</span>
            <span className="text-[12px] text-gray-400">of {k.complianceTotals.target} calls today ({DAILY_CALL_TARGET}/KAM)</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, compliancePct)}%`, background: compliancePct >= 100 ? '#22C55E' : compliancePct >= 60 ? '#F59E0B' : '#EF4444' }} />
          </div>
          {!k.compliance.length ? (
            <p className="text-[11px] text-gray-300 py-2 text-center">No KAM holds an account yet.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {k.compliance.map((c) => (
                <div key={c.kam} className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-700">{c.kam}</span>
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-gray-600">{c.logged}/{c.target}</span>
                    {!!c.dueToday && <span className="text-amber-600">{c.dueToday} due</span>}
                    {!!c.overdueFollowUps && <span className="text-red-600 font-semibold">{c.overdueFollowUps} overdue</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-gray-400 mt-2">
            Reported, not enforced — PRD open question #2 asks whether missing the target should flag, and nothing is
            blocked by it today. Calls are counted once per client per day, because a double-save is not two calls.
          </p>
        </Panel>

        <Panel title="Account Temperature · §3.2">
          <div className="grid grid-cols-3 gap-2 mb-3">
            {k.temperature.bands.map((b) => (
              <div key={b.key} className="rounded-md px-2 py-2" style={{ background: b.color + '0F' }}>
                <div className="font-mono text-lg font-bold" style={{ color: b.color }}>{b.count}</div>
                <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-500 leading-tight">{b.label}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 text-[11px] text-gray-500 mb-2">
            <span>{k.temperature.unscored} never scored</span>
            {!!k.temperature.dropped && <span className="text-red-600 font-semibold">{k.temperature.dropped} dropped since the last reading</span>}
          </div>
          {!!k.temperature.mismatches.length && (
            <div className="border-t border-gray-100 pt-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                Score vs the record · {k.temperature.mismatches.length}
              </div>
              <div className="flex flex-col gap-1 max-h-[120px] overflow-y-auto">
                {k.temperature.mismatches.slice(0, 8).map((m, i) => (
                  <div key={i} className="text-[11px]">
                    <span className="font-medium text-gray-700">{m.company}</span>
                    <span className="text-gray-400"> — {m.message}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5">
                PRD open question #5: temperature stays the KAM’s judgement. These are reported, never overridden.
              </p>
            </div>
          )}
        </Panel>
      </div>

      {!!k.atRisk.length && (
        <Panel title={`At-Risk Accounts · ${k.atRisk.length}`} className="mt-3">
          <p className="text-[11px] text-gray-400 -mt-2 mb-2">
            Active clients within 30 days of the {ACTIVE_WINDOW_MONTHS}-month Inactive cutoff with no follow-up booked.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] min-w-[420px]">
              <thead>
                <tr className="text-gray-400 text-[9px] uppercase tracking-wider border-b border-gray-100">
                  <th className="text-left font-semibold py-1.5">Account</th>
                  <th className="text-left font-semibold py-1.5">KAM</th>
                  <th className="text-right font-semibold py-1.5">Days to Inactive</th>
                  <th className="text-left font-semibold py-1.5">Last contact</th>
                </tr>
              </thead>
              <tbody>
                {k.atRisk.slice(0, 12).map((r) => (
                  <tr key={r.company} className="border-b border-gray-50 last:border-0">
                    <td className="py-1.5 font-medium text-gray-700">{r.company}</td>
                    <td className="py-1.5 text-gray-500">{r.kam || '—'}</td>
                    <td className="py-1.5 text-right font-mono font-bold" style={{ color: r.daysLeft <= 7 ? '#DC2626' : '#EA580C' }}>{r.daysLeft}d</td>
                    <td className="py-1.5 text-gray-500">{r.lastContact || <span className="text-gray-300">never</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}

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
      // Revenue, target % and run rate are month-to-date by definition — the
      // target is monthly — so they ignore the range selector and always read
      // the current month. Only the pipeline/revenue-split panels follow it,
      // and when the selector already is 'This Month' the same fetch serves both.
      const selected = rangeFor(range, now);
      const [fetched, targets, pipeline, byVertical, monthVertical] = await Promise.all([
        fetchB2BData(), fetchTargets(), fetchB2BPipelineStats(selected),
        fetchVerticalStats(selected),
        range === 'month' ? Promise.resolve(null) : fetchVerticalStats(rangeFor('month', now)),
      ]);
      let data = fetched;
      const today = istToday(now);

      // ── A KAM order's revenue is the deal ticket's figure, so an order whose
      //    Enquiry ID has not been resolved yet contributes ₹0. That is right,
      //    but it must not make the whole revenue tile read ₹0 just because
      //    nobody has opened the KAM tab since the last order was raised — so
      //    the dashboard resolves for DISPLAY here.
      //
      //    It deliberately does not WRITE what it resolves. The KAM tab owns
      //    persistence (it is where a rep is looking when a status advances off
      //    a ticket); two surfaces writing the same rows on load is how the
      //    duplicate auto-advance note got onto a live row in the first place.
      const { resolutions } = await resolveKamOrders(data.kam);
      const resolvedById = new Map(resolutions.filter((r) => r.resolved).map((r) => [r.order.id, r.resolved!]));
      const kamUnresolved = data.kam.filter((o) =>
        !!String(o.enqId || '').trim() && !resolvedById.has(o.id) && o.orderValue === undefined).length;
      data = { ...data, kam: data.kam.map((o) => resolvedById.get(o.id) ?? o) };
      setUnresolvedOrders(kamUnresolved);

      // ── Client metrics: two sources, each with its own failure state ──
      //
      // The batched endpoint gives counts and values for every client in one
      // request. Last Order Placed — and therefore Active/Inactive — needs the
      // per-phone ticket pass, which is one request per number, so it is capped
      // and the overflow is REPORTED rather than quietly dropped: an uncounted
      // client reads as Unknown, never as Inactive.
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

      // Account health is scored off each CLIENT's escalation log — it moved off
      // the KAM board rows when clients and orders were split apart. The "active
      // pipeline" beside each status is that client's own open cart value from
      // the deal tickets, summed across every number on the account.
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

      {/* A half-loaded dashboard says so. A page quietly showing only the inbound
          half looks exactly like a CRM with no KAM orders. */}
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

      {/* ── Pipeline strip — B2B-branch cart values from /crm/leads/stats/ ── */}
      {/* Scoped by cart created-date, exactly like the Leads tab's Created filter,
          so a B2B-filtered Leads tab over the same window reports the same rupees. */}
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

      {/* ── Cart status breakdown (B2B branch) ── */}
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

      {/* ── Top metric cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Revenue Generated" value={fmtL(monthRevenue)} sub={`of ${fmtL(monthlyTarget)} target`} />
        <MetricCard label="Target Achieved" value={`${achievedPct}%`} />
        <MetricCard label="Run Rate" value={fmtL(runRate)} sub={runRate < monthlyTarget ? 'Below required' : 'On track'} subTone={runRate < monthlyTarget ? 'warn' : 'muted'} />
        <MetricCard label="Month Projection" value={fmtL(runRate)} />
      </div>

      {/* ── Account health (escalation-driven RAG + pipeline at stake) ── */}
      {health && <AccountHealthPanel overview={health} />}

      {/* ── Revenue vs Target ── */}
      <Panel title="Revenue vs Target" className="mt-3">
        <div className="font-mono text-lg font-bold text-black">
          {fmtL(monthRevenue)} <span className="text-sm font-normal text-gray-400">of {fmtL(monthlyTarget)}</span>
        </div>
        <div className="h-2 rounded-full bg-gray-200 overflow-hidden mt-3">
          <div className="h-full bg-[#0F766E] rounded-full transition-[width] duration-500" style={{ width: `${achievedPct}%` }} />
        </div>
        <div className="text-[11px] text-gray-400 mt-2">{achievedPct}% of monthly target achieved</div>
      </Panel>

      {/* ── Pipeline by Stage ── */}
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

      {/* ── Pipeline by Vertical ── */}
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

      {/* ── Client + Source pies ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
        {/* Active / Inactive / Unknown — three states, because a client whose
            order dates could not be read has NOT gone quiet, and rendering it
            as Inactive would have a KAM stand down an account that is still
            ordering. Client DB PRD §2.1. */}
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

      {/* ── Run rate vs required ── */}
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
