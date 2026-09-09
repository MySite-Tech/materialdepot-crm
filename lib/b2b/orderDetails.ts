import { lookupEnqId } from './enqLookup';
import { ClientOrderHistory } from './orderHistory';
import { ClientContact, ClientOrderMetrics, averageOrderValue, contactNumbers, dealIsOpen, dealIsOrder, normalizeContactNumber } from '@/components/b2b/models/clientModel';
import { KamOrder } from '@/components/b2b/models/kamModel';
import { CRMLeadRow, ClientTicketResult, fetchClientTickets } from '@/lib/mockApi';
// ── Order details per client (Client DB §3.2, KAM §2) ────────────────────────
//
// The metrics in §2 come from the BATCHED `/crm/leads/client-order-history/`
// endpoint, which is the same derivation the Leads tab uses — so a client row
// can never disagree with the Leads tab about how much a client has spent.
//
// That endpoint returns no DATES, though, and §2's Last Order Placed (and
// therefore §2.1's Active/Inactive) needs one. So the ticket list is fetched
// per phone number, which is one request each. Exactly the cost the Site Audit
// funnel work hit, and mitigated the same way: a module-level cache, a
// concurrency pool, a hard cap, and the overflow REPORTED in the UI rather than
// silently dropped.

/** Phones fetched for order details in one pass. Above this, the rest is reported. */
export const ORDER_DETAIL_PHONE_CAP = 120;
const ORDER_DETAIL_CONCURRENCY = 4;

/** One row of a client's §3.2 Order Details table. */
export interface ClientOrderRow {
  enqId: string;
  /** The specific number the order was placed under. */
  contactNumber: string;
  contactName: string;
  /**
   * §3.2 asks for "Company Name captured on that specific order" and "GST
   * Number used on that specific order". **Neither is in the deal-ticket
   * response** — `CRMLeadRow` carries a client NAME and no GST at all — so both
   * are reported as unavailable rather than rendered blank, which would read as
   * "this order had no company name on it".
   */
  companyOnOrder?: string;
  gstOnOrder?: string;
  orderValue: number;
  status: string;
  ordered: boolean;
  lost: boolean;
  open: boolean;
  /** §3.2 "Order Placed Date" — the closure date on a placed order. */
  orderPlacedDate?: string;
  /** When the cart was raised. Shown when there is no closure date yet. */
  createdAt?: string;
  /** §3.2 SPOC — "whoever closed / is handling this order". */
  spoc?: string;
  branch?: string;
  cartItems?: string;
  lostReason?: string;
}

export interface ClientOrderDetails {
  rows: ClientOrderRow[];
  /** Phones that could not be read at all. Never folded into "no orders". */
  failedPhones: string[];
  /** Rows the backend returned under a different client's number. */
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

// ── Resolving a KAM order against Procurement (KAM PRD §5.1) ─────────────────
//
// "Enquiry ID — fetched from Procurement, once available. Order Value
// (Procurement) — auto-fetched from Procurement, in line with the Enquiry ID."
//
// One `lookupEnqId` per order that carries an Enquiry ID but no resolved value.
// Pooled and capped for the same reason the order-detail pass is: it is one
// Django request each. The three outcomes stay three — `matched`, `no-match`
// and `unavailable` — so a Django outage never renders as "your Enquiry ID is
// wrong", and an order whose value could not be read is reported rather than
// counted as ₹0 revenue by omission.

export const ENQ_RESOLVE_CAP = 60;

export interface KamOrderResolution {
  order: KamOrder;
  outcome: 'matched' | 'no-match' | 'unavailable' | 'skipped';
  /** The order with orderValue/dealStatus filled in. Only on `matched`. */
  resolved?: KamOrder;
}

export interface KamOrderResolveResult {
  resolutions: KamOrderResolution[];
  /** Orders past the cap, not attempted. Reported in the UI. */
  overflow: number;
}

export async function resolveKamOrders(orders: KamOrder[]): Promise<KamOrderResolveResult> {
  // Only orders that need it: an Enquiry ID present, and no deal-sourced value
  // already stored. An order a KAM cleared by hand is left alone.
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

/**
 * Every deal ticket on the given contact numbers, as §3.2 rows. Cached per
 * phone for the life of the page, so re-expanding a client is free.
 */
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
  // Newest first, on whichever date the ticket actually has.
  rows.sort((a, b) =>
    String(b.orderPlacedDate || b.createdAt || '').localeCompare(String(a.orderPlacedDate || a.createdAt || '')));
  return { rows, failedPhones, rejected };
}

/** Drop the cached tickets for one client, so a "re-check" button can refetch. */
export function invalidateClientTickets(phones: string[]): void {
  for (const p of phones.map(normalizeContactNumber)) ticketCache.delete(p);
}

/**
 * §2's per-client metrics, assembled from both sources.
 *
 * `aggregates` is the batched endpoint's answer (counts and values), `dates` is
 * the per-phone ticket pass (Last Order Placed). Either half can be absent and
 * `dateState` says which, because a client with real orders whose dates did not
 * load must NOT read as Inactive — that would have a KAM stand down an account
 * that is ordering every week.
 */
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

/** Last ordered date per phone, from the cached ticket pass. */
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

/** A client's FIRST ordered ticket value — §6.2's new-vs-repeat split. */
export function firstOrderValue(details: ClientOrderDetails, phones: string[]): number | undefined {
  const wanted = new Set(phones.map(normalizeContactNumber));
  const ordered = details.rows
    .filter((r) => r.ordered && wanted.has(r.contactNumber))
    .map((r) => ({ day: r.orderPlacedDate || r.createdAt || '', value: r.orderValue }))
    .filter((r) => r.day)
    .sort((a, b) => a.day.localeCompare(b.day));
  return ordered.length ? ordered[0].value : undefined;
}

