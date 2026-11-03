'use client';

import { buildHealthOverview } from '../../../models/account-health';
import { ClientMetricsMap, computeDashboard, computeKamDashboard } from '../../../models/analytics';
import { ClientEntity, contactNumbers } from '../../../models/client';
import { BaseData } from '../types';
import { clientMetricsFrom, fetchB2BBulk, fetchB2BData, fetchTargets, firstOrderValueFromAggregates, istToday, kamEnquiryIdsToResolve, orderDatesFromAggregates, resolveKamOrders } from '@/lib/b2b';
import { useCallback, useEffect, useState } from 'react';

async function readBase(): Promise<BaseData> {
  const now = new Date();
  const [fetched, targets] = await Promise.all([fetchB2BData(), fetchTargets()]);
  let data = fetched;
  const today = istToday(now);

  const clientPhones = data.clients.flatMap((c) => contactNumbers(c.contacts));
  const { histories: aggregates, deals, unread } = await fetchB2BBulk(
    clientPhones, kamEnquiryIdsToResolve(data.kam),
  );

  const { resolutions } = await resolveKamOrders(data.kam, deals);
  const resolvedById = new Map(resolutions.filter((r) => r.resolved).map((r) => [r.order.id, r.resolved!]));
  const unresolvedOrders = data.kam.filter((o) =>
    !!String(o.enqId || '').trim() && !resolvedById.has(o.id) && o.orderValue === undefined).length;
  data = { ...data, kam: data.kam.map((o) => resolvedById.get(o.id) ?? o) };

  const dates = orderDatesFromAggregates(aggregates, clientPhones, unread);
  const clientMetrics: ClientMetricsMap = {};
  for (const c of data.clients) {
    clientMetrics[c.id] = clientMetricsFrom(c.contacts, aggregates, dates);
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
    unresolvedOrders,
    targetStore: targets.store,
    targetsOk: targets.ok,
  };
}

export function useOverviewData() {
  const [base, setBase] = useState<BaseData | null>(null);
  const [busy, setBusy] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const reload = useCallback(async () => {
    setBusy(true);
    try {
      setBase(await readBase());
      setUpdatedAt(new Date());
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return { base, updatedAt, reload, refreshing: busy };
}
