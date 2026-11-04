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

const BULK_QUERY_BYTES = 3800;

const PHONE_QUERY_BYTES = 13;

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

function zeroFill(keys: string[], out: Record<string, ClientOrderHistory>, unread: ReadonlySet<string>): void {
  for (const key of keys) {
    if (out[key] || unread.has(key)) continue;
    const zero: ClientOrderHistory = { orders: 0, lifetimeValue: 0, openValue: 0, enquiries: 0, enquiryValue: 0, furthestStatus: null, firstOrderDate: null, firstOrderValue: null, lastOrderDate: null };
    orderHistoryCache.set(key, zero);
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

async function fetchClientOrderHistories(phones: string[], out: Record<string, ClientOrderHistory>, unread: Set<string>): Promise<void> {
  const batches: string[][] = [];
  for (let i = 0; i < phones.length; i += HISTORY_BATCH) batches.push(phones.slice(i, i + HISTORY_BATCH));

  await Promise.all(
    batches.map((batch) =>
      fetchClientOrderHistoriesApi(batch)
        .then((rows) => absorb(rows, out))
        .catch((e) => {
          console.error('[b2b] client order history fetch failed', e);
          for (const p of batch) unread.add(p);
        }),
    ),
  );
}

export interface B2BBulk {
  histories: Record<string, ClientOrderHistory>;

  deals: B2BBulkResult['deals'];

  unread: ReadonlySet<string>;
}

export async function fetchB2BBulk(
  phones: (string | undefined)[],
  enquiryIds: string[],
): Promise<B2BBulk> {
  const { out, missing } = splitCached(phones);
  const ids = [...new Set(enquiryIds.filter(Boolean))].slice(0, HISTORY_BATCH);

  const idBytes = ids.reduce((n, id) => n + encodeURIComponent(id).length + 3, 0);
  const headSize = Math.min(HISTORY_BATCH, Math.floor((BULK_QUERY_BYTES - idBytes) / PHONE_QUERY_BYTES));
  const head = missing.slice(0, headSize);
  const rest = missing.slice(headSize);
  const unread = new Set<string>();

  let deals: B2BBulkResult['deals'] = [];
  if (head.length || ids.length) {
    const res = await fetchB2BBulkApi(head, ids).catch((e) => {
      console.error('[b2b] bulk resolve failed', e);
      for (const p of head) unread.add(p);
      return { histories: {}, deals: [] } as B2BBulkResult;
    });
    deals = res.deals;
    absorb(res.histories, out);
  }
  if (rest.length) await fetchClientOrderHistories(rest, out, unread);
  zeroFill(missing, out, unread);
  return { histories: out, deals, unread };
}
