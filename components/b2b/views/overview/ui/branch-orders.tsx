'use client';

import { OrderDrawer } from '../sections/revenue/ui/order-drawer';
import { Notice } from '.';
import { BranchLedger, fetchBranchLedger } from '@/lib/b2b/revenue';
import { StatsBasis } from '@/lib/b2b';
import { useEffect, useMemo, useState } from 'react';

export interface BranchTile {
  title: string;
  count: number;
  keep: (status: string) => boolean;
}

export function BranchOrders({ tile, period, basis, onClose }: {
  tile: BranchTile;
  period: { from?: string; to?: string };
  basis: StatsBasis;
  onClose: () => void;
}) {
  const [ledger, setLedger] = useState<BranchLedger | null>(null);
  const [error, setError] = useState('');
  const { from, to } = period;

  useEffect(() => {
    let alive = true;
    fetchBranchLedger(from, to, basis)
      .then((l) => { if (alive) setLedger(l); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Orders could not be read'); });
    return () => { alive = false; };
  }, [from, to, basis]);

  const rows = useMemo(
    () => (ledger?.orders ?? []).filter((o) => tile.keep(o.status)).sort((a, b) => b.value - a.value),
    [ledger, tile],
  );

  const note = error
    ? <Notice title="These orders could not be read.">{error}. The tile&apos;s figure is unaffected.</Notice>
    : !ledger
      ? <p className="text-[12px] text-gray-400">Loading orders…</p>
      : (
        <>
          {ledger.truncated && <Notice title="This list is cut off.">More orders exist than one read covers, so pick a month to see all of them.</Notice>}
          {!ledger.truncated && rows.length !== tile.count && <Notice title="This list and the tile disagree.">The tile counts {tile.count} and the list has {rows.length}. Both come from Django, so the tile may have moved since it loaded. Refresh to compare.</Notice>}
          {!ledger.studioOk && <Notice title="Studio Space numbers did not load.">Channels below may read wrong, because referred and partner numbers are left out.</Notice>}
        </>
      );

  return <OrderDrawer title={`${tile.title} · B2B branch`} orders={rows} note={note} onClose={onClose} />;
}
