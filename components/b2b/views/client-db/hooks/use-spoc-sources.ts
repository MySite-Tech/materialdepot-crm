'use client';

import { InboundLink, SpocLinkLead } from '../../../models/client';
import { fetchInboundLinks, fetchOutreachLeads } from '@/lib/b2b';
import { useEffect, useState } from 'react';

export interface SpocSources {
  inbound: InboundLink[];
  outreach: SpocLinkLead[];
  loading: boolean;
  failed: boolean;
}

export function useSpocSources(): SpocSources {
  const [state, setState] = useState<SpocSources>({ inbound: [], outreach: [], loading: true, failed: false });

  useEffect(() => {
    let alive = true;
    Promise.all([fetchInboundLinks(), fetchOutreachLeads()])
      .then(([inbound, outreach]) => { if (alive) setState({ inbound, outreach, loading: false, failed: false }); })
      .catch((e) => {
        console.error('[b2b] client database SPoC read failed', e);
        if (alive) setState({ inbound: [], outreach: [], loading: false, failed: true });
      });
    return () => { alive = false; };
  }, []);

  return state;
}
