'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchChecklistDays } from '@/lib/store-checklist/api';
import type { ChecklistDay } from '@/lib/store-checklist/types';

export function useChecklistRange(storeCodes: readonly string[], from: string, to: string) {
  const [days, setDays] = useState<ChecklistDay[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  const key = storeCodes.join(',');

  useEffect(() => {
    if (!key) { setDays([]); return; }
    let live = true;
    setLoading(true);
    setError(null);
    fetchChecklistDays(key.split(','), from, to)
      .then((rows) => { if (live) setDays(rows); })
      .catch((err: unknown) => {
        if (!live) return;
        setDays(null);
        setError(err instanceof Error ? err.message : 'Could not load checklist history');
      })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [key, from, to, reloads]);

  const reload = useCallback(() => setReloads((n) => n + 1), []);

  return { days, loading, error, reload };
}
