'use client';

import { ClientOrderDetails, byNewestOrder, fetchClientOrderRows, fetchOrdersByGst, invalidateClientTickets } from '@/lib/b2b';
import { useCallback, useEffect, useState } from 'react';

export function useFirmOrders(phones: string[], gstins: string[] = []) {
  const key = phones.join(',');
  const gkey = gstins.join(',');
  const [details, setDetails] = useState<ClientOrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const list = key ? key.split(',') : [];
    const glist = gkey ? gkey.split(',') : [];
    if (!list.length && !glist.length) {
      setDetails({ rows: [], failedPhones: [], rejected: 0 });
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setFailed(false);
    Promise.all([
      list.length ? fetchClientOrderRows(list) : Promise.resolve<ClientOrderDetails>({ rows: [], failedPhones: [], rejected: 0 }),
      // Enquiries billed to the firm's GSTINs but raised on a number not on the
      // firm — folded in and deduped against the phone-matched rows by enquiry.
      glist.length ? fetchOrdersByGst(glist).catch((e) => { console.error('[b2b] firm gst orders failed', e); return []; }) : Promise.resolve([]),
    ])
      .then(([byPhone, byGst]) => {
        if (!alive) return;
        const seen = new Set(byPhone.rows.map((r) => r.ticketId ?? r.enqId));
        const extra = byGst.filter((r) => !seen.has(r.ticketId ?? r.enqId));
        const rows = [...byPhone.rows, ...extra].sort(byNewestOrder);
        setDetails({ ...byPhone, rows });
      })
      .catch((e) => { console.error('[b2b] firm orders failed', e); if (alive) setFailed(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [key, gkey, nonce]);

  const recheck = useCallback(() => {
    if (key) invalidateClientTickets(key.split(','));
    setNonce((n) => n + 1);
  }, [key]);

  return { details, loading, failed, recheck };
}
