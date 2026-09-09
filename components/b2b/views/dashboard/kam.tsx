'use client';

import { KamDashboard } from '../../models/analytics';
import { ACTIVE_WINDOW_MONTHS } from '../../models/clientModel';
import { DAILY_CALL_TARGET } from '../../models/kamModel';
import { INBOUND_STAGE_COLORS, fmtL } from '../../models/mockData';
import { Bars, Panel, Tile } from './ui';

export function KamDashboardSection({ k, monthlyTarget, unresolved }: { k: KamDashboard; monthlyTarget: number; unresolved: number }) {
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
  const compliancePct = pct(k.complianceTotals.logged, k.complianceTotals.target);

  return (
    <>

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
