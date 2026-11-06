import { firmPhoneList, lookupEnqId } from '../leads/enq-lookup';
import { ClientOrderHistory } from './history';
import { BoqLine, ClientOrderRow, boqLines, byNewestOrder, ticketToOrderRow } from './ticket';
import { ClientContact, ClientEntity, ClientOrderMetrics, averageOrderValue, contactNumbers, normalizeContactNumber, normalizeGst } from '@/components/b2b/models/client';
import { KamOrder } from '@/components/b2b/models/kam';
import { CRMLeadRow, ClientTicketResult, fetchCRMLeads, fetchClientTickets, invalidateLeadsByPhone } from '@/lib/api';

const ORDER_DETAIL_CONCURRENCY = 4;

export interface ClientOrderDetails {
  rows: ClientOrderRow[];

  failedPhones: string[];

  rejected: number;
}

const ticketCache = new Map<string, ClientTicketResult>();

async function pooled<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export const ENQ_RESOLVE_CAP = 60;

interface KamOrderResolution {
  order: KamOrder;
  outcome: 'matched' | 'no-match' | 'unavailable' | 'skipped';

  resolved?: KamOrder;
}

interface KamOrderResolveResult {
  resolutions: KamOrderResolution[];

  overflow: number;
}

const wireEnqId = (v: string | undefined): string =>
  String(v || '').trim().replace(/\s+/g, '');

const normalizeEnqId = (v: string | undefined): string => wireEnqId(v).toUpperCase();

export type B2BDealRef = Pick<CRMLeadRow, 'id' | 'clientPhone' | 'cartValue' | 'status'>;

function indexDeals(deals: B2BDealRef[]): Map<string, B2BDealRef> {
  const byEnqId = new Map<string, B2BDealRef>();
  for (const row of deals) {
    const key = normalizeEnqId(row.id);
    if (key && !byEnqId.has(key)) byEnqId.set(key, row);
  }
  return byEnqId;
}

function ordersNeedingResolve(orders: KamOrder[]): KamOrder[] {
  return orders.filter((o) =>
    !!String(o.enqId || '').trim()
    && !!String(o.phone || '').trim()
    && !(o.orderValueSource === 'deal' && o.orderValue !== undefined && o.dealStatus));
}

export function kamEnquiryIdsToResolve(orders: KamOrder[]): string[] {
  return [...new Set(
    ordersNeedingResolve(orders)
      .slice(0, ENQ_RESOLVE_CAP)
      .map((o) => wireEnqId(o.enqId))
      .filter(Boolean),
  )];
}

export async function resolveKamOrders(
  orders: KamOrder[],
  deals: B2BDealRef[],
  clients: ClientEntity[] = [],
): Promise<KamOrderResolveResult> {
  const firmNumbers = new Map(clients.map((c) => [c.id, contactNumbers(c.contacts)]));
  const phonesOf = (o: KamOrder) => firmPhoneList([o.phone, ...(o.clientId ? firmNumbers.get(o.clientId) ?? [] : [])]);

  const needing = ordersNeedingResolve(orders);
  const head = needing.slice(0, ENQ_RESOLVE_CAP);

  const byEnqId = indexDeals(deals);

  const resolutions = await pooled(head, ORDER_DETAIL_CONCURRENCY, async (o): Promise<KamOrderResolution> => {
    const bulk = byEnqId.get(normalizeEnqId(o.enqId));
    if (bulk && phonesOf(o).includes(normalizeContactNumber(bulk.clientPhone ?? ''))) {
      return {
        order: o,
        outcome: 'matched',
        resolved: {
          ...o,
          orderValue: Number(bulk.cartValue) || 0,
          orderValueSource: 'deal',
          dealStatus: bulk.status || undefined,
          value: Number(bulk.cartValue) || 0,
        },
      };
    }
    // `otherPhone` set means the ticket carries this enquiry id but sits on a
    // number that is not on the firm. The bulk path above checks the same set.
    const r = await lookupEnqId(phonesOf(o), o.enqId);
    if (r.status === 'matched' && !r.otherPhone) {
      return {
        order: o,
        outcome: 'matched',
        resolved: {
          ...o,
          orderValue: r.orderValue,
          orderValueSource: 'deal',
          dealStatus: r.dealStatus,
          value: Number(r.orderValue) || 0,
        },
      };
    }
    return { order: o, outcome: r.status === 'matched' ? 'no-match' : r.status };
  });

  return { resolutions, overflow: Math.max(0, needing.length - head.length) };
}

