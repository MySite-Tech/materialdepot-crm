'use client';

import { ClientFlowReport, fetchClientFlow } from '@/lib/b2b/revenue';
import { useCallback, useEffect, useRef, useState } from 'react';

export function useClientFlow(refreshKey: number) {
  const [flow, setFlow] = useState<ClientFlowReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);

  const load = useCallback(async (fresh: boolean) => {
    const ask = ++latest.current;
    setError(null);
    setLoading(true);
    try {
      const next = await fetchClientFlow(fresh);
      if (ask === latest.current) setFlow(next);
    } catch (e) {
      if (ask === latest.current) setError(e instanceof Error ? e.message : 'Clients could not be read');
    } finally {
      if (ask === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => { load(refreshKey > 0); }, [load, refreshKey]);

  return { flow, error, loading, reload: () => load(true) };
}
