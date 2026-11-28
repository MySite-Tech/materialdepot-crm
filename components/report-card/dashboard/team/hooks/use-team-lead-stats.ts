'use client';

import { CRMLeadsStats, fetchCRMLeadsStatsByBmGroup } from '@/lib/api';
import { OrgPerson, STATS_BATCH, chunk } from '@/lib/org';
import { TeamLeadStats, TeamQuery } from '../types';
import { useEffect, useState } from 'react';

const TEAM_LABEL = 'team';

const TEAM_TOTAL_PHONES = 250;

const BUCKETS = ['total', 'active', 'won', 'lost'] as const;

const addStats = (parts: CRMLeadsStats[]): CRMLeadsStats => {
  const sum = (k: typeof BUCKETS[number]) => ({
    count: parts.reduce((t, p) => t + p[k].count, 0),
    value: parts.reduce((t, p) => t + p[k].value, 0),
  });
  return { total: sum('total'), active: sum('active'), won: sum('won'), lost: sum('lost'), byStatus: [] };
};

const phonesOf = (people: OrgPerson[]) => people.map((p) => p.phone).filter(Boolean).join(',');

export function useTeamLeadStats(filtered: OrgPerson[], page: OrgPerson[], { dateFrom, dateTo, branch }: TeamQuery): TeamLeadStats {
  const [total, setTotal] = useState<{ stats: CRMLeadsStats | null; failed: boolean; loading: boolean }>({ stats: null, failed: false, loading: false });
  const [rows, setRows] = useState<{ byPhone: Record<string, CRMLeadsStats>; failed: Set<string>; loading: boolean }>({ byPhone: {}, failed: new Set(), loading: false });
  const filteredKey = phonesOf(filtered);
  const pageKey = phonesOf(page);

  useEffect(() => {
    const contacts = filteredKey ? filteredKey.split(',') : [];
    if (contacts.length === 0) { setTotal({ stats: null, failed: false, loading: false }); return; }
    let live = true;
    setTotal((s) => ({ ...s, loading: true }));
    const query = { createdFrom: dateFrom, createdTo: dateTo, branch: branch || undefined };
    Promise.all(chunk(contacts, TEAM_TOTAL_PHONES).map((part) =>
      fetchCRMLeadsStatsByBmGroup([{ label: TEAM_LABEL, contacts: part }], query).then((r) => r.groups[TEAM_LABEL] ?? null))).then(
      (parts) => {
        if (!live) return;
        const got = parts.filter((p): p is CRMLeadsStats => p !== null);
        setTotal(got.length === parts.length ? { stats: addStats(got), failed: false, loading: false } : { stats: null, failed: true, loading: false });
      },
      () => { if (live) setTotal({ stats: null, failed: true, loading: false }); },
    );
    return () => { live = false; };
  }, [filteredKey, dateFrom, dateTo, branch]);

  useEffect(() => {
    const contacts = pageKey ? pageKey.split(',') : [];
    if (contacts.length === 0) { setRows({ byPhone: {}, failed: new Set(), loading: false }); return; }
    let live = true;
    setRows((s) => ({ ...s, loading: true }));
    const query = { createdFrom: dateFrom, createdTo: dateTo, branch: branch || undefined };
    Promise.all(chunk(contacts, STATS_BATCH).map((batch) =>
      fetchCRMLeadsStatsByBmGroup(batch.map((c) => ({ label: c, contacts: [c] })), query).then(
        (r) => ({ batch, groups: r.groups as Record<string, CRMLeadsStats> | null }),
        () => ({ batch, groups: null }),
      ))).then((results) => {
      if (!live) return;
      const byPhone: Record<string, CRMLeadsStats> = {};
      const failed = new Set<string>();
      for (const { batch, groups } of results) {
        if (groups) Object.assign(byPhone, groups);
        else batch.forEach((c) => failed.add(c));
      }
      setRows({ byPhone, failed, loading: false });
    });
    return () => { live = false; };
  }, [pageKey, dateFrom, dateTo, branch]);

  return {
    total: total.stats,
    totalFailed: total.failed,
    byPhone: rows.byPhone,
    failedPhones: rows.failed,
    loading: total.loading || rows.loading,
  };
}
