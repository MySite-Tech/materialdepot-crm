'use client';

import { fetchReviewQueue } from '@/lib/b2b/client-import';
import type { ReviewFirm } from '@/lib/b2b/client-import/types';
import { useEffect, useRef, useState } from 'react';

export function useUnregistered(refreshKey: number) {
  const [firms, setFirms] = useState<ReviewFirm[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    const ask = ++latest.current;
    setError(null);
    fetchReviewQueue(refreshKey > 0)
      .then((q) => { if (ask === latest.current) setFirms(q.firms); })
      .catch((e) => { if (ask === latest.current) setError(e instanceof Error ? e.message : 'Firms found on orders could not be read'); });
  }, [refreshKey]);

  return { firms, error };
}
