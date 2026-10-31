import { MD_API_BASE_URL } from '../api/core/config';
import { dealIsOrder } from '../../components/b2b/models/client';
import { rowToEcVisit } from '../b2b/ec-visits/utils';
import type { EcVisitRow } from '../b2b/ec-visits/types';
import { buildNumberBook, buildRepTeams } from '../b2b/revenue/utils/book';
import { classifyOrder } from '../b2b/revenue/utils/classify';
import { B2B_BRANCH } from '../b2b/revenue/constants';
import type { B2BSourceRow, OrderInput, RevenueOrder, RevenueReport, StudioFirm } from '../b2b/revenue/types';
import { b2bBackendFetch } from './b2b-backend';
import { readMembers } from './b2b-team';

const PAGE_SIZE = 1000;
const MAX_PAGES = 8;

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

async function allOrders(query: string, auth: string): Promise<{ orders: OrderInput[]; truncated: boolean }> {
  const first = await ordersPage(query, 1, auth);
  const pages = Math.min(first.totalPages, MAX_PAGES);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pages - 1) }, (_, i) => ordersPage(query, i + 2, auth)),
  );
  return {
    orders: [first, ...rest].flatMap((p) => p.results),
    truncated: first.totalPages > MAX_PAGES,
  };
}

export async function buildRevenueReport(from: string, to: string, auth: string): Promise<RevenueReport> {
  const window = `order_from=${from}&order_to=${to}&branch_basis=estimate`;
  const [all, booked, rows, studio, redirects, team] = await Promise.all([
    allOrders(window, auth),
    allOrders(`${window}&branch=${B2B_BRANCH}`, auth),
    b2bBackendFetch<B2BSourceRow[]>('/rows'),
    b2bBackendFetch<{ firms?: StudioFirm[] }>('/studio-access').then((r) => r.firms ?? null).catch(() => null),
    b2bBackendFetch<{ visits: EcVisitRow[] }>('/ec-visits?kind=redirect').catch(() => null),
    readMembers().catch(() => null),
  ]);

  const book = buildNumberBook(rows, studio, (redirects?.visits ?? []).map(rowToEcVisit));
  const reps = buildRepTeams(team?.members ?? []);
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
    studioOk: !!studio,
    redirectsOk: !!redirects,
    teamOk: !!team,
    generatedAt: new Date().toISOString(),
  };
}
