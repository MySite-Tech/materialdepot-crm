'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchInboundOpenDeals } from '@/lib/b2b/inbound-deals';
import { DEALS_TTL_MS } from '@/lib/b2b/inbound-deals/constants';
import type { OpenDeal } from '@/lib/b2b/inbound-deals/types';
import { dealsByPhone } from '@/lib/b2b/inbound-deals/utils';

export interface OpenDealsState {
  status: 'pending' | 'ready' | 'failed';
  byPhone: Map<string, OpenDeal[]>;
  truncated: boolean;
  error?: string;
}

const EMPTY = new Map<string, OpenDeal[]>();

export function useOpenDeals(phoneKey: string, enabled: boolean) {
  const [state, setState] = useState<OpenDealsState>({ status: 'pending', byPhone: EMPTY, truncated: false });
  const latest = useRef(0);

  const load = useCallback((fresh: boolean) => {
    const phones = phoneKey ? phoneKey.split(',') : [];
    const run = ++latest.current;
    if (!phones.length) { setState({ status: 'ready', byPhone: EMPTY, truncated: false }); return; }
    fetchInboundOpenDeals(phones, fresh)
      .then((r) => { if (run === latest.current) setState({ status: 'ready', byPhone: dealsByPhone(r.deals), truncated: r.truncated }); })
      .catch((e) => {
        if (run !== latest.current) return;
        setState((prev) => ({ ...prev, status: prev.status === 'ready' ? 'ready' : 'failed', error: e instanceof Error ? e.message : String(e) }));
      });
  }, [phoneKey]);

  useEffect(() => {
    if (!enabled) return;
    load(false);
    const timer = setInterval(() => { if (!document.hidden) load(false); }, DEALS_TTL_MS);
    return () => clearInterval(timer);
  }, [enabled, load]);

  return { ...state, refresh: () => load(true) };
}
