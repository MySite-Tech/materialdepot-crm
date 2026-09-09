import { ClientOrderHistoryRow, fetchClientOrderHistoriesApi } from '@/lib/mockApi';
// ── Client order history (lifetime, from Django deal tickets) ─────────────────
// One batched request for the whole board via /crm/leads/client-order-history/.
// That endpoint groups deal tickets by client in two indexed queries and reuses
// the same status/value derivation as /crm/leads/stats/, so a KAM card can never
// disagree with the Leads tab for the same client.

export interface ClientOrderHistory {
  orders: number;         // won deal count, all time
  lifetimeValue: number;  // won deal value, all time
  openValue: number;      // still-active pipeline for this client
  enquiries: number;      // every deal ever raised, won or not
  enquiryValue: number;   // value of every deal ever raised
  furthestStatus: string | null;  // furthest-progressed deal status, drives auto-advance
}

// Last 10 digits, so '+91 99000 99013' and '9900099013' resolve to one client.
export function normalizeClientPhone(phone: string | undefined): string {
  return (phone || '').replace(/\D/g, '').slice(-10);
}

// Module-level, so re-entering the tab doesn't refetch what we already have.
const orderHistoryCache = new Map<string, ClientOrderHistory>();

// The backend caps a request at 300 phones; chunk so a large board still works.
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
      // Key on the normalized phone, not the backend's raw contact string.
      const normalized = normalizeClientPhone(key);
      orderHistoryCache.set(normalized, history);
      out[normalized] = history;
    }
  }
  // A phone the backend returned nothing for has no deal tickets at all. Cache
  // that as a real zero, so it isn't re-requested on every board render.
  for (const key of missing) {
    if (!out[key]) {
      const zero: ClientOrderHistory = { orders: 0, lifetimeValue: 0, openValue: 0, enquiries: 0, enquiryValue: 0, furthestStatus: null };
      orderHistoryCache.set(key, zero);
      out[key] = zero;
    }
  }
  return out;
}

