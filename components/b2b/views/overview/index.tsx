'use client';

import { b2bTargetL } from '../../models/performance';
import { RANGE_LABELS } from './constants';
import { useOverviewData } from './hooks/use-overview-data';
import { AccountsSection } from './sections/accounts';
import { JourneySection } from './sections/journey';
import { KamDesk } from './sections/kam-desk';
import { OrdersSection } from './sections/orders';
import { RevenueSection } from './sections/revenue';
import { OverviewTarget } from './types';
import { Notice } from './ui';
import { OpenPipelineDrawer } from './ui/open-pipeline';
import { rangeFor } from './utils';
import type { B2BTeamLoad } from '@/lib/b2b/team/types';
import { useMemo, useState } from 'react';

export default function B2BOverview({ team, onNavigate }: {
  team: B2BTeamLoad;
  onNavigate?: (t: OverviewTarget) => void;
}) {
  const o = useOverviewData();
  const [openDrawer, setOpenDrawer] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const teamLive = !team.loading && !team.tableMissing && !team.error;
  const monthlyTarget = useMemo(
    () => (o.base ? b2bTargetL(team.members, teamLive, o.base.targetStore) * 1_00_000 : 0),
    [o.base, team.members, teamLive],
  );

  if (!o.base) {
    return (
      <div className="p-4 sm:p-6 text-sm text-gray-400">
        {o.refreshing ? 'Loading overview…' : (
          <>The overview could not be loaded. <button onClick={o.reload} className="text-[#0F766E] font-semibold cursor-pointer">Retry</button></>
        )}
      </div>
    );
  }

  const { base, ranged } = o;
  const selected = rangeFor(o.range, new Date());

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Overview</h1>
          <p className="text-[12px] text-gray-400 mt-0.5">B2B revenue, pipeline and accounts at a glance</p>
        </div>
        <div className="flex items-center gap-3">
          {o.updatedAt && (
            <span className="text-[11px] text-gray-400 hidden sm:inline">
              Updated {o.updatedAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}
            </span>
          )}
          <button
            onClick={() => { setRefreshKey((k) => k + 1); o.reload(); }}
            disabled={o.refreshing}
            className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-lg bg-white text-gray-600 hover:border-gray-300 cursor-pointer disabled:opacity-50 disabled:cursor-default"
          >
            {o.refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {!!base.failed.length && (
        <Notice title="Partly loaded.">{base.failed.join(', ')} could not be read, so the figures below leave {base.failed.length === 1 ? 'it' : 'them'} out. Refresh to retry.</Notice>
      )}
      {ranged && !ranged.statsOk && (
        <Notice title="Order stats could not be read.">The rupee figures show zero because the request failed, not because there are no orders. Refresh to retry.</Notice>
      )}
      {ranged && !ranged.basisApplied && (
        <Notice title="Counted by cart date.">This backend cannot count by order date yet, so the orders below are still by cart-created date.</Notice>
      )}
      {!base.targetsOk && (
        <Notice title="Targets could not be read.">The target shown is the built-in default, not your team&rsquo;s.</Notice>
      )}

      <RevenueSection target={monthlyTarget} refreshKey={refreshKey} />

      {ranged ? (
        <OrdersSection
          stats={ranged.stats}
          open={ranged.open}
          range={o.range}
          period={selected}
          basis={o.basis}
          busy={o.rangeBusy}
          onRange={o.setRange}
          onBasis={o.setBasis}
          onOpenPipeline={() => setOpenDrawer(true)}
        />
      ) : (
        <div className="h-40 rounded-xl border border-gray-200 bg-white animate-pulse" />
      )}

      <JourneySection k={base.kam} onNavigate={onNavigate} />
      <AccountsSection
        clients={base.dashboard.clients}
        empty={base.dashboard.clientMasterEmpty}
        k={base.kam}
        health={base.health}
        onNavigate={onNavigate}
      />
      <KamDesk k={base.kam} unresolved={base.unresolvedOrders} onNavigate={onNavigate} />

      {openDrawer && ranged && (
        <OpenPipelineDrawer
          from={selected.from}
          to={selected.to}
          rangeLabel={RANGE_LABELS[o.range]}
          value={ranged.open.value}
          count={ranged.open.count}
          onClose={() => setOpenDrawer(false)}
        />
      )}
    </div>
  );
}
