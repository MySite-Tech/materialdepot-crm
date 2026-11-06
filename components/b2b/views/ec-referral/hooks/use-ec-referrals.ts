'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchEcReferrals } from '@/lib/b2b/ec-referral';
import type { EcReferralData, EcReferralView, ReferralSummary } from '@/lib/b2b/ec-referral/types';
import { fetchB2BBulk, type ClientOrderHistory } from '@/lib/b2b/orders/history';

export type OrdersState = 'loading' | 'failed' | { histories: Record<string, ClientOrderHistory>; unread: ReadonlySet<string> };

export function useEcReferrals(view: EcReferralView) {
  const [data, setData] = useState<EcReferralData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrdersState>('loading');

  const load = useCallback(() => {
    let alive = true;
    setError(null);
    setOrders('loading');
    fetchEcReferrals(view)
      .then((d) => {
        if (!alive) return;
        setData(d);
        return fetchB2BBulk(d.referrals.map((r) => r.phone), [])
          .then((b) => { if (alive) setOrders({ histories: b.histories, unread: b.unread }); });
      })
      .catch((e) => {
        console.error('[b2b] EC referrals failed', e);
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Could not load referrals');
        setOrders('failed');
      });
    return () => { alive = false; };
  }, [view]);

  useEffect(() => load(), [load]);

  const add = (r: ReferralSummary) => {
    setData((d) => (d ? { ...d, referrals: [r, ...d.referrals] } : d));
    load();
  };

  return { data, error, orders, reload: load, add };
}
