'use client';

import { EcVisit, fetchClientRedirects, fetchEcVisits, saveEcVisit } from '@/lib/b2b/ec-visits';
import { useCallback, useEffect, useState } from 'react';

const byVisitTime = (a: EcVisit, b: EcVisit) =>
  (a.visitDate || a.createdAt || '').localeCompare(b.visitDate || b.createdAt || '') || String(a.visitTime || '').localeCompare(String(b.visitTime || ''));

export function useEcVisits(clientId: string, phones: string[]) {
  const phoneKey = phones.join(',');
  const [visits, setVisits] = useState<EcVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.all([fetchEcVisits({ clientId }), fetchClientRedirects(clientId, phoneKey ? phoneKey.split(',') : [])])
      .then(([own, redirects]) => {
        if (!alive) return;
        const seen = new Set(own.map((v) => v.id));
        setVisits([...own, ...redirects.filter((v) => !seen.has(v.id))].sort(byVisitTime));
      })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Could not load EC visits'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [clientId, phoneKey]);

  const remember = useCallback((saved: EcVisit) => {
    setVisits((cur) => {
      const rest = cur.filter((x) => x.id !== saved.id);
      return [...rest, saved].sort(byVisitTime);
    });
  }, []);

  const save = useCallback(async (v: EcVisit): Promise<string | null> => {
    try {
      remember(await saveEcVisit(v));
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Save failed';
    }
  }, [remember]);

  return { visits, loading, error, save, remember };
}
