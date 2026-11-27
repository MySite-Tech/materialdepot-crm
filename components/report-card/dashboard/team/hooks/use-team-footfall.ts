'use client';

import { FootfallBMRow, fetchFootfallDashboard } from '@/lib/api';
import { OrgPerson } from '@/lib/org';
import { TeamFootfall, TeamQuery } from '../types';
import { indexFootfallByName } from '../utils';
import { useEffect, useMemo, useState } from 'react';

export function useTeamFootfall(people: OrgPerson[], { dateFrom, dateTo, branch }: TeamQuery): TeamFootfall {
  const [state, setState] = useState<{ rows: FootfallBMRow[]; failed: boolean; loading: boolean }>({ rows: [], failed: false, loading: false });
  const contactKey = people.map((p) => p.phone).filter(Boolean).join(',');

  useEffect(() => {
    const contacts = contactKey ? contactKey.split(',') : [];
    if (contacts.length === 0) { setState({ rows: [], failed: false, loading: false }); return; }
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    fetchFootfallDashboard({ bm: contacts, branch: branch ? [branch] : undefined, dateFrom, dateTo }).then(
      (d) => { if (live) setState({ rows: d.by_bm ?? [], failed: false, loading: false }); },
      () => { if (live) setState({ rows: [], failed: true, loading: false }); },
    );
    return () => { live = false; };
  }, [contactKey, dateFrom, dateTo, branch]);

  const index = useMemo(() => indexFootfallByName(state.rows, people), [state.rows, people]);
  return { index, failed: state.failed, loading: state.loading };
}
