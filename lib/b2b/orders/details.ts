import { lookupEnqId } from '../leads/enq-lookup';
import { ClientOrderHistory } from './history';
import { ClientContact, ClientOrderMetrics, averageOrderValue, contactNumbers, dealIsOpen, dealIsOrder, normalizeContactNumber } from '@/components/b2b/models/client';
import { KamOrder } from '@/components/b2b/models/kam';
import { CRMLeadRow, ClientTicketResult, fetchClientTickets, invalidateLeadsByPhone } from '@/lib/api';

const ORDER_DETAIL_CONCURRENCY = 4;

export interface ClientOrderRow {
  enqId: string;

  contactNumber: string;
  contactName: string;

  companyOnOrder?: string;
  gstOnOrder?: string;
  orderValue: number;
  status: string;
  ordered: boolean;
  lost: boolean;
  open: boolean;

  orderPlacedDate?: string;

  createdAt?: string;

  spoc?: string;
  branch?: string;
  cartItems?: string;
  lostReason?: string;
}

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
): Promise<KamOrderResolveResult> {

  const needing = ordersNeedingResolve(orders);
  const head = needing.slice(0, ENQ_RESOLVE_CAP);

  const byEnqId = indexDeals(deals);

  const resolutions = await pooled(head, ORDER_DETAIL_CONCURRENCY, async (o): Promise<KamOrderResolution> => {
    const bulk = byEnqId.get(normalizeEnqId(o.enqId));
    if (bulk && normalizeContactNumber(bulk.clientPhone ?? '') === normalizeContactNumber(o.phone)) {
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
    const r = await lookupEnqId(o.phone, o.enqId);
    if (r.status === 'matched') {
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
    return { order: o, outcome: r.status };
  });

  return { resolutions, overflow: Math.max(0, needing.length - head.length) };
}

function ticketToOrderRow(t: CRMLeadRow, phone: string): ClientOrderRow {
  const ordered = dealIsOrder(t.status);
  return {
    enqId: String(t.id || ''),
    contactNumber: phone,
    contactName: String(t.clientName || '').trim(),
    companyOnOrder: undefined,
    gstOnOrder: undefined,
    orderValue: Number(t.cartValue) || 0,
    status: String(t.status || ''),
    ordered,
    lost: !ordered && !dealIsOpen(t.status),
    open: dealIsOpen(t.status),
    orderPlacedDate: ordered ? (String(t.closureDate || '').slice(0, 10) || undefined) : undefined,
    createdAt: String(t.createdAt || '').slice(0, 10) || undefined,
    spoc: String(t.assignedTo || '').trim() || undefined,
    branch: String(t.branch || '').trim() || undefined,
    cartItems: String(t.cartItems || '').trim() || undefined,
    lostReason: String(t.lostReason || '').trim() || undefined,
  };
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

  rows.sort((a, b) =>
    String(b.orderPlacedDate || b.createdAt || '').localeCompare(String(a.orderPlacedDate || a.createdAt || '')));
  return { rows, failedPhones, rejected };
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
  ok = true,
): { byPhone: Record<string, { last?: string; loaded: boolean }> } {
  const byPhone: Record<string, { last?: string; loaded: boolean }> = {};
  for (const p of phones.map(normalizeContactNumber)) {
    if (!p) continue;
    byPhone[p] = { loaded: ok, last: aggregates[p]?.lastOrderDate ?? undefined };
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
