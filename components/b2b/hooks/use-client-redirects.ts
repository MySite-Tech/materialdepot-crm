import { useCallback, useEffect, useState } from 'react';
import { EcTicket, EcVisit, fetchClientRedirects, fetchEcTickets } from '@/lib/b2b/ec-visits';

export type RedirectTickets = { tickets: EcTicket[] } | { error: string };

const newestFirst = (list: EcVisit[]) => [...list].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

export function useClientRedirects(leadRef: string, phones: string[]) {
  const phoneKey = phones.join(',');
  const [redirects, setRedirects] = useState<EcVisit[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Record<string, RedirectTickets>>({});

  useEffect(() => {
    let alive = true;
    setRedirects(null);
    setLoadError(null);
    fetchClientRedirects(leadRef, phoneKey ? phoneKey.split(',') : [])
      .then((list) => { if (alive) setRedirects(newestFirst(list)); })
      .catch((e) => { if (alive) setLoadError(e instanceof Error ? e.message : 'Redirects did not load'); });
    return () => { alive = false; };
  }, [leadRef, phoneKey]);

  useEffect(() => {
    let alive = true;
    for (const v of redirects || []) {
      fetchEcTickets(v)
        .then((t) => { if (alive) setTickets((cur) => ({ ...cur, [v.id]: { tickets: t } })); })
        .catch((e) => { if (alive) setTickets((cur) => ({ ...cur, [v.id]: { error: e instanceof Error ? e.message : 'did not load' } })); });
    }
    return () => { alive = false; };
  }, [redirects]);

  const add = useCallback((v: EcVisit) => setRedirects((cur) => newestFirst([v, ...(cur || [])])), []);

  return { redirects, loadError, tickets, add };
}
