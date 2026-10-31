'use client';

import { RevenueReport, fetchRevenueReport } from '@/lib/b2b/revenue';
import { useCallback, useEffect, useState } from 'react';

export function useRevenueReport(from: string, to: string, refreshKey: number) {
  const [report, setReport] = useState<RevenueReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async (fresh: boolean) => {
    setBusy(true);
    setError(null);
    try {
      setReport(await fetchRevenueReport(from, to, fresh));
    } catch (e) {
      setReport(null);
      setError(e instanceof Error ? e.message : 'Revenue could not be read');
    } finally {
      setBusy(false);
    }
  }, [from, to]);

  useEffect(() => { load(refreshKey > 0); }, [load, refreshKey]);

  return { report, error, busy, reload: () => load(true) };
}
