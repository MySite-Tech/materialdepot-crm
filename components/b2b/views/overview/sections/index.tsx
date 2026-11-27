'use client';

import { b2bTargetL } from '../../../models/performance';
import { useOverviewData } from '../hooks/use-overview-data';
import { OverviewTarget } from '../types';
import { Notice } from '../ui';
import { AccountsSection } from './accounts';
import { JourneySection } from './journey';
import { KamDesk } from './kam-desk';
import { RevenueSection } from './revenue';
import { ClientFunnel } from './revenue/funnel';
import type { B2BTeamLoad } from '@/lib/b2b/team/types';
import { ReactNode, useMemo, useState } from 'react';

export function OverviewSummary({ team, onNavigate, onAnalyse, head }: {
  team: B2BTeamLoad;
  onNavigate?: (t: OverviewTarget) => void;
  onAnalyse: () => void;
  head: (right: ReactNode) => ReactNode;
}) {
  const o = useOverviewData();
  const [refreshKey, setRefreshKey] = useState(0);

  const teamLive = !team.loading && !team.tableMissing && !team.error;
  const monthlyTarget = useMemo(
    () => (o.base ? b2bTargetL(team.members, teamLive, o.base.targetStore) * 1_00_000 : 0),
    [o.base, team.members, teamLive],
  );

  const { base } = o;

  return (
    <>
      {head(base && (
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
      ))}

      {!!base?.failed.length && (
        <Notice title="Partly loaded.">{base.failed.join(', ')} could not be read, so the figures below leave {base.failed.length === 1 ? 'it' : 'them'} out. Refresh to retry.</Notice>
      )}
      {base && !base.targetsOk && (
        <Notice title="Targets could not be read.">The target shown is the built-in default, not your team&rsquo;s.</Notice>
      )}

      <RevenueSection target={monthlyTarget} refreshKey={refreshKey} onAnalyse={onAnalyse} />
      <ClientFunnel refreshKey={refreshKey} />

      {base ? (
        <>
          <JourneySection k={base.kam} onNavigate={onNavigate} />
          <AccountsSection
            clients={base.dashboard.clients}
            empty={base.dashboard.clientMasterEmpty}
            k={base.kam}
            health={base.health}
            onNavigate={onNavigate}
          />
          <KamDesk k={base.kam} unresolved={base.unresolvedOrders} onNavigate={onNavigate} />
        </>
      ) : (
        <div className="text-sm text-gray-400">
          {o.refreshing ? 'Loading the pipeline, accounts and KAM desk…' : (
            <>The pipeline, accounts and KAM desk could not be loaded. <button onClick={o.reload} className="text-[#0F766E] font-semibold cursor-pointer">Retry</button></>
          )}
        </div>
      )}
    </>
  );
}
