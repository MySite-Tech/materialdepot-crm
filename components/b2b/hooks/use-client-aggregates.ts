'use client';

import { ClientEntity, ClientOrderMetrics, normalizeContactNumber, withStudioOrders } from '../models/client';
import { useStudioLogins } from './use-studio-logins';
import { ClientOrderHistory, HISTORY_TTL_MS, clientMetricsFrom, fetchB2BBulk, orderDatesFromAggregates } from '@/lib/b2b';
import { useCallback, useEffect, useRef, useState } from 'react';

type OrderDates = ReturnType<typeof orderDatesFromAggregates>;

const STALE_CHECK_MS = 60 * 1000;

export function useClientAggregates() {
  const [aggregates, setAggregates] = useState<Record<string, ClientOrderHistory>>({});
  const [dates, setDates] = useState<OrderDates | null>(null);
  const { firms } = useStudioLogins();
  const held = useRef<Set<string>>(new Set());
  const readAt = useRef(0);

  const hold = (phones: string[]) => {
    for (const p of phones.map(normalizeContactNumber)) if (p) held.current.add(p);
  };

  const load = useCallback(async (phones: string[], enquiryIds: string[] = []) => {
    held.current = new Set();
    hold(phones);
    readAt.current = Date.now();
    const bulk = await fetchB2BBulk(phones, enquiryIds);
    setAggregates(bulk.histories);
    setDates(orderDatesFromAggregates(bulk.histories, phones, bulk.unread));
    return bulk;
  }, []);

  const addPhones = useCallback(async (phones: string[]) => {
    const fresh = phones.map(normalizeContactNumber).filter((p) => p && !dates?.byPhone[p]);
    if (!fresh.length) return;
    hold(fresh);
    const { histories, unread } = await fetchB2BBulk(fresh, []);
    setAggregates((a) => ({ ...a, ...histories }));
    setDates((d) => ({ byPhone: { ...d?.byPhone, ...orderDatesFromAggregates(histories, fresh, unread).byPhone } }));
  }, [dates]);

  const reread = useCallback(async () => {
    const phones = [...held.current];
    if (!phones.length) return;
    readAt.current = Date.now();
    const { histories, unread } = await fetchB2BBulk(phones, [], { fresh: true });
    const read = phones.filter((p) => !unread.has(p));
    if (!read.length) return;
    const answered = Object.fromEntries(read.map((p) => [p, histories[p]]).filter(([, h]) => h));
    setAggregates((a) => ({ ...a, ...answered }));
    setDates((d) => ({ byPhone: { ...d?.byPhone, ...orderDatesFromAggregates(answered, read).byPhone } }));
  }, []);

  useEffect(() => {
    const stale = () => !document.hidden && Date.now() - readAt.current >= HISTORY_TTL_MS;
    const check = () => { if (stale()) reread(); };
    const tick = setInterval(check, STALE_CHECK_MS);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', check);
    };
  }, [reread]);

  const metricsFor = useCallback(
    (c: ClientEntity): ClientOrderMetrics => withStudioOrders(clientMetricsFrom(c.contacts, aggregates, dates || undefined), c, firms),
    [aggregates, dates, firms],
  );

  const historyFor = useCallback(
    (phone: string): ClientOrderHistory | undefined => (dates?.byPhone[phone]?.loaded ? aggregates[phone] : undefined),
    [aggregates, dates],
  );

  return { load, addPhones, metricsFor, historyFor };
}
