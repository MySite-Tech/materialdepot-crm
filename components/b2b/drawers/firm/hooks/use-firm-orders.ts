'use client';

import { ClientOrderDetails, fetchClientOrderRows, invalidateClientTickets } from '@/lib/b2b';
import { useCallback, useEffect, useState } from 'react';

export function useFirmOrders(phones: string[]) {
  const key = phones.join(',');
  const [details, setDetails] = useState<ClientOrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const list = key ? key.split(',') : [];
    if (!list.length) {
      setDetails({ rows: [], failedPhones: [], rejected: 0 });
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setFailed(false);
    fetchClientOrderRows(list)
      .then((d) => { if (alive) setDetails(d); })
      .catch((e) => { console.error('[b2b] firm orders failed', e); if (alive) setFailed(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [key, nonce]);

  const recheck = useCallback(() => {
    if (key) invalidateClientTickets(key.split(','));
    setNonce((n) => n + 1);
  }, [key]);

  return { details, loading, failed, recheck };
}
