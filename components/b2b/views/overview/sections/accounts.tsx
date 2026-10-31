'use client';

import { HEALTH_META, HealthOverview, HealthStatus } from '../../../models/account-health';
import type { KamDashboard } from '../../../models/analytics';
import { ACTIVE_DAYS, CLIENT_STATUS_SCALE, ClientEntity, ClientStatus, INACTIVE_DAYS } from '../../../models/client';
import { fmtL } from '../../../models/mock-data';
import { ATTENTION_ROWS, CLIENT_STATUS_ORDER, COHORT_MONTHS, TEAM_COLORS } from '../constants';
import { OverviewTarget } from '../types';
import { Card, LinkButton, SectionHead, Segmented, StackBar } from '../ui';
import { useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

const EXISTING_COLOR = '#9CA3AF';

function ClientBook({ clients, k, empty, onOpen }: {
  clients: Record<ClientStatus, number>;
  k: KamDashboard;
  empty: boolean;
  onOpen?: () => void;
}) {
  const total = CLIENT_STATUS_ORDER.reduce((t, s) => t + clients[s], 0);
  const cohort = k.cohort.slice(-COHORT_MONTHS);

  return (
    <Card>
      <SectionHead
        title="Client book"
        hint={`Active = ordered in the last ${ACTIVE_DAYS} days. Inactive 1 month = ${ACTIVE_DAYS + 1}–${INACTIVE_DAYS} days. Inactive = longer. Never ordered is counted apart. Computed from deal tickets.`}
        right={<LinkButton onClick={onOpen}>Client Database</LinkButton>}
      />
      {empty ? (
        <p className="text-[12px] text-gray-400 py-8 text-center">The Client Database is empty — seed it and this fills in.</p>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="tabular-nums text-[28px] font-bold text-gray-900 leading-none">{total}</span>
            <span className="text-[12px] text-gray-400">firms</span>
          </div>
          <div className="mt-3">
            <StackBar
              height="h-3"
              parts={CLIENT_STATUS_ORDER.map((s) => ({ key: s, value: clients[s], color: CLIENT_STATUS_SCALE.colors[s] }))}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
            {CLIENT_STATUS_ORDER.map((s) => (
              <div key={s} title={CLIENT_STATUS_SCALE.hint[s]}>
                <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <span className="w-2 h-2 rounded-sm" style={{ background: CLIENT_STATUS_SCALE.colors[s] }} />
                  {s}
                </div>
                <div className="tabular-nums text-base font-bold text-gray-800">{clients[s]}</div>
              </div>
            ))}
          </div>

          {!!cohort.length && (
            <div className="mt-5 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[11px] text-gray-500">New clients by month</span>
                <span className="flex gap-3 text-[10px] text-gray-500">
                  {([['Inbound', TEAM_COLORS.inbound], ['Outreach', TEAM_COLORS.outreach], ['Existing', EXISTING_COLOR]] as const).map(([l, c]) => (
                    <span key={l} className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: c }} />{l}</span>
                  ))}
                </span>
              </div>
              <div className="h-[110px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cohort} maxBarSize={36} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                    <Tooltip cursor={{ fill: '#F3F4F6' }} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Bar dataKey="inbound" name="Inbound" stackId="a" fill={TEAM_COLORS.inbound} />
                    <Bar dataKey="outreach" name="Outreach" stackId="a" fill={TEAM_COLORS.outreach} />
                    <Bar dataKey="existing" name="Existing" stackId="a" fill={EXISTING_COLOR} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

type AttentionTab = 'lapsing' | 'escalated';

function Attention({ k, health, onOpen }: {
  k: KamDashboard;
  health: HealthOverview<ClientEntity>;
  onOpen?: () => void;
}) {
  const [tab, setTab] = useState<AttentionTab>('lapsing');
  const tabs: Record<AttentionTab, string> = {
    lapsing: `Going inactive · ${k.atRisk.length}`,
    escalated: `Escalations · ${health.attention.length}`,
  };

  return (
    <Card>
      <SectionHead
        title="Needs attention"
        hint={`Going inactive: no order in ${ACTIVE_DAYS} days and no follow-up booked (or one overdue), with days left until ${INACTIVE_DAYS}. Escalations: firms scored Critical or At risk on the last 60 days of escalations.`}
        right={<Segmented options={tabs} value={tab} onChange={setTab} />}
      />

      <div className="flex gap-2 mb-3">
        {(['red', 'amber', 'green'] as HealthStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5 rounded-full bg-gray-50 px-2.5 py-1 text-[11px] text-gray-600">
            <span className="w-2 h-2 rounded-full" style={{ background: HEALTH_META[s].color }} />
            {HEALTH_META[s].label} <span className="tabular-nums font-bold text-gray-800">{health.counts[s]}</span>
          </span>
        ))}
      </div>

      {tab === 'lapsing' ? (
        !k.atRisk.length ? (
          <p className="text-[12px] text-gray-400 py-8 text-center">No firm is about to go inactive.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {k.atRisk.slice(0, ATTENTION_ROWS).map((r) => (
              <li key={r.company} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="text-[12px] font-medium text-gray-800 truncate">{r.company}</div>
                  <div className="text-[11px] text-gray-400 truncate">{r.kam || 'No KAM'} · last contact {r.lastContact || 'never'}</div>
                </div>
                <span className={`tabular-nums text-[11px] font-bold whitespace-nowrap ${r.daysLeft <= 7 ? 'text-red-600' : 'text-amber-600'}`}>
                  {r.daysLeft}d left
                </span>
              </li>
            ))}
          </ul>
        )
      ) : !health.attention.length ? (
        <p className="text-[12px] text-gray-400 py-8 text-center">No escalations in the last 60 days.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {health.attention.slice(0, ATTENTION_ROWS).map(({ client, health: h, activePipeline }) => (
            <li key={client.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="text-[12px] font-medium text-gray-800 truncate">{client.company}</div>
                <div className="text-[11px] text-gray-400 truncate">{client.kam || 'No KAM'} · {h.reason}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[11px] font-semibold" style={{ color: HEALTH_META[h.status].color }}>{HEALTH_META[h.status].label}</div>
                <div className="tabular-nums text-[10px] text-gray-400">{fmtL(activePipeline)} open</div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(tab === 'lapsing' ? k.atRisk.length : health.attention.length) > ATTENTION_ROWS && (
        <div className="mt-2 text-right"><LinkButton onClick={onOpen}>See all in Client Database</LinkButton></div>
      )}
    </Card>
  );
}

export function AccountsSection({ clients, empty, k, health, onNavigate }: {
  clients: Record<ClientStatus, number>;
  empty: boolean;
  k: KamDashboard;
  health: HealthOverview<ClientEntity>;
  onNavigate?: (t: OverviewTarget) => void;
}) {
  const open = onNavigate && (() => onNavigate('clients'));
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <ClientBook clients={clients} k={k} empty={empty} onOpen={open} />
      <Attention k={k} health={health} onOpen={open} />
    </div>
  );
}
