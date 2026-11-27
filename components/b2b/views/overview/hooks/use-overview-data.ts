'use client';

import { buildHealthOverview } from '../../../models/account-health';
import { ClientMetricsMap, computeDashboard, computeKamDashboard } from '../../../models/analytics';
import { ClientEntity, contactNumbers, withStudioOrders } from '../../../models/client';
import { BaseData } from '../types';
import { B2BData, clientMetricsFrom, fetchB2BBulk, fetchB2BData, fetchTargets, firstOrderValueFromAggregates, istToday, kamEnquiryIdsToResolve, orderDatesFromAggregates, resolveKamOrders } from '@/lib/b2b';
import { fetchStudioAccess } from '@/lib/b2b/studio-logins';
import { useCallback, useEffect, useRef, useState } from 'react';

type Resolutions = Awaited<ReturnType<typeof resolveKamOrders>>['resolutions'];

interface Inputs {
  data: B2BData;
  targets: Awaited<ReturnType<typeof fetchTargets>>;
  studio: Awaited<ReturnType<typeof fetchStudioAccess>> | null;
  bulk: Awaited<ReturnType<typeof fetchB2BBulk>>;
  clientPhones: string[];
  today: string;
}

async function readInputs(): Promise<Inputs> {
  const [data, targets, studio] = await Promise.all([fetchB2BData(), fetchTargets(), fetchStudioAccess().catch(() => null)]);
  const clientPhones = data.clients.flatMap((c) => contactNumbers(c.contacts));
  const bulk = await fetchB2BBulk(clientPhones, kamEnquiryIdsToResolve(data.kam));
  return { data, targets, studio, bulk, clientPhones, today: istToday(new Date()) };
}

const resolveOrders = (inputs: Inputs, lookup: boolean) =>
  resolveKamOrders(inputs.data.kam, inputs.bulk.deals, inputs.data.clients, lookup).then((r) => r.resolutions);

function buildBase({ data: fetched, targets, studio, bulk, clientPhones, today }: Inputs, resolutions: Resolutions, final: boolean): BaseData {
  const { histories: aggregates, unread } = bulk;
  const resolvedById = new Map(resolutions.filter((r) => r.resolved).map((r) => [r.order.id, r.resolved!]));
  const unresolvedOrders = fetched.kam.filter((o) =>
    !!String(o.enqId || '').trim() && !resolvedById.has(o.id) && o.orderValue === undefined).length;
  const data = { ...fetched, kam: fetched.kam.map((o) => resolvedById.get(o.id) ?? o) };

  const dates = orderDatesFromAggregates(aggregates, clientPhones, unread);
  const clientMetrics: ClientMetricsMap = {};
  for (const c of data.clients) {
    clientMetrics[c.id] = withStudioOrders(clientMetricsFrom(c.contacts, aggregates, dates), c, studio?.firms ?? []);
  }

  return {
    dashboard: computeDashboard(data, clientMetrics, today),
    kam: computeKamDashboard(data, {
      clientMetrics,
      firstOrderValueFor: (c) => firstOrderValueFromAggregates(aggregates, contactNumbers(c.contacts)),
      today,
      month: { from: today.slice(0, 8) + '01', to: today },
    }),
    health: buildHealthOverview(
      data.clients,
      today,
      (c: ClientEntity) => contactNumbers(c.contacts).reduce((t, p) => t + (aggregates[p]?.openValue ?? 0), 0),
    ),
    failed: data.failed,
    clientCount: data.clients.length,
    unresolvedOrders: final ? unresolvedOrders : null,
    targetStore: targets.store,
    targetsOk: targets.ok,
  };
}

export function useOverviewData() {
  const [base, setBase] = useState<BaseData | null>(null);
  const [busy, setBusy] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const run = useRef(0);

  const reload = useCallback(async () => {
    const id = ++run.current;
    setBusy(true);
    let inputs: Inputs;
    let quick: Resolutions;
    try {
      inputs = await readInputs();
      quick = await resolveOrders(inputs, false);
      if (id !== run.current) return;
      const pending = quick.some((r) => r.outcome === 'skipped');
      setBase(buildBase(inputs, quick, !pending));
      setUpdatedAt(new Date());
      if (!pending) return;
    } finally {
      if (id === run.current) setBusy(false);
    }
    const full = await resolveOrders(inputs, true).catch(() => quick);
    if (id === run.current) setBase(buildBase(inputs, full, true));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return { base, updatedAt, reload, refreshing: busy };
}
