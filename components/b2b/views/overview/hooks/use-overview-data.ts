'use client';

import { buildHealthOverview } from '../../../models/account-health';
import { ClientMetricsMap, computeDashboard, computeKamDashboard } from '../../../models/analytics';
import { ClientEntity, contactNumbers } from '../../../models/client';
import { BaseData, RangeData, RangeKey } from '../types';
import { rangeFor } from '../utils';
import { B2B_STATS_BRANCH, StatsBasis, clientMetricsFrom, fetchB2BBulk, fetchB2BData, fetchB2BPipelineStats, fetchTargets, fetchVerticalStats, firstOrderValueFromAggregates, istToday, kamEnquiryIdsToResolve, orderDatesFromAggregates, resolveKamOrders } from '@/lib/b2b';
import { useCallback, useEffect, useRef, useState } from 'react';

async function readBase(): Promise<BaseData> {
  const now = new Date();
  const [fetched, targets] = await Promise.all([fetchB2BData(), fetchTargets()]);
  let data = fetched;
  const today = istToday(now);

  const clientPhones = data.clients.flatMap((c) => contactNumbers(c.contacts));
  const { histories: aggregates, deals, ok: aggOk } = await fetchB2BBulk(
    clientPhones, kamEnquiryIdsToResolve(data.kam),
  );

  const { resolutions } = await resolveKamOrders(data.kam, deals);
  const resolvedById = new Map(resolutions.filter((r) => r.resolved).map((r) => [r.order.id, r.resolved!]));
  const unresolvedOrders = data.kam.filter((o) =>
    !!String(o.enqId || '').trim() && !resolvedById.has(o.id) && o.orderValue === undefined).length;
  data = { ...data, kam: data.kam.map((o) => resolvedById.get(o.id) ?? o) };

  const dates = orderDatesFromAggregates(aggregates, clientPhones, aggOk);
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

async function readRange(range: RangeKey, basis: StatsBasis): Promise<RangeData> {
  const now = new Date();
  const selected = rangeFor(range, now);
  const onOrder = basis === 'order';

  const [createdStats, orderStats] = await Promise.all([
    fetchVerticalStats(selected, B2B_STATS_BRANCH),
    onOrder ? fetchVerticalStats(selected, B2B_STATS_BRANCH, 'order') : Promise.resolve(null),
  ]);
  const revenueSelected = orderStats ?? createdStats;
  const pipeline = revenueSelected.pipeline ?? await fetchB2BPipelineStats(selected, basis);

  return {
    stats: pipeline,
    statsOk: createdStats.ok && pipeline.ok && revenueSelected.ok,
    basisApplied: revenueSelected.basisApplied,
    open: createdStats.pipeline?.active ?? { count: 0, value: 0 },
  };
}

export function useOverviewData() {
  const [range, setRangeState] = useState<RangeKey>('month');
  const rangePicked = useRef(false);
  const [basis, setBasis] = useState<StatsBasis>('order');
  const [base, setBase] = useState<BaseData | null>(null);
  const [ranged, setRanged] = useState<RangeData | null>(null);
  const [baseBusy, setBaseBusy] = useState(true);
  const [rangeBusy, setRangeBusy] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const loadBase = useCallback(async () => {
    setBaseBusy(true);
    try {
      setBase(await readBase());
      setUpdatedAt(new Date());
    } finally {
      setBaseBusy(false);
    }
  }, []);

  const loadRange = useCallback(async () => {
    setRangeBusy(true);
    try {
      setRanged(await readRange(range, basis));
      setUpdatedAt(new Date());
    } finally {
      setRangeBusy(false);
    }
  }, [range, basis]);

  const reload = useCallback(
    () => Promise.all([loadBase(), loadRange()]).then(() => undefined),
    [loadBase, loadRange],
  );

  useEffect(() => { loadBase(); }, [loadBase]);
  useEffect(() => { loadRange(); }, [loadRange]);

  useEffect(() => {
    if (!rangePicked.current && range === 'month' && ranged?.statsOk && !ranged.stats.total.count) setRangeState('lastMonth');
  }, [ranged, range]);

  const setRange = useCallback((r: RangeKey) => {
    rangePicked.current = true;
    setRangeState(r);
  }, []);

  return {
    base, ranged, range, setRange, basis, setBasis, updatedAt, reload,
    refreshing: baseBusy || rangeBusy,
    rangeBusy,
  };
}
