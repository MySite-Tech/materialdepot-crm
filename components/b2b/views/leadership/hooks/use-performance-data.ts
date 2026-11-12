'use client';

import { useClientAggregates } from '../../../hooks/use-client-aggregates';
import { ClientEntity, contactNumbers } from '../../../models/client';
import { KamOrder } from '../../../models/kam';
import { InboundLead, OutreachLead } from '../../../models/mock-data';
import { WaitlistSignup } from '../../../models/outreach';
import { waitlistIndex } from '../../../models/outreach/kpis';
import { Period } from '../../../models/outreach/kpis';
import { PerfData, Source, TargetStore } from '../../../models/performance/types';
import { useOrderCredits } from '../../../order-credit/hooks/use-order-credits';
import { useMonthReport } from '../../overview/hooks/use-month-report';
import { EcVisit, fetchEcVisits } from '@/lib/b2b/ec-visits';
import { applyCredits, fetchRevenueReport } from '@/lib/b2b/revenue';
import { fetchClients, fetchKamOrders, fetchOutreachLeads, fetchTargets, kamEnquiryIdsToResolve, resolveKamOrders } from '@/lib/b2b';
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

export function usePerformanceData(team: B2BTeam | null, today: string, period: Period) {
  const [base, setBase] = useState<Base | null>(null);
  const [waitlist, setWaitlist] = useState<WaitlistSignup[] | null | undefined>(undefined);
  const [targets, setTargets] = useState<TargetStore | null>(null);
  const [targetsOk, setTargetsOk] = useState(true);
  const [historyState, setHistoryState] = useState<'idle' | LoadState>('idle');
  const { load: loadHistories, metricsFor } = useClientAggregates();
  const [refreshKey, setRefreshKey] = useState(0);
  const sales = useMonthReport(fetchRevenueReport, period.from, period.to, true, refreshKey, 'Orders could not be read');
  const { credits, state: creditsState } = useOrderCredits();
  const [redirects, setRedirects] = useState<EcVisit[] | null | undefined>(undefined);

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
    fetchEcVisits({ kind: 'redirect' })
      .then((v) => { if (alive) setRedirects(v); })
      .catch((e) => { console.error('[b2b] performance: redirects failed', e); if (alive) setRedirects(null); });
    return () => { alive = false; };
  }, []);

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
    const orders = base.kamOrders;
    loadHistories(base.clients.flatMap((c) => contactNumbers(c.contacts)), kamEnquiryIdsToResolve(orders))
      .then(({ deals }) => resolveKamOrders(orders, deals, base.clients))
      .then(({ resolutions }) => {
        const resolved = new Map(resolutions.filter((r) => r.resolved).map((r) => [r.order.id, r.resolved!]));
        setBase((b) => b && { ...b, kamOrders: b.kamOrders.map((o) => resolved.get(o.id) ?? o) });
      })
      .finally(() => setHistoryState('ready'));
  }, [team, base, historyState, loadHistories]);

  const revenue = useMemo(() => (sales.report ? applyCredits(sales.report.orders, credits) : null), [sales.report, credits]);

  const data = useMemo<PerfData | null>(() => base && {
    ...base,
    waitlist: waitlistIndex(waitlist ?? null),
    metricsFor,
    today,
    revenue,
    revenueWindow: sales.report ? { from: sales.report.from, to: sales.report.to } : null,
    credits,
    redirects: redirects ?? null,
  }, [base, waitlist, metricsFor, today, revenue, sales.report, credits, redirects]);

  const pending = !base
    || (team === 'outreach' && waitlist === undefined)
    || (team === 'kam' && historyState !== 'ready');

  const reload = useCallback(() => { load(); setRefreshKey((k) => k + 1); }, [load]);

  return {
    data, pending, reload, targets, targetsOk, setTargets,
    revenueBusy: sales.busy || creditsState === 'loading',
    revenueError: sales.error,
    creditsFailed: creditsState === 'failed',
    redirectsFailed: redirects === null,
    report: sales.report,
  };
}
