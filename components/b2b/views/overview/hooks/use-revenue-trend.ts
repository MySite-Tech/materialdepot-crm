'use client';

import { RevenueTrend, fetchRevenueTrend } from '@/lib/b2b/revenue';
import { useCallback, useEffect, useState } from 'react';

export function useRevenueTrend(refreshKey: number) {
  const [trend, setTrend] = useState<RevenueTrend | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (fresh: boolean) => {
    setError(null);
    try {
      setTrend(await fetchRevenueTrend(fresh));
    } catch (e) {
      setTrend(null);
      setError(e instanceof Error ? e.message : 'Revenue could not be read');
    }
  }, []);

  useEffect(() => { load(refreshKey > 0); }, [load, refreshKey]);

  return { trend, error, reload: () => load(true) };
}
