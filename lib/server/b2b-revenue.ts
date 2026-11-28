import { MD_API_BASE_URL } from '../api/core/config';
import type { ClientOrderHistoryRow } from '../api/crm/leads';
import { dealIsOrder } from '../../components/b2b/models/client';
import { rowToEcVisit } from '../b2b/ec-visits/utils';
import type { EcVisitRow } from '../b2b/ec-visits/types';
import { buildNumberBook, buildRepTeams, clientDbFirms, clientDbGroups, phoneOf } from '../b2b/revenue/utils/book';
import { clientFlow, flowPhones } from '../b2b/revenue/clients';
import type { ClientFlowReport, MonthDigest } from '../b2b/revenue/clients';
import { funnelBucketOf } from '../b2b/revenue/utils/funnel';
import { classifyOrder } from '../b2b/revenue/utils/classify';
import { monthWindows } from '../b2b/revenue/utils/months';
import { istToday } from '../b2b/stats/pipeline';
import { channelSplits } from '../b2b/revenue/utils/rollup';
import { B2B_BOOKING, B2B_BRANCH, CHURN_GAP, FLOW_LOOKBACK, FLOW_MONTHS, FUNNEL_PAGES, ORDER_HISTORY_FROM, PAST_MONTH_KEEP, PAST_MONTH_TTL, TREND_MONTHS } from '../b2b/revenue/constants';
import type { B2BSourceRow, BookedOn, CrmReferralInput, EcSpocReport, EcSpocSeen, FunnelEnquiry, FunnelReport, OrderInput, RevenueOrder, RevenueReport, RevenueTrend, StudioFirm } from '../b2b/revenue/types';
import { getCached, setCache } from './cache';
import { b2bBackendFetch } from './b2b-backend';
import { readMembers } from './b2b-team';
import { staffDirectory } from './session';
import { isPlaceholderName } from '../b2b/team/utils';

const PAGE_SIZE = 1000;
const MAX_PAGES = 8;
const PARALLEL_PAGES = 8;
const TREND_PARALLEL = 3;
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

