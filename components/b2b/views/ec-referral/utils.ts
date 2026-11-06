import type { ReferralSummary } from '@/lib/b2b/ec-referral/types';
import type { EcVisit } from '@/lib/b2b/ec-visits/types';
import type { ClientOrderHistory } from '@/lib/b2b/orders/history';
import type { OrdersState } from './hooks/use-ec-referrals';

export type OrdersCell =
  | { state: 'loading' }
  | { state: 'unknown' }
  | { state: 'ok'; orders: number; value: number; last: string | null; before: boolean };

export function referralStage(r: ReferralSummary): string {
  if (r.status === 'Lost') return 'Closed as lost';
  if (r.status === 'Closed') return 'Converted';
  return r.bm ? `With ${r.bm} · ${r.status}` : 'Waiting to be assigned';
}

export function ordersCell(r: ReferralSummary, orders: OrdersState): OrdersCell {
  if (orders === 'loading') return { state: 'loading' };
  if (orders === 'failed' || orders.unread.has(r.phone)) return { state: 'unknown' };
  const h: ClientOrderHistory | undefined = orders.histories[r.phone];
  if (!h) return { state: 'unknown' };
  return {
    state: 'ok',
    orders: h.orders,
    value: h.lifetimeValue,
    last: h.lastOrderDate,
    before: !!h.firstOrderDate && h.firstOrderDate.slice(0, 10) < r.at.slice(0, 10),
  };
}

export function referralTotals(rows: ReferralSummary[], orders: OrdersState) {
  const cells = rows.map((r) => ordersCell(r, orders));
  const known = cells.filter((c): c is Extract<OrdersCell, { state: 'ok' }> => c.state === 'ok');
  return {
    referred: rows.length,
    withOutreach: rows.filter((r) => r.bm && r.status !== 'Lost' && r.status !== 'Closed').length,
    converted: rows.filter((r) => r.status === 'Closed').length,
    ordering: known.filter((c) => c.orders > 0).length,
    value: known.reduce((n, c) => n + c.value, 0),
    unknown: cells.length - known.length,
  };
}

export function redirectTotals(rows: EcVisit[]) {
  const checked = rows.filter((v) => v.assisted);
  return {
    sent: rows.length,
    visited: rows.filter((v) => v.status === 'Visited').length,
    waiting: rows.filter((v) => v.status === 'Directed').length,
    value: checked.reduce((n, v) => n + (v.assisted?.value ?? 0), 0),
    checked: checked.length,
  };
}

const day = (iso: string | undefined) => String(iso ?? '').slice(0, 10);

export const inRange = (iso: string | undefined, from: string, to: string): boolean =>
  (!from || day(iso) >= from) && (!to || day(iso) <= to);

export const hay = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' ').toLowerCase();
