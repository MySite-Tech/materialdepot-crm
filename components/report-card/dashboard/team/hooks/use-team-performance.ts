'use client';

import { CRMLeadsStats, fetchCRMLeadsStatsByBmGroup, fetchFootfallDashboard } from '@/lib/api';
import { OrgPerson, STATS_BATCH, chunk } from '@/lib/org';
import { TeamPerformance, TeamRow } from '../types';
import { indexFootfallByName, metricsFor } from '../utils';
import { normaliseName } from '@/lib/org';
import { useEffect, useState } from 'react';

const EMPTY: TeamPerformance = {
  rows: [], leadsFailed: false, footfallFailed: false, footfallAmbiguous: 0, loading: false,
};

export function useTeamPerformance(people: OrgPerson[], { dateFrom, dateTo, branch }: {
  dateFrom: string;
  dateTo: string;
  branch: string;
}): TeamPerformance {
  const [state, setState] = useState<TeamPerformance>(EMPTY);
  const contactKey = people.map((p) => p.phone).join(',');

  useEffect(() => {
    const contacts = contactKey ? contactKey.split(',') : [];
    if (contacts.length === 0) { setState(EMPTY); return; }

    let live = true;
    setState((s) => ({ ...s, loading: true }));

    const query = { createdFrom: dateFrom, createdTo: dateTo, branch: branch || undefined };
    const leadsBatches = chunk(contacts, STATS_BATCH).map((batch) =>
      fetchCRMLeadsStatsByBmGroup(batch.map((c) => ({ label: c, contacts: [c] })), query));

    Promise.all([
      Promise.all(leadsBatches).then(
        (results) => ({ ok: true as const, groups: Object.assign({}, ...results.map((r) => r.groups)) as Record<string, CRMLeadsStats> }),
        () => ({ ok: false as const, groups: {} as Record<string, CRMLeadsStats> }),
      ),
      fetchFootfallDashboard({
        bm: contacts,
        branch: branch ? [branch] : undefined,
        dateFrom, dateTo,
      }).then((d) => ({ ok: true as const, rows: d.by_bm ?? [] }), () => ({ ok: false as const, rows: [] })),
    ]).then(([leads, footfall]) => {
      if (!live) return;
      const index = indexFootfallByName(footfall.rows, people);
      const rows: TeamRow[] = people.map((person) => {
        const key = normaliseName(person.name);
        const hit = footfall.ok ? index.byName.get(key) : undefined;
        return {
          person,
          metrics: leads.ok ? metricsFor(leads.groups[person.phone], hit) : null,
          footfallMatched: Boolean(hit),
        };
      });
      setState({
        rows,
        leadsFailed: !leads.ok,
        footfallFailed: !footfall.ok,
        footfallAmbiguous: people.filter((p) => index.ambiguous.has(normaliseName(p.name))).length,
        loading: false,
      });
    });

    return () => { live = false; };
  }, [contactKey, dateFrom, dateTo, branch]);

  return state;
}
