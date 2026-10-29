'use client';

import type { KamDashboard } from '../../../models/analytics';
import { fmtL } from '../../../models/mock-data';
import { MUTED_STAGES, TEAM_COLORS } from '../constants';
import { OverviewTarget } from '../types';
import { pctOf } from '../utils';
import { Card, LinkButton, SectionHead } from '../ui';

type Stage = { label: string; count: number };

function Funnel({ stages, color }: { stages: Stage[]; color: string }) {
  const max = Math.max(...stages.map((s) => s.count), 1);
  return (
    <div className="flex flex-col gap-1.5">
      {stages.map((s) => (
        <div key={s.label} className="flex items-center gap-2" title={`${s.label}: ${s.count}`}>
          <span className="text-[11px] text-gray-500 w-28 shrink-0 truncate">{s.label}</span>
          <div className="flex-1 h-4 bg-gray-50 rounded overflow-hidden">
            <div
              className="h-full rounded transition-[width] duration-500"
              style={{
                width: `${s.count ? Math.max((s.count / max) * 100, 3) : 0}%`,
                background: MUTED_STAGES.has(s.label) ? '#D1D5DB' : color,
              }}
            />
          </div>
          <span className="text-[11px] tabular-nums font-semibold text-gray-700 w-9 text-right">{s.count}</span>
        </div>
      ))}
    </div>
  );
}

function conversion(stages: Stage[]): { value: string; sub: string } {
  const total = stages.filter((s) => s.label !== 'Invalid').reduce((t, s) => t + s.count, 0);
  const won = stages.find((s) => s.label === 'Closed')?.count ?? 0;
  return { value: `${pctOf(won, total)}%`, sub: `${won} of ${total} closed` };
}

function TeamCard({ name, color, stages, pipeline, live, rate, foot, onOpen }: {
  name: string;
  color: string;
  stages: Stage[];
  pipeline: number;
  live: number;
  rate: { label: string; value: string; sub: string };
  foot?: string;
  onOpen?: () => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 p-4 flex flex-col" style={{ borderTop: `3px solid ${color}` }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-bold text-gray-800">{name}</span>
        <LinkButton onClick={onOpen}>Open</LinkButton>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-3 mb-4">
        <div>
          <div className="text-[11px] text-gray-500">Live pipeline</div>
          <div className="tabular-nums text-lg font-bold text-gray-900">{fmtL(pipeline)}</div>
          <div className="text-[11px] text-gray-400">{live} at quote / PI</div>
        </div>
        <div>
          <div className="text-[11px] text-gray-500">{rate.label}</div>
          <div className="tabular-nums text-lg font-bold text-gray-900">{rate.value}</div>
          <div className="text-[11px] text-gray-400">{rate.sub}</div>
        </div>
      </div>
      <Funnel stages={stages} color={color} />
      {foot && <div className="text-[11px] text-gray-500 mt-3 pt-3 border-t border-gray-100">{foot}</div>}
    </div>
  );
}

export function JourneySection({ k, onNavigate }: { k: KamDashboard; onNavigate?: (t: OverviewTarget) => void }) {
  const v = (label: string) => k.verticals.find((x) => x.label === label);
  const kf = k.funnels.kam;
  const kamRate = {
    label: 'Win rate',
    value: kf.winRate !== undefined ? `${Math.round(kf.winRate * 100)}%` : '—',
    sub: kf.averageCycleDays !== undefined ? `${kf.averageCycleDays}-day avg cycle` : 'of decided orders',
  };

  return (
    <Card>
      <SectionHead
        title="Inbound → Outreach → KAM"
        hint="Where every lead and order stands right now, team by team. Live pipeline is the deal-ticket value on leads at Quote or PI shared."
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <TeamCard
          name="Inbound"
          color={TEAM_COLORS.inbound}
          stages={k.funnels.inbound}
          pipeline={v('Inbound')?.pipeline ?? 0}
          live={v('Inbound')?.count ?? 0}
          rate={{ label: 'Converted', ...conversion(k.funnels.inbound) }}
          onOpen={onNavigate && (() => onNavigate('inbound'))}
        />
        <TeamCard
          name="Outreach"
          color={TEAM_COLORS.outreach}
          stages={k.funnels.outreach}
          pipeline={v('Outreach')?.pipeline ?? 0}
          live={v('Outreach')?.count ?? 0}
          rate={{ label: 'Converted', ...conversion(k.funnels.outreach) }}
          onOpen={onNavigate && (() => onNavigate('outreach'))}
        />
        <TeamCard
          name="KAM"
          color={TEAM_COLORS.kam}
          stages={kf.steps}
          pipeline={v('KAM')?.pipeline ?? 0}
          live={v('KAM')?.count ?? 0}
          rate={kamRate}
          foot={kf.untimed ? `${kf.untimed} order${kf.untimed === 1 ? ' has' : 's have'} no status date` : undefined}
          onOpen={onNavigate && (() => onNavigate('kams'))}
        />
      </div>
    </Card>
  );
}
