'use client';

import { fetchReviewQueue } from '@/lib/b2b/client-import';
import type { RejectedFirm, ReviewFirm, ReviewQueue } from '@/lib/b2b/client-import/types';
import { useCallback, useEffect, useState } from 'react';

const byValue = (a: ReviewFirm, b: ReviewFirm) => b.value - a.value || a.key.localeCompare(b.key);

export function useReviewQueue() {
  const [queue, setQueue] = useState<ReviewQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError('');
    try {
      setQueue(await fetchReviewQueue(refresh));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const settle = useCallback((keys: string[], rejected: RejectedFirm[] = []) => {
    const gone = new Set(keys);
    setQueue((q) => q && {
      ...q,
      firms: q.firms.filter((f) => !gone.has(f.key)),
      rejected: [...rejected, ...q.rejected].sort(byValue),
    });
  }, []);

  const restore = useCallback((key: string) => {
    setQueue((q) => {
      const back = q?.rejected.find((f) => f.key === key);
      if (!q || !back) return q;
      return { ...q, rejected: q.rejected.filter((f) => f.key !== key), firms: [...q.firms, back].sort(byValue) };
    });
  }, []);

  return { queue, loading, error, load, settle, restore };
}
