import { ClientOrderHistoryRow, fetchClientOrderHistoriesApi } from '@/lib/mockApi';

export interface ClientOrderHistory {
  orders: number;
  lifetimeValue: number;
  openValue: number;
  enquiries: number;
  enquiryValue: number;
  furthestStatus: string | null;
}

export function normalizeClientPhone(phone: string | undefined): string {
  return (phone || '').replace(/\D/g, '').slice(-10);
}

const orderHistoryCache = new Map<string, ClientOrderHistory>();

const HISTORY_BATCH = 300;

export async function fetchClientOrderHistories(
  phones: (string | undefined)[],
): Promise<Record<string, ClientOrderHistory>> {
  const wanted = [...new Set(phones.map(normalizeClientPhone).filter((k) => k.length === 10))];
  const out: Record<string, ClientOrderHistory> = {};
  const missing: string[] = [];
  for (const key of wanted) {
    const cached = orderHistoryCache.get(key);
    if (cached) out[key] = cached; else missing.push(key);
  }
  if (!missing.length) return out;

  const batches: string[][] = [];
  for (let i = 0; i < missing.length; i += HISTORY_BATCH) batches.push(missing.slice(i, i + HISTORY_BATCH));

  const settled = await Promise.all(
    batches.map((batch) =>
      fetchClientOrderHistoriesApi(batch).catch((e) => {
        console.error('[b2b] client order history fetch failed', e);
        return {} as Record<string, ClientOrderHistoryRow>;
      }),
    ),
  );

  for (const batch of settled) {
    for (const [key, row] of Object.entries(batch)) {
      const history: ClientOrderHistory = {
        orders: Number(row.orders) || 0,
        lifetimeValue: Number(row.lifetimeValue) || 0,
        openValue: Number(row.openValue) || 0,
        enquiries: Number(row.enquiries) || 0,
        enquiryValue: Number(row.enquiryValue) || 0,
        furthestStatus: row.furthestStatus ?? null,
      };

      const normalized = normalizeClientPhone(key);
      orderHistoryCache.set(normalized, history);
      out[normalized] = history;
    }
  }

  for (const key of missing) {
    if (!out[key]) {
      const zero: ClientOrderHistory = { orders: 0, lifetimeValue: 0, openValue: 0, enquiries: 0, enquiryValue: 0, furthestStatus: null };
      orderHistoryCache.set(key, zero);
      out[key] = zero;
    }
  }
  return out;
}

