'use client';

import { ClientEntity, ClientOrderMetrics, normalizeContactNumber } from '../models/client';
import { ClientOrderHistory, clientMetricsFrom, fetchB2BBulk, orderDatesFromAggregates } from '@/lib/b2b';
import { useCallback, useState } from 'react';

type OrderDates = ReturnType<typeof orderDatesFromAggregates>;

export function useClientAggregates() {
  const [aggregates, setAggregates] = useState<Record<string, ClientOrderHistory>>({});
  const [dates, setDates] = useState<OrderDates | null>(null);

  const load = useCallback(async (phones: string[], enquiryIds: string[] = []) => {
    const bulk = await fetchB2BBulk(phones, enquiryIds);
    setAggregates(bulk.histories);
    setDates(orderDatesFromAggregates(bulk.histories, phones, bulk.ok));
    return bulk;
  }, []);

  const addPhones = useCallback(async (phones: string[]) => {
    const fresh = phones.map(normalizeContactNumber).filter((p) => p && !dates?.byPhone[p]);
    if (!fresh.length) return;
    const { histories, ok } = await fetchB2BBulk(fresh, []);
    setAggregates((a) => ({ ...a, ...histories }));
    setDates((d) => ({ byPhone: { ...d?.byPhone, ...orderDatesFromAggregates(histories, fresh, ok).byPhone } }));
  }, [dates]);

  const metricsFor = useCallback(
    (c: ClientEntity): ClientOrderMetrics => clientMetricsFrom(c.contacts, aggregates, dates || undefined),
    [aggregates, dates],
  );

  const historyFor = useCallback(
    (phone: string): ClientOrderHistory | undefined => (dates?.byPhone[phone]?.loaded ? aggregates[phone] : undefined),
    [aggregates, dates],
  );

  return { load, addPhones, metricsFor, historyFor };
}
