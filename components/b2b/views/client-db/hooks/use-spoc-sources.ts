'use client';

import { InboundLink, SpocLinkLead } from '../../../models/client';
import { fetchInboundLinks, fetchOutreachLeads } from '@/lib/b2b';
import { EcSpocReport, fetchEcSpocs } from '@/lib/b2b/revenue';
import { useEffect, useState } from 'react';

export interface SpocSources {
  inbound: InboundLink[];
  outreach: SpocLinkLead[];
  loading: boolean;
  failed: boolean;
  ec: EcSpocReport | null;
  ecLoading: boolean;
}

export function useSpocSources(): SpocSources {
  const [leads, setLeads] = useState({ inbound: [] as InboundLink[], outreach: [] as SpocLinkLead[], loading: true, failed: false });
  const [ec, setEc] = useState<{ report: EcSpocReport | null; loading: boolean }>({ report: null, loading: true });

  useEffect(() => {
    let alive = true;
    Promise.all([fetchInboundLinks(), fetchOutreachLeads()])
      .then(([inbound, outreach]) => { if (alive) setLeads({ inbound, outreach, loading: false, failed: false }); })
      .catch((e) => {
        console.error('[b2b] client database SPoC read failed', e);
        if (alive) setLeads({ inbound: [], outreach: [], loading: false, failed: true });
      });
    fetchEcSpocs()
      .then((report) => { if (alive) setEc({ report, loading: false }); })
      .catch((e) => {
        console.error('[b2b] client database EC SPoC read failed', e);
        if (alive) setEc({ report: null, loading: false });
      });
    return () => { alive = false; };
  }, []);

  return { ...leads, ec: ec.report, ecLoading: ec.loading };
}
