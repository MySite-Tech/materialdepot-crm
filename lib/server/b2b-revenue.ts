import { MD_API_BASE_URL } from '../api/core/config';
import { dealIsOrder } from '../../components/b2b/models/client';
import { rowToEcVisit } from '../b2b/ec-visits/utils';
import type { EcVisitRow } from '../b2b/ec-visits/types';
import { buildNumberBook, buildRepTeams, clientDbFirms, phoneOf } from '../b2b/revenue/utils/book';
import { funnelBucketOf } from '../b2b/revenue/utils/funnel';
import { classifyOrder } from '../b2b/revenue/utils/classify';
import { B2B_BRANCH, FUNNEL_PAGES } from '../b2b/revenue/constants';
import type { B2BSourceRow, BranchLedger, FunnelEnquiry, FunnelReport, LedgerBasis, OrderInput, RevenueOrder, RevenueReport, StudioFirm } from '../b2b/revenue/types';
import { b2bBackendFetch } from './b2b-backend';
import { readMembers } from './b2b-team';

const PAGE_SIZE = 1000;
const MAX_PAGES = 8;
const PARALLEL_PAGES = 8;

interface OrdersPage {
  results: OrderInput[];
  totalPages: number;
}

async function ordersPage(query: string, page: number, auth: string): Promise<OrdersPage> {
  const res = await fetch(`${MD_API_BASE_URL}/crm/leads/?${query}&page_size=${PAGE_SIZE}&page=${page}`, {
    headers: { Authorization: auth },
    cache: 'no-store',
  });
  const body = await res.json().catch(() => null) as { data?: OrdersPage } | OrdersPage | null;
  const data = (body && 'data' in body ? body.data : body) as OrdersPage | null | undefined;
  if (!res.ok || !Array.isArray(data?.results)) throw new Error(`Orders could not be read (${res.status})`);
  return data;
}

async function allOrders(query: string, auth: string, maxPages = MAX_PAGES): Promise<{ orders: OrderInput[]; truncated: boolean }> {
  const first = await ordersPage(query, 1, auth);
  const pages = Math.min(first.totalPages, maxPages);
  const rest: OrdersPage[] = [];
  for (let start = 2; start <= pages; start += PARALLEL_PAGES) {
    const batch = Array.from({ length: Math.min(PARALLEL_PAGES, pages - start + 1) }, (_, i) => ordersPage(query, start + i, auth));
    rest.push(...await Promise.all(batch));
  }
  return {
    orders: [first, ...rest].flatMap((p) => p.results),
    truncated: first.totalPages > maxPages,
  };
}

async function readHolders() {
  const [rows, studio, redirects, team] = await Promise.all([
    b2bBackendFetch<B2BSourceRow[]>('/rows'),
    b2bBackendFetch<{ firms?: StudioFirm[] }>('/studio-access').then((r) => r.firms ?? null).catch(() => null),
    b2bBackendFetch<{ visits: EcVisitRow[] }>('/ec-visits?kind=redirect').catch(() => null),
    readMembers().catch(() => null),
  ]);
  return {
    book: buildNumberBook(rows, studio, (redirects?.visits ?? []).map(rowToEcVisit)),
    clientDb: clientDbFirms(rows),
    reps: buildRepTeams(team?.members ?? []),
    studioOk: !!studio,
    redirectsOk: !!redirects,
    teamOk: !!team,
  };
}

export async function buildBranchLedger(from: string, to: string, basis: LedgerBasis, auth: string): Promise<BranchLedger> {
  const dates = !from ? '' : basis === 'order'
    ? `order_from=${from}&order_to=${to}&branch_basis=estimate&`
    : `created_from=${from}&created_to=${to}&`;
  const [booked, holders] = await Promise.all([allOrders(`${dates}branch=${B2B_BRANCH}`, auth), readHolders()]);
  return {
    orders: booked.orders
      .map((o) => classifyOrder(o, true, holders.book, holders.reps))
      .filter((o): o is RevenueOrder => !!o),
    truncated: booked.truncated,
    studioOk: holders.studioOk,
  };
}

export async function buildRevenueReport(from: string, to: string, auth: string): Promise<RevenueReport> {
  const window = `order_from=${from}&order_to=${to}&branch_basis=estimate`;
  const [all, booked, { book, reps, studioOk, redirectsOk, teamOk }] = await Promise.all([
    allOrders(window, auth),
    allOrders(`${window}&branch=${B2B_BRANCH}`, auth),
    readHolders(),
  ]);

  const bookedIds = new Set(booked.orders.map((o) => o.id));
  const unique = new Map([...all.orders, ...booked.orders].map((o) => [o.id, o]));

  return {
    from,
    to,
    orders: [...unique.values()]
      .filter((o) => dealIsOrder(o.status))
      .map((o) => classifyOrder(o, bookedIds.has(o.id), book, reps))
      .filter((o): o is RevenueOrder => !!o),
    truncated: all.truncated || booked.truncated,
    studioOk,
    redirectsOk,
    teamOk,
    generatedAt: new Date().toISOString(),
  };
}

export async function buildFunnelReport(from: string, to: string, auth: string): Promise<FunnelReport> {
  const window = `created_from=${from}&created_to=${to}`;
  const [all, booked, { book, reps, clientDb, studioOk, redirectsOk, teamOk }] = await Promise.all([
    allOrders(window, auth, FUNNEL_PAGES),
    allOrders(`${window}&branch=${B2B_BRANCH}`, auth, FUNNEL_PAGES),
    readHolders(),
  ]);

  const rowKey = (o: OrderInput) => String(o.ticketId ?? o.id);
  const bookedKeys = new Set(booked.orders.map(rowKey));
  const unique = new Map([...all.orders, ...booked.orders].map((o) => [rowKey(o), o]));
  const enquiries: FunnelEnquiry[] = [];
  let referredSkipped = 0;
  for (const o of unique.values()) {
    const firm = clientDb.get(phoneOf(o.clientPhone));
    if (firm === undefined) continue;
    const classified = classifyOrder(o, bookedKeys.has(rowKey(o)), book, reps);
    const funnel = classified && funnelBucketOf(classified);
    if (!classified || !funnel) referredSkipped += 1;
    else enquiries.push({ ...classified, firm: firm || classified.firm, funnel });
  }

  return {
    from,
    to,
    enquiries,
    firms: new Set(clientDb.values()).size,
    referredSkipped,
    truncated: all.truncated || booked.truncated,
    studioOk,
    redirectsOk,
    teamOk,
    generatedAt: new Date().toISOString(),
  };
}
