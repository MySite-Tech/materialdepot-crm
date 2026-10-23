import { useCallback, useEffect, useMemo, useState } from 'react';

import { RemarksQualityPayload, fetchRemarksQuality } from '@/lib/api';

import type { Dataset, Remark, Walkin } from '../types';
import { markCopies } from '../utils/scoring';

function decode(p: RemarksQualityPayload, allowedBranches: string[]): Dataset {
  const C = Object.fromEntries(p.cols.map((c, i) => [c, i]));
  const A = Object.fromEntries(p.att.cols.map((c, i) => [c, i]));
  const date = p.dicts.date;
  const allowed = new Set(allowedBranches.map(b => b.toUpperCase()));
  const inScope = (branch: number) => !allowed.size || allowed.has((p.dicts.branch[branch] || '').toUpperCase());

  const remarks: Remark[] = [];
  let minDay = '9999';
  for (const x of p.rows) {
    const branch = x[C.branch] as number;
    if (!inScope(branch)) continue;
    const day = date[x[C.day] as number] || '';
    if (day && day < minDay) minDay = day;
    remarks.push({
      id: x[C.id] as number, day, mins: x[C.mins] as number, len: x[C.len] as number,
      author: x[C.author] as number, owner: x[C.owner] as number, branch, type: x[C.type] as number,
      lead: String(x[C.lead] ?? ''), created: date[x[C.created] as number] || '',
      followup: date[x[C.followup] as number] || '', closure: date[x[C.closure] as number] || '',
      prio: x[C.prio] as number, cats: x[C.cats] as number, value: x[C.value] as number | null,
      status: x[C.status] as number, auto: !!x[C.auto], th: x[C.th] as number, pt: x[C.pt] as number,
      rk: x[C.rk] as number, copies: 0,
    });
  }
  markCopies(remarks);

  const walkins: Walkin[] = p.att.rows
    .filter(a => inScope(a[A.branch] as number))
    .map(a => ({ day: date[a[A.day] as number] || '', lead: String(a[A.lead]), src: +a[A.src] || 0, owner: a[A.owner] as number, branch: a[A.branch] as number }));

  return { generated: p.generated, days: p.days, dicts: p.dicts, remarks, walkins, rx: p.rx, minDay: minDay === '9999' ? '' : minDay };
}

export function useRemarksDataset(allowedBranches: string[]) {
  const [payload, setPayload] = useState<RemarksQualityPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const branchKey = allowedBranches.join('|');

  const load = useCallback((fresh: boolean) => {
    setLoading(true);
    fetchRemarksQuality(branchKey, fresh)
      .then(p => { setPayload(p); setError(''); })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [branchKey]);

  useEffect(() => { load(false); }, [load]);

  const dataset = useMemo(
    () => (payload ? decode(payload, branchKey ? branchKey.split('|') : []) : null),
    [payload, branchKey],
  );

  return { dataset, loading, error, refresh: () => load(true) };
}