export async function allOrders(query: string, auth: string, maxPages = MAX_PAGES): Promise<{ orders: OrderInput[]; truncated: boolean }> {
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

async function readHolders(auth: string) {
  const [rows, studio, redirects, team, staff, referrals] = await Promise.all([
    b2bBackendFetch<B2BSourceRow[]>('/rows'),
    b2bBackendFetch<{ firms?: StudioFirm[] }>('/studio-access').then((r) => r.firms ?? null).catch(() => null),
    b2bBackendFetch<{ visits: EcVisitRow[] }>('/ec-visits?kind=redirect').catch(() => null),
    readMembers().catch(() => null),
    staffDirectory(auth).catch(() => []),
    b2bBackendFetch<{ referrals: CrmReferralInput[] }>('/referrals').then((r) => r.referrals).catch(() => null),
  ]);
  return {
    book: buildNumberBook(rows, studio, (redirects?.visits ?? []).map(rowToEcVisit), referrals ?? []),
    clientDb: clientDbFirms(rows),
    groups: clientDbGroups(rows),
    reps: buildRepTeams(team?.members ?? [], staff),
    studioOk: !!studio,
    redirectsOk: !!redirects,
    teamOk: !!team,
  };
}

type Holders = Awaited<ReturnType<typeof readHolders>>;

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

interface BuiltMonth {
  report: RevenueReport;
  digest: MonthDigest;
}

async function buildMonth(from: string, to: string, auth: string, holders?: Promise<Holders>): Promise<BuiltMonth> {
  const window = (f: string, t: string) => `order_from=${f}&order_to=${t}&branch_basis=estimate`;
  const idOf = (o: OrderInput) => o.id;
  const [all, booked, { book, reps, studioOk, redirectsOk, teamOk }] = await Promise.all([
    allOrders(window(from, to), auth),
    readBooked(from, to, window, idOf, auth),
    holders ?? readHolders(auth),
  ]);

  const unique = new Map([...all.orders, ...booked.orders].map((o) => [o.id, o]));
  const placed = [...unique.values()].filter((o) => dealIsOrder(o.status));
  const orders = placed
    .map((o) => classifyOrder(o, booked.on.get(o.id) ?? 'store', book, reps))
    .filter((o): o is RevenueOrder => !!o);
  const truncated = all.truncated || booked.truncated;
  const generatedAt = new Date().toISOString();

  return {
    report: { from, to, orders, truncated, studioOk, redirectsOk, teamOk, generatedAt },
    digest: {
      key: from.slice(0, 7),
      buyers: [...new Set(placed.map((o) => phoneOf(o.clientPhone)).filter(Boolean))],
      orders: orders.map((o) => ({ phone: o.phone, channel: o.channel, value: o.value, name: o.firm || o.client })),
      truncated,
      generatedAt,
    },
  };
}

const inflight = new Map<string, Promise<BuiltMonth>>();

function cachedMonth<T extends { generatedAt: string }>(
  kind: 'report' | 'digest',
  userId: string, from: string, to: string, auth: string, fresh: boolean,
  holders?: () => Promise<Holders>,
): Promise<T> {
  const keys = { report: `b2b-revenue:${userId}:${from}:${to}`, digest: `b2b-digest:${userId}:${from}:${to}` };
  const past = to.slice(0, 7) < istToday().slice(0, 7);
  const ttl = past ? PAST_MONTH_KEEP : undefined;
  const cached = getCached(keys[kind]) as T | null;
  const age = cached ? Date.now() - Date.parse(cached.generatedAt) : Infinity;
  const rebuild = () => {
    let build = inflight.get(keys.report);
    if (!build) {
      build = buildMonth(from, to, auth, holders?.())
        .then((m) => { setCache(keys.digest, m.digest, ttl); return m; })
        .finally(() => inflight.delete(keys.report));
      inflight.set(keys.report, build);
    }
    return build.then((m) => {
      if (kind === 'report') setCache(keys.report, m.report, ttl);
      return m[kind] as unknown as T;
    });
  };
  if (cached && fresh && age < FRESH_ENOUGH) return Promise.resolve(cached);
  if (cached && !fresh) {
    if (past && age > PAST_MONTH_TTL) rebuild().catch(() => undefined);
    return Promise.resolve(cached);
  }
  return rebuild();
}

export const revenueReport = (userId: string, from: string, to: string, auth: string, fresh: boolean, holders?: () => Promise<Holders>): Promise<RevenueReport> =>
  cachedMonth<RevenueReport>('report', userId, from, to, auth, fresh, holders);

const monthDigest = (userId: string, from: string, to: string, auth: string, fresh: boolean, holders?: () => Promise<Holders>): Promise<MonthDigest> =>
  cachedMonth<MonthDigest>('digest', userId, from, to, auth, fresh, holders);

const FIRST_ORDER_BATCH = 280;
const FLOW_TTL = 5 * 60_000;

async function firstOrderDates(phones: string[], auth: string): Promise<{ firsts: Map<string, string>; ok: boolean }> {
  const firsts = new Map<string, string>();
  let ok = true;
  const batches = Array.from({ length: Math.ceil(phones.length / FIRST_ORDER_BATCH) }, (_, i) => phones.slice(i * FIRST_ORDER_BATCH, (i + 1) * FIRST_ORDER_BATCH));
  await Promise.all(batches.map(async (batch) => {
    try {
      const res = await fetch(`${MD_API_BASE_URL}/crm/leads/client-order-history/?phones=${batch.join(',')}`, { headers: { Authorization: auth }, cache: 'no-store' });
      const body = await res.json().catch(() => null) as { data?: Record<string, ClientOrderHistoryRow> } | Record<string, ClientOrderHistoryRow> | null;
      if (!res.ok || !body) throw new Error(String(res.status));
      const rows = ('data' in body && body.data ? body.data : body) as Record<string, ClientOrderHistoryRow>;
      for (const [phone, row] of Object.entries(rows)) if (row?.firstOrderDate) firsts.set(phoneOf(phone), row.firstOrderDate.slice(0, 10));
    } catch {
      ok = false;
    }
  }));
  return { firsts, ok };
}

async function buildClientFlow(userId: string, auth: string, fresh: boolean): Promise<ClientFlowReport> {
  const all = monthWindows(new Date(), FLOW_MONTHS + FLOW_LOOKBACK).reverse();
  const windows = all.filter((w) => w.key >= ORDER_HISTORY_FROM);
  const current = windows[windows.length - 1].key;
  const holders = readHolders(auth);
  const digests: MonthDigest[] = [];
  for (let start = 0; start < windows.length; start += TREND_PARALLEL) {
    const batch = windows.slice(start, start + TREND_PARALLEL)
      .map((w) => monthDigest(userId, w.from, w.to, auth, fresh && w.key === current, () => holders));
    digests.push(...await Promise.all(batch));
  }
  const { groups, studioOk, redirectsOk, teamOk } = await holders;
  const analysedCount = Math.min(FLOW_MONTHS, Math.max(0, windows.length - CHURN_GAP));
  const { firsts, ok } = await firstOrderDates(flowPhones(digests, groups, analysedCount), auth);
  const analysed = windows.slice(-analysedCount);
  return {
    months: clientFlow(digests, groups, analysedCount, firsts).map((m, i) => ({ ...m, label: analysed[i].label, partial: analysed[i].key === current })),
    historyFrom: windows[0].from,
    historyOk: ok,
    studioOk,
    redirectsOk,
    teamOk,
    generatedAt: new Date().toISOString(),
  };
}

export async function clientFlowReport(userId: string, auth: string, fresh: boolean): Promise<ClientFlowReport> {
  const key = `b2b-client-flow:${userId}`;
  const cached = getCached(key) as ClientFlowReport | null;
  if (cached && !fresh) return cached;
  const report = await buildClientFlow(userId, auth, fresh);
  setCache(key, report, FLOW_TTL);
  return report;
}

async function trendReports(userId: string, auth: string, fresh: boolean) {
  const windows = monthWindows(new Date(), TREND_MONTHS);
  let holders: Promise<Holders> | undefined;
  const sharedHolders = () => (holders ??= readHolders(auth));
  const reports: RevenueReport[] = [];
  for (let start = 0; start < windows.length; start += TREND_PARALLEL) {
    const batch = windows.slice(start, start + TREND_PARALLEL).map((w) => revenueReport(userId, w.from, w.to, auth, fresh, sharedHolders));
    reports.push(...await Promise.all(batch));
  }
  return { windows, reports };
}

export async function buildRevenueTrend(userId: string, auth: string, fresh: boolean): Promise<RevenueTrend> {
  const { windows, reports } = await trendReports(userId, auth, fresh);
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

const BY_B2B_REP = new Set([1, 2]);

export async function buildEcSpocs(userId: string, auth: string): Promise<EcSpocReport> {
  const { windows, reports } = await trendReports(userId, auth, false);
  const spocs: Record<string, EcSpocSeen> = {};
  for (const o of reports.flatMap((r) => r.orders)) {
    if (o.bookedOnB2B || BY_B2B_REP.has(o.type) || !o.placedBy || !o.phone || isPlaceholderName(o.placedBy)) continue;
    const at = o.ticket.placedAt || o.ticket.createdAt || '';
    if (spocs[o.phone] && spocs[o.phone].at >= at) continue;
    spocs[o.phone] = { name: o.placedBy, store: o.store, at, enquiryId: o.id };
  }
  return { from: windows[windows.length - 1].from, to: windows[0].to, spocs, generatedAt: new Date().toISOString() };
}

export async function buildFunnelReport(from: string, to: string, auth: string): Promise<FunnelReport> {
  const window = (f: string, t: string) => `created_from=${f}&created_to=${t}`;
  const rowKey = (o: OrderInput) => String(o.ticketId ?? o.id);
  const [all, booked, { book, reps, clientDb, studioOk, redirectsOk, teamOk }] = await Promise.all([
    allOrders(window(from, to), auth, FUNNEL_PAGES),
    readBooked(from, to, window, rowKey, auth, FUNNEL_PAGES),
    readHolders(auth),
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
