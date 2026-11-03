'use client';

import { Period } from '../../../models/outreach/kpis';
import { Person } from '../../../models/performance/types';
import { B2B_FRESH_START, fetchInboundBoard } from '@/lib/b2b';
import { useEffect, useMemo, useState } from 'react';

export function useInboundAssigned(people: Person[], period: Period, enabled: boolean) {
  const linked = useMemo(() => people.filter((p) => p.kylasUserId != null), [people]);
  const from = period.from > B2B_FRESH_START ? period.from : B2B_FRESH_START;
  const key = enabled ? `${from}|${period.to}|${linked.map((p) => `${p.key}:${p.kylasUserId}`).join(',')}` : '';
  const [result, setResult] = useState<{ key: string; counts: Record<string, number | null> } | null>(null);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    const settle = (count: (id: number) => number | null) => {
      if (alive) setResult({ key, counts: Object.fromEntries(linked.map((p) => [p.key, count(p.kylasUserId as number)])) });
    };
    if (period.to < from) settle(() => 0);
    else {
      fetchInboundBoard({ createdFrom: from, createdTo: period.to })
        .then((r) => {
          if (!r.ok) return settle(() => null);
          const held = new Map<number, number>();
          for (const l of r.leads) if (l.ownerId != null) held.set(l.ownerId, (held.get(l.ownerId) || 0) + 1);
          settle((id) => held.get(id) || 0);
        })
        .catch(() => settle(() => null));
    }
    return () => { alive = false; };
  }, [key]);

  return {
    assigned: result && result.key === key ? result.counts : undefined,
    loading: !!key && result?.key !== key,
  };
}
