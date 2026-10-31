'use client';

import { EcVisit, fetchEcVisits, saveEcVisit } from '@/lib/b2b/ec-visits';
import { useCallback, useEffect, useState } from 'react';

export function useEcVisits(clientId: string) {
  const [visits, setVisits] = useState<EcVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetchEcVisits({ clientId })
      .then((v) => { if (alive) setVisits(v); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Could not load EC visits'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [clientId]);

  const save = useCallback(async (v: EcVisit): Promise<string | null> => {
    try {
      const saved = await saveEcVisit(v);
      setVisits((cur) => {
        const rest = cur.filter((x) => x.id !== saved.id);
        return [...rest, saved].sort((a, b) => (a.visitDate || '').localeCompare(b.visitDate || '') || String(a.visitTime || '').localeCompare(String(b.visitTime || '')));
      });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Save failed';
    }
  }, []);

  return { visits, loading, error, save };
}
