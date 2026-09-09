import { B2BBulkResult, ClientOrderHistoryRow, fetchB2BBulkApi, fetchClientOrderHistoriesApi } from '@/lib/api';

export interface ClientOrderHistory {
  orders: number;
  lifetimeValue: number;
  openValue: number;
  enquiries: number;
  enquiryValue: number;
  furthestStatus: string | null;
  firstOrderDate: string | null;
  firstOrderValue: number | null;
  lastOrderDate: string | null;
}

function normalizeClientPhone(phone: string | undefined): string {
  return (phone || '').replace(/\D/g, '').slice(-10);
}

const orderHistoryCache = new Map<string, ClientOrderHistory>();

const HISTORY_BATCH = 300;

function toHistory(row: ClientOrderHistoryRow): ClientOrderHistory {
  return {
    orders: Number(row.orders) || 0,
    lifetimeValue: Number(row.lifetimeValue) || 0,
    openValue: Number(row.openValue) || 0,
    enquiries: Number(row.enquiries) || 0,
    enquiryValue: Number(row.enquiryValue) || 0,
    furthestStatus: row.furthestStatus ?? null,
    firstOrderDate: row.firstOrderDate ?? null,
    firstOrderValue: row.firstOrderValue ?? null,
    lastOrderDate: row.lastOrderDate ?? null,
  };
}

function absorb(
  batch: Record<string, ClientOrderHistoryRow>,
  out: Record<string, ClientOrderHistory>,
): void {
  for (const [key, row] of Object.entries(batch)) {
    const history = toHistory(row);
    const normalized = normalizeClientPhone(key);
    orderHistoryCache.set(normalized, history);
    out[normalized] = history;
  }
}

// A phone the backend simply has no deals for is a real zero and worth caching.
// A phone we never got an answer for is not: caching that would keep every card
// on this page reading zero until a full reload, and the cache has no TTL.
function zeroFill(keys: string[], out: Record<string, ClientOrderHistory>, cache: boolean): void {
  for (const key of keys) {
    if (out[key]) continue;
    const zero: ClientOrderHistory = { orders: 0, lifetimeValue: 0, openValue: 0, enquiries: 0, enquiryValue: 0, furthestStatus: null, firstOrderDate: null, firstOrderValue: null, lastOrderDate: null };
    if (cache) orderHistoryCache.set(key, zero);
    out[key] = zero;
  }
}

function splitCached(phones: (string | undefined)[]): {
  out: Record<string, ClientOrderHistory>;
  missing: string[];
} {
  const wanted = [...new Set(phones.map(normalizeClientPhone).filter((k) => k.length === 10))];
  const out: Record<string, ClientOrderHistory> = {};
  const missing: string[] = [];
  for (const key of wanted) {
    const cached = orderHistoryCache.get(key);
    if (cached) out[key] = cached; else missing.push(key);
  }
  return { out, missing };
}

async function fetchClientOrderHistories(
  phones: (string | undefined)[],
): Promise<Record<string, ClientOrderHistory>> {
  const { out, missing } = splitCached(phones);
  if (!missing.length) return out;

  const batches: string[][] = [];
  for (let i = 0; i < missing.length; i += HISTORY_BATCH) batches.push(missing.slice(i, i + HISTORY_BATCH));

  let ok = true;
  const settled = await Promise.all(
    batches.map((batch) =>
      fetchClientOrderHistoriesApi(batch).catch((e) => {
        console.error('[b2b] client order history fetch failed', e);
        ok = false;
        return {} as Record<string, ClientOrderHistoryRow>;
      }),
    ),
  );

  for (const batch of settled) absorb(batch, out);
  zeroFill(missing, out, ok);
  return out;
}

export interface B2BBulk {
  histories: Record<string, ClientOrderHistory>;

  deals: B2BBulkResult['deals'];

  // False when the request failed. Callers must not present a missing history
  // as a real zero — a client with unknown dates reads "Unknown", not
  // "Inactive", which is what the per-phone path used to do.
  ok: boolean;
}

// The dashboard and the KAM board both need lifetime totals per client phone
// and the deal behind each enquiry id. Neither depends on the other, so one
// request answers both instead of two sequential round trips.
export async function fetchB2BBulk(
  phones: (string | undefined)[],
  enquiryIds: string[],
): Promise<B2BBulk> {
  const { out, missing } = splitCached(phones);
  const ids = [...new Set(enquiryIds.filter(Boolean))].slice(0, HISTORY_BATCH);

  const head = missing.slice(0, HISTORY_BATCH);
  const rest = missing.slice(HISTORY_BATCH);

  let deals: B2BBulkResult['deals'] = [];
  let ok = true;
  if (head.length || ids.length) {
    const res = await fetchB2BBulkApi(head, ids).catch((e) => {
      console.error('[b2b] bulk resolve failed', e);
      ok = false;
      return { histories: {}, deals: [] } as B2BBulkResult;
    });
    deals = res.deals;
    absorb(res.histories, out);
  }
  if (rest.length) Object.assign(out, await fetchClientOrderHistories(rest));
  zeroFill(missing, out, ok);
  return { histories: out, deals, ok };
}
