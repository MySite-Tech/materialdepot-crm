'use client';

import { useEffect, useState } from 'react';
import { fetchTicketSkus } from '@/lib/b2b/ticket-skus';
import type { TicketSkus } from '@/lib/b2b/ticket-skus/types';

export type TicketSkusState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; skus: TicketSkus }
  | { status: 'failed'; error: string };

export function useTicketSkus(enqId: string, phone: string | undefined, on: boolean) {
  const [state, setState] = useState<TicketSkusState>({ status: 'idle' });
  useEffect(() => {
    if (!on || !phone) { setState({ status: 'idle' }); return; }
    let alive = true;
    setState({ status: 'loading' });
    fetchTicketSkus(enqId, phone)
      .then((skus) => { if (alive) setState({ status: 'ready', skus }); })
      .catch((e) => { if (alive) setState({ status: 'failed', error: e instanceof Error ? e.message : String(e) }); });
    return () => { alive = false; };
  }, [enqId, phone, on]);
  return state;
}
