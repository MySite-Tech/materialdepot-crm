import { MD_API_BASE_URL } from '../api/core/config';
import { dealIsOrder } from '../../components/b2b/models/client';
import { rowToEcVisit } from '../b2b/ec-visits/utils';
import type { EcVisitRow } from '../b2b/ec-visits/types';
import { buildNumberBook, buildRepTeams, clientDbFirms, phoneOf } from '../b2b/revenue/utils/book';
import { funnelBucketOf } from '../b2b/revenue/utils/funnel';
import { classifyOrder } from '../b2b/revenue/utils/classify';
import { monthWindows } from '../b2b/revenue/utils/months';
import { istToday } from '../b2b/stats/pipeline';
import { channelSplits } from '../b2b/revenue/utils/rollup';
import { B2B_BOOKING, B2B_BRANCH, FUNNEL_PAGES, PAST_MONTH_TTL, TREND_MONTHS } from '../b2b/revenue/constants';
import type { B2BSourceRow, BookedOn, FunnelEnquiry, FunnelReport, OrderInput, RevenueOrder, RevenueReport, RevenueTrend, StudioFirm } from '../b2b/revenue/types';
import { getCached, setCache } from './cache';
import { b2bBackendFetch } from './b2b-backend';
import { readMembers } from './b2b-team';

const PAGE_SIZE = 1000;
const MAX_PAGES = 8;
const PARALLEL_PAGES = 8;
const TREND_PARALLEL = 2;
const FRESH_ENOUGH = 60_000;

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

type Holders = Awaited<ReturnType<typeof readHolders>>;

const inflight = new Map<string, Promise<RevenueReport>>();

interface Booked {
  orders: OrderInput[];
  on: Map<string, BookedOn>;
  truncated: boolean;
}

async function readBooked(from: string, to: string, query: (from: string, to: string) => string, keyOf: (o: OrderInput) => string, auth: string, maxPages = MAX_PAGES): Promise<Booked> {
  const eras = B2B_BOOKING.filter((b) => (!b.to || from <= b.to) && (!b.from || to >= b.from));
  const reads = await Promise.all(eras.map((b) =>
    allOrders(`${query(b.from > from ? b.from : from, b.to && b.to < to ? b.to : to)}&branch=${b.branch}`, auth, maxPages)));
  const on = new Map<string, BookedOn>();
  reads.forEach((r, i) => { for (const o of r.orders) on.set(keyOf(o), eras[i].shared ? 'shared' : 'branch'); });
  return { orders: reads.flatMap((r) => r.orders), on, truncated: reads.some((r) => r.truncated) };
}

export async function buildRevenueReport(from: string, to: string, auth: string, holders?: Promise<Holders>): Promise<RevenueReport> {
  const window = (f: string, t: string) => `order_from=${f}&order_to=${t}&branch_basis=estimate`;
  const idOf = (o: OrderInput) => o.id;
  const [all, booked, { book, reps, studioOk, redirectsOk, teamOk }] = await Promise.all([
    allOrders(window(from, to), auth),
    readBooked(from, to, window, idOf, auth),
    holders ?? readHolders(),
  ]);

  const unique = new Map([...all.orders, ...booked.orders].map((o) => [o.id, o]));

  return {
    from,
    to,
    orders: [...unique.values()]
      .filter((o) => dealIsOrder(o.status))
      .map((o) => classifyOrder(o, booked.on.get(o.id) ?? 'store', book, reps))
      .filter((o): o is RevenueOrder => !!o),
    truncated: all.truncated || booked.truncated,
    studioOk,
    redirectsOk,
    teamOk,
    generatedAt: new Date().toISOString(),
  };
}

export function revenueReport(userId: string, from: string, to: string, auth: string, fresh: boolean, holders?: () => Promise<Holders>): Promise<RevenueReport> {
  const key = `b2b-revenue:${userId}:${from}:${to}`;
  const cached = getCached(key) as RevenueReport | null;
  if (cached && (!fresh || Date.now() - Date.parse(cached.generatedAt) < FRESH_ENOUGH)) return Promise.resolve(cached);
  const running = inflight.get(key);
  if (running) return running;
  const past = to.slice(0, 7) < istToday().slice(0, 7);
  const build = buildRevenueReport(from, to, auth, holders?.())
    .then((r) => { setCache(key, r, past ? PAST_MONTH_TTL : undefined); return r; })
    .finally(() => inflight.delete(key));
  inflight.set(key, build);
  return build;
}

export async function buildRevenueTrend(userId: string, auth: string, fresh: boolean): Promise<RevenueTrend> {
  const windows = monthWindows(new Date(), TREND_MONTHS);
  let holders: Promise<Holders> | undefined;
  const sharedHolders = () => (holders ??= readHolders());
  const reports: RevenueReport[] = [];
  for (let start = 0; start < windows.length; start += TREND_PARALLEL) {
    const batch = windows.slice(start, start + TREND_PARALLEL).map((w) => revenueReport(userId, w.from, w.to, auth, fresh, sharedHolders));
    reports.push(...await Promise.all(batch));
  }

  return {
    months: windows.map((w, i) => {
      const split = channelSplits(reports[i].orders);
      return {
        ...w,
        direct: split.direct.value,
        redirected: split.redirected.value,
        ecDirect: split.ecDirect.value,
        referred: split.referred.value,
        orders: reports[i].orders.length,
        truncated: reports[i].truncated,
      };
    }).reverse(),
    studioOk: reports.every((r) => r.studioOk),
    generatedAt: new Date().toISOString(),
  };
}

export async function buildFunnelReport(from: string, to: string, auth: string): Promise<FunnelReport> {
  const window = (f: string, t: string) => `created_from=${f}&created_to=${t}`;
  const rowKey = (o: OrderInput) => String(o.ticketId ?? o.id);
  const [all, booked, { book, reps, clientDb, studioOk, redirectsOk, teamOk }] = await Promise.all([
    allOrders(window(from, to), auth, FUNNEL_PAGES),
    readBooked(from, to, window, rowKey, auth, FUNNEL_PAGES),
    readHolders(),
  ]);

  const unique = new Map([...all.orders, ...booked.orders].map((o) => [rowKey(o), o]));
  const enquiries: FunnelEnquiry[] = [];
  let referredSkipped = 0;
  for (const o of unique.values()) {
    const firm = clientDb.get(phoneOf(o.clientPhone));
    if (firm === undefined) continue;
    const classified = classifyOrder(o, booked.on.get(rowKey(o)) ?? 'store', book, reps);
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
