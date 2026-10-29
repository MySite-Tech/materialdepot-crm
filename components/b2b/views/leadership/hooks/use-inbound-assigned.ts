'use client';

import { Period } from '../../../models/outreach/kpis';
import { Person } from '../../../models/performance/types';
import { KYLAS_COUNT_CAP } from '../constants';
import { fetchB2BInboundLeads } from '@/lib/api';
import { B2B_FRESH_START } from '@/lib/b2b';
import { useEffect, useMemo, useState } from 'react';

const counts = new Map<string, number>();

async function newLeadCount(kylasUserId: number, period: Period): Promise<number | null> {
  const from = period.from > B2B_FRESH_START ? period.from : B2B_FRESH_START;
  if (period.to < from) return 0;
  const key = `${kylasUserId}|${from}|${period.to}`;
  const hit = counts.get(key);
  if (hit !== undefined) return hit;
  const after = new Date(`${from}T00:00:00+05:30`).toISOString();
  const before = new Date(`${period.to}T23:59:59.999+05:30`).toISOString();
  const r = await fetchB2BInboundLeads(0, [kylasUserId], '', after, before, undefined, 1);
  if (!r.ok) return null;
  counts.set(key, r.total);
  return r.total;
}

export function useInboundAssigned(people: Person[], period: Period, enabled: boolean) {
  const linked = useMemo(() => people.filter((p) => p.kylasUserId != null).slice(0, KYLAS_COUNT_CAP), [people]);
  const key = enabled ? `${period.from}|${period.to}|${linked.map((p) => `${p.key}:${p.kylasUserId}`).join(',')}` : '';
  const [result, setResult] = useState<{ key: string; counts: Record<string, number | null> } | null>(null);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    (async () => {
      const out: Record<string, number | null> = {};
      for (const p of linked) {
        if (!alive) return;
        out[p.key] = await newLeadCount(p.kylasUserId as number, period);
      }
      if (alive) setResult({ key, counts: out });
    })();
    return () => { alive = false; };
  }, [key]);

  return {
    assigned: result && result.key === key ? result.counts : undefined,
    loading: !!key && result?.key !== key,
    capped: people.filter((p) => p.kylasUserId != null).length > linked.length,
  };
}
