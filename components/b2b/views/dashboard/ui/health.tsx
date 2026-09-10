'use client';

import { ESCALATION_CATEGORIES, HEALTH_META, HEALTH_WINDOW_DAYS, HealthOverview, HealthStatus } from '../../../models/account-health';
import { fmtL } from '../../../models/mock-data';
import { HEALTH_ACTION } from '../constants';
import { Panel } from '.';
import { useState } from 'react';

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

export function AccountHealthPanel({ overview }: { overview: HealthOverview }) {
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {(['red', 'amber', 'green'] as HealthStatus[]).map((s) => (
          <button key={s} onClick={() => setFilter(filter === s ? null : s)} className="text-left cursor-pointer">
            <HealthTile status={s} count={overview.counts[s]} pipeline={overview.pipelineAtRisk[s]} active={filter === s} />
          </button>
        ))}
      </div>

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
