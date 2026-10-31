'use client';

import { ClientEntity, FirmLinks, firmLinks } from '../../../models/client';
import { fetchInboundLinks, fetchOutreachLeads } from '@/lib/b2b';
import { useEffect, useState } from 'react';

export function useFirmLinks(client: ClientEntity) {
  const [links, setLinks] = useState<FirmLinks>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const key = `${client.id}|${(client.contacts || []).map((c) => c.number).join(',')}`;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    Promise.all([fetchInboundLinks(), fetchOutreachLeads()])
      .then(([inbound, outreach]) => { if (alive) setLinks(firmLinks(client, inbound, outreach)); })
      .catch((e) => { console.error('[b2b] firm links failed', e); if (alive) setFailed(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [key]);

  return { links, loading, failed };
}
