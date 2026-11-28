'use client';

import { FLOW_MONTHS, monthWindows } from '@/lib/b2b/revenue';
import { ReactNode, useMemo, useState } from 'react';
import { useMonthReports } from '../hooks/use-month-reports';
import { useClientFlow } from './hooks/use-client-flow';
import { useUnregistered } from './hooks/use-unregistered';
import { Journey } from './journey';
import { ClientMovement } from './movement';

export function ClientsTab({ head }: { head: (right: ReactNode) => ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const windows = useMemo(() => monthWindows(new Date(), FLOW_MONTHS), []);
  const reports = useMonthReports(windows, refreshKey);
  const flow = useClientFlow(refreshKey);
  const unregistered = useUnregistered(refreshKey);
  const busy = flow.loading || windows.some((w) => reports[w.key]?.loading);

  return (
    <>
      {head(
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={busy}
          className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-lg bg-white text-gray-600 hover:border-gray-300 cursor-pointer disabled:opacity-50 disabled:cursor-default"
        >
          {busy ? 'Loading…' : 'Refresh'}
        </button>,
      )}
      <Journey windows={windows} reports={reports} flow={flow.flow} />
      <ClientMovement flow={flow.flow} error={flow.error} reload={flow.reload} unregistered={unregistered} />
    </>
  );
}
