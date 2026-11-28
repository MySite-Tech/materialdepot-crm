import { after } from 'next/server';
import { MD_API_BASE_URL } from '../../api/core/config';
import type { CRMLeadRow } from '../../api/crm/leads';
import { istToday } from '../../b2b/stats/pipeline';
import { DEALS_STALE_MS, DEALS_TTL_MS, OPEN_CART_STATUSES, OPEN_PI_STATUSES } from '../../b2b/inbound-deals/constants';
import type { OpenDeal, OpenDealsReport } from '../../b2b/inbound-deals/types';
import { dealPhone, openDealKind, openDealsSince } from '../../b2b/inbound-deals/utils';
import { getCached, setCache } from '../cache';

const PAGE_SIZE = 1000;
const MAX_PAGES = 30;
const PARALLEL_PAGES = 8;

type Row = Pick<CRMLeadRow, 'id' | 'clientPhone' | 'status' | 'cartValue' | 'createdAt' | 'branch' | 'assignedTo'>;

interface Page { results: Row[]; totalPages: number }

async function page(query: string, n: number, auth: string): Promise<Page> {
  const res = await fetch(`${MD_API_BASE_URL}/crm/leads/?${query}&page_size=${PAGE_SIZE}&page=${n}`, {
    headers: { Authorization: auth },
    cache: 'no-store',
  });
  const body = await res.json().catch(() => null) as { data?: Page } | Page | null;
  const data = (body && 'data' in body ? body.data : body) as Page | null | undefined;
  if (!res.ok || !Array.isArray(data?.results)) throw new Error(`Open carts could not be read (${res.status})`);
  return data;
}

function toDeal(r: Row): OpenDeal | null {
  const kind = openDealKind(r.status);
  const phone = dealPhone(r.clientPhone);
  if (!kind || phone.length !== 10 || !r.id) return null;
  return {
    enqId: r.id, phone, status: r.status, kind,
    value: Number(r.cartValue) || 0,
    createdOn: String(r.createdAt || '').slice(0, 10),
    branch: r.branch || '', bm: r.assignedTo || '',
  };
}

async function buildOpenDeals(key: string, since: string, auth: string): Promise<OpenDealsReport> {
  const query = `status=${encodeURIComponent([...OPEN_CART_STATUSES, ...OPEN_PI_STATUSES].join(','))}&created_from=${since}`;
  const first = await page(query, 1, auth);
  const pages = Math.min(first.totalPages, MAX_PAGES);
  const rest: Page[] = [];
  for (let start = 2; start <= pages; start += PARALLEL_PAGES) {
    const batch = Array.from({ length: Math.min(PARALLEL_PAGES, pages - start + 1) }, (_, i) => page(query, start + i, auth));
    rest.push(...await Promise.all(batch));
  }
  const report: OpenDealsReport = {
    deals: [first, ...rest].flatMap((p) => p.results).map(toDeal).filter((d): d is OpenDeal => !!d),
    since,
    truncated: first.totalPages > MAX_PAGES,
  };
  setCache(key, report, DEALS_TTL_MS);
  setCache(`${key}:stale`, report, DEALS_STALE_MS);
  return report;
}

const building = new Map<string, Promise<OpenDealsReport>>();

function rebuild(key: string, since: string, auth: string): Promise<OpenDealsReport> {
  const running = building.get(key);
  if (running) return running;
  const run = buildOpenDeals(key, since, auth).finally(() => building.delete(key));
  building.set(key, run);
  return run;
}

export async function readOpenDeals(userId: string, auth: string, fresh: boolean): Promise<OpenDealsReport> {
  const since = openDealsSince(istToday());
  const key = `inbound-open-deals:${userId}:${since}`;
  if (fresh) return rebuild(key, since, auth);
  const hit = getCached(key) as OpenDealsReport | null;
  if (hit) return hit;
  const stale = getCached(`${key}:stale`) as OpenDealsReport | null;
  if (!stale) return rebuild(key, since, auth);
  after(() => rebuild(key, since, auth).catch(() => undefined));
  return stale;
}
