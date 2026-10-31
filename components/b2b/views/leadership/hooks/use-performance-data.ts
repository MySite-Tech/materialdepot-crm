'use client';

import { useClientAggregates } from '../../../hooks/use-client-aggregates';
import { ClientEntity, contactNumbers } from '../../../models/client';
import { KamOrder } from '../../../models/kam';
import { InboundLead, OutreachLead } from '../../../models/mock-data';
import { WaitlistSignup } from '../../../models/outreach';
import { waitlistIndex } from '../../../models/outreach/kpis';
import { PerfData, Source, TargetStore } from '../../../models/performance/types';
import { fetchClients, fetchKamOrders, fetchOutreachLeads, fetchTargets } from '@/lib/b2b';
import { fetchInboundForOutreach, fetchStudioWaitlist } from '@/lib/b2b/outreach';
import type { B2BTeam } from '@/lib/b2b/team/types';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface Base {
  inbound: InboundLead[];
  outreach: OutreachLead[];
  clients: ClientEntity[];
  kamOrders: KamOrder[];
  failed: Source[];
}

export type LoadState = 'loading' | 'ready';

export function usePerformanceData(team: B2BTeam | null, today: string) {
  const [base, setBase] = useState<Base | null>(null);
  const [waitlist, setWaitlist] = useState<WaitlistSignup[] | null | undefined>(undefined);
  const [targets, setTargets] = useState<TargetStore | null>(null);
  const [targetsOk, setTargetsOk] = useState(true);
  const [historyState, setHistoryState] = useState<'idle' | LoadState>('idle');
  const { load: loadHistories, metricsFor } = useClientAggregates();

  const load = useCallback(() => {
    setBase(null);
    setHistoryState('idle');
    const failed: Source[] = [];
    const guard = <T,>(source: Source, p: Promise<T[]>): Promise<T[]> => p.catch((e) => {
      console.error(`[b2b] performance: ${source} failed`, e);
      failed.push(source);
      return [];
    });
    Promise.all([
      guard('inbound', fetchInboundForOutreach()),
      guard('outreach', fetchOutreachLeads()),
      guard('clients', fetchClients()),
      guard('kamOrders', fetchKamOrders()),
    ]).then(([inbound, outreach, clients, kamOrders]) => setBase({ inbound, outreach, clients, kamOrders, failed }));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let alive = true;
    fetchTargets().then((t) => { if (alive) { setTargets(t.store); setTargetsOk(t.ok); } });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (team !== 'outreach' || waitlist !== undefined) return;
    fetchStudioWaitlist().then(setWaitlist).catch(() => setWaitlist(null));
  }, [team, waitlist]);

  useEffect(() => {
    if (team !== 'kam' || !base || historyState !== 'idle') return;
    setHistoryState('loading');
    loadHistories(base.clients.flatMap((c) => contactNumbers(c.contacts))).finally(() => setHistoryState('ready'));
  }, [team, base, historyState, loadHistories]);

  const data = useMemo<PerfData | null>(() => base && {
    ...base,
    waitlist: waitlistIndex(waitlist ?? null),
    metricsFor,
    today,
  }, [base, waitlist, metricsFor, today]);

  const pending = !base
    || (team === 'outreach' && waitlist === undefined)
    || (team === 'kam' && historyState !== 'ready');

  return { data, pending, reload: load, targets, targetsOk, setTargets };
}
