import { lookupEnqId } from './enqLookup';
import { ClientOrderHistory } from './orderHistory';
import { ClientContact, ClientOrderMetrics, averageOrderValue, contactNumbers, dealIsOpen, dealIsOrder, normalizeContactNumber } from '@/components/b2b/models/clientModel';
import { KamOrder } from '@/components/b2b/models/kamModel';
import { CRMLeadRow, ClientTicketResult, fetchClientTickets } from '@/lib/mockApi';

export const ORDER_DETAIL_PHONE_CAP = 120;
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

export interface KamOrderResolution {
  order: KamOrder;
  outcome: 'matched' | 'no-match' | 'unavailable' | 'skipped';

  resolved?: KamOrder;
}

export interface KamOrderResolveResult {
  resolutions: KamOrderResolution[];

  overflow: number;
}

export async function resolveKamOrders(orders: KamOrder[]): Promise<KamOrderResolveResult> {

  const needing = orders.filter((o) =>
    !!String(o.enqId || '').trim()
    && !!String(o.phone || '').trim()
    && !(o.orderValueSource === 'deal' && o.orderValue !== undefined && o.dealStatus));
  const head = needing.slice(0, ENQ_RESOLVE_CAP);

  const resolutions = await pooled(head, ORDER_DETAIL_CONCURRENCY, async (o): Promise<KamOrderResolution> => {
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
  for (const p of phones.map(normalizeContactNumber)) ticketCache.delete(p);
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

export function orderDatesFromRows(
  details: ClientOrderDetails,
  phones: string[],
): { byPhone: Record<string, { last?: string; loaded: boolean }> } {
  const byPhone: Record<string, { last?: string; loaded: boolean }> = {};
  const failed = new Set(details.failedPhones);
  for (const p of phones.map(normalizeContactNumber)) {
    if (!p) continue;
    byPhone[p] = { loaded: !failed.has(p) };
  }
  for (const r of details.rows) {
    if (!r.ordered) continue;
    const day = r.orderPlacedDate || r.createdAt;
    if (!day) continue;
    const slot = byPhone[r.contactNumber];
    if (slot && (!slot.last || day > slot.last)) slot.last = day;
  }
  return { byPhone };
}

export function firstOrderValue(details: ClientOrderDetails, phones: string[]): number | undefined {
  const wanted = new Set(phones.map(normalizeContactNumber));
  const ordered = details.rows
    .filter((r) => r.ordered && wanted.has(r.contactNumber))
    .map((r) => ({ day: r.orderPlacedDate || r.createdAt || '', value: r.orderValue }))
    .filter((r) => r.day)
    .sort((a, b) => a.day.localeCompare(b.day));
  return ordered.length ? ordered[0].value : undefined;
}

