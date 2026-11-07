import { b2bBackendFetch } from '@/lib/server/b2b-backend';
import { allOrders } from '@/lib/server/b2b-revenue';
import { getCached, setCache } from '@/lib/server/cache';
import { ORDERS_TTL_MS, YEAR_MONTHS } from '@/lib/b2b/client-import/constants';
import type { ReviewDecision, ReviewQueue } from '@/lib/b2b/client-import/types';
import { planReview } from '@/lib/b2b/client-import/utils/queue';
import type { B2BLeadRow } from '@/lib/b2b/data/rows';
import type { CRMLeadRow } from '@/lib/api/crm/leads';
import { monthWindows } from '@/lib/b2b/revenue/utils/months';

const PARALLEL_WINDOWS = 3;
const ORDERS_KEY = 'b2b-client-review:orders';

interface YearOrders {
  orders: CRMLeadRow[];
  from: string;
  to: string;
  truncated: boolean;
  readAt: string;
}

async function readYear(auth: string): Promise<YearOrders> {
  const windows = monthWindows(new Date(), YEAR_MONTHS).map(({ from, to }) => ({ from, to }));
  const query = (w: { from: string; to: string }) => `order_from=${w.from}&order_to=${w.to}&branch_basis=estimate`;
  const reads: Awaited<ReturnType<typeof allOrders>>[] = [];
  for (let i = 0; i < windows.length; i += PARALLEL_WINDOWS) {
    reads.push(...await Promise.all(windows.slice(i, i + PARALLEL_WINDOWS).map((w) => allOrders(query(w), auth))));
  }
  const unique = new Map(reads.flatMap((r) => r.orders).map((o) => [o.id, o]));
  return {
    orders: [...unique.values()],
    from: windows[windows.length - 1].from,
    to: windows[0].to,
    truncated: reads.some((r) => r.truncated),
    readAt: new Date().toISOString(),
  };
}

let inflight: Promise<YearOrders> | null = null;

function yearOrders(auth: string, refresh: boolean): Promise<YearOrders> {
  const hit = refresh ? null : getCached(ORDERS_KEY) as YearOrders | null;
  if (hit) return Promise.resolve(hit);
  inflight ??= readYear(auth)
    .then((read) => {
      setCache(ORDERS_KEY, read, ORDERS_TTL_MS);
      return read;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

export async function reviewQueue(auth: string, refresh: boolean): Promise<ReviewQueue> {
  const [year, rows, review] = await Promise.all([
    yearOrders(auth, refresh),
    b2bBackendFetch<B2BLeadRow[]>('/rows'),
    b2bBackendFetch<{ decisions: ReviewDecision[] }>('/client-review').catch(() => null),
  ]);
  return {
    from: year.from,
    to: year.to,
    ordersRead: year.orders.length,
    truncated: year.truncated,
    checkedAt: year.readAt,
    decisionsRead: !!review,
    ...planReview(year.orders, rows, review?.decisions ?? []),
  };
}