export async function fetchClientOrderRows(phones: string[]): Promise<ClientOrderDetails> {
  const wanted = [...new Set(phones.map(normalizeContactNumber).filter((p) => p.length === 10))];
  const missing = wanted.filter((p) => !ticketCache.has(p));
  const fetched = await pooled(missing, ORDER_DETAIL_CONCURRENCY, fetchClientTickets);
  for (const r of fetched) ticketCache.set(r.phone, r);

  const rows: ClientOrderRow[] = [];
  const failedPhones: string[] = [];
  let rejected = 0;
  for (const phone of wanted) {
    const t = ticketCache.get(phone);
    if (!t) continue;
    if (t.state === 'failed') { failedPhones.push(phone); continue; }
    rejected += t.rejected;
    for (const row of t.rows) rows.push(ticketToOrderRow(row, phone));
  }

  rows.sort(byNewestOrder);
  return { rows, failedPhones, rejected };
}

export async function fetchOrdersByGst(gstins: string[]): Promise<ClientOrderRow[]> {
  const wanted = [...new Set(gstins.map(normalizeGst).filter((g) => g.length === 15))];
  if (!wanted.length) return [];
  const { results } = await fetchCRMLeads({
    gst: wanted.join(','), page: 1, pageSize: 100,
    include: 'boq', sortBy: 'createdAt', sortDir: 'desc',
  });
  return (Array.isArray(results) ? results : []).map((r) => ticketToOrderRow(r, String(r.clientPhone || '')));
}

const itemsCache = new Map<string, Promise<BoqLine[]>>();

export function fetchEnquiryItems(enqId: string): Promise<BoqLine[]> {
  const want = enqId.trim().toUpperCase();
  const hit = itemsCache.get(want);
  if (hit) return hit;
  const promise = fetchCRMLeads({ enquiryIds: [want], page: 1, pageSize: 5, include: 'boq' })
    .then(({ results }) => boqLines((results ?? []).find((r) => String(r.id).toUpperCase() === want)?.boqItems) ?? []);
  itemsCache.set(want, promise);
  promise.catch(() => itemsCache.delete(want));
  return promise;
}

export function invalidateClientTickets(phones: string[]): void {
  const normalized = phones.map(normalizeContactNumber);
  for (const p of normalized) ticketCache.delete(p);
  invalidateLeadsByPhone(normalized);
}

export function clientMetricsFrom(
  contacts: ClientContact[] | undefined,
  aggregates: Record<string, ClientOrderHistory>,
  dates: { byPhone: Record<string, { last?: string; loaded: boolean }> } | undefined,
): ClientOrderMetrics {
  const phones = contactNumbers(contacts);
  if (!phones.length) return { dateState: 'no-phone' };

  let orders = 0, totalRevenue = 0, enquiries = 0, openValue = 0;
  let sawAggregate = false;
  for (const p of phones) {
    const a = aggregates[p];
    if (!a) continue;

    if (dates && !dates.byPhone[p]?.loaded) continue;
    sawAggregate = true;
    orders += a.orders;
    totalRevenue += a.lifetimeValue;
    enquiries += a.enquiries;
    openValue += a.openValue;
  }

  let last: string | undefined;
  let anyLoaded = false;
  let allLoaded = true;
  for (const p of phones) {
    const d = dates?.byPhone[p];
    if (d?.loaded) {
      anyLoaded = true;
      if (d.last && (!last || d.last > last)) last = d.last;
    } else allLoaded = false;
  }

  const dateState: ClientOrderMetrics['dateState'] =
    !dates ? 'pending'
    : !anyLoaded ? 'unavailable'
    : !allLoaded ? 'unavailable'
    : last ? 'ok'
    : 'no-orders';

  return {
    orders: sawAggregate ? orders : undefined,
    totalRevenue: sawAggregate ? totalRevenue : undefined,
    averageOrderValue: sawAggregate ? averageOrderValue(totalRevenue, orders) : undefined,
    enquiries: sawAggregate ? enquiries : undefined,
    openValue: sawAggregate ? openValue : undefined,
    lastOrderPlaced: last,
    dateState,
  };
}

export function orderDatesFromAggregates(
  aggregates: Record<string, ClientOrderHistory>,
  phones: string[],
  unread: ReadonlySet<string> = new Set(),
): { byPhone: Record<string, { last?: string; loaded: boolean }> } {
  const byPhone: Record<string, { last?: string; loaded: boolean }> = {};
  for (const p of phones.map(normalizeContactNumber)) {
    if (!p) continue;
    byPhone[p] = { loaded: !unread.has(p), last: aggregates[p]?.lastOrderDate ?? undefined };
  }
  return { byPhone };
}

export function firstOrderValueFromAggregates(
  aggregates: Record<string, ClientOrderHistory>,
  phones: string[],
): number | undefined {
  let bestDay: string | undefined;
  let bestValue: number | undefined;
  for (const p of phones.map(normalizeContactNumber)) {
    const a = aggregates[p];
    if (!a || a.firstOrderValue == null) continue;
    const day = a.firstOrderDate || '';
    if (bestDay === undefined || day < bestDay) {
      bestDay = day;
      bestValue = a.firstOrderValue;
    }
  }
  return bestValue;
}
