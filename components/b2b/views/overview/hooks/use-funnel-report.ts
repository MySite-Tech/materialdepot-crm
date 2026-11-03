'use client';

import { FunnelReport, fetchFunnelReport } from '@/lib/b2b/revenue';
import { useCallback, useEffect, useState } from 'react';

export function useFunnelReport(from: string, to: string, enabled: boolean, refreshKey: number) {
  const [report, setReport] = useState<FunnelReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (fresh: boolean) => {
    setBusy(true);
    setError(null);
    try {
      setReport(await fetchFunnelReport(from, to, fresh));
    } catch (e) {
      setReport(null);
      setError(e instanceof Error ? e.message : 'The funnel could not be read');
    } finally {
      setBusy(false);
    }
  }, [from, to]);

  useEffect(() => { if (enabled) load(refreshKey > 0); }, [enabled, load, refreshKey]);

  return { report, error, busy, reload: () => load(true) };
}
