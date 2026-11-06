import { istToday } from '../../inbound';
import { ORDER_BANDS } from '../../../constants/client';
import { ClientOrderMetrics, ClientStatus } from '../../../types/client';

function daysSinceLastOrder(m: ClientOrderMetrics, today: string): number | undefined {
  const last = String(m.lastOrderPlaced || '').slice(0, 10);
  const from = Date.parse(`${last}T00:00:00Z`);
  const to = Date.parse(`${today}T00:00:00Z`);
  return !last || Number.isNaN(from) || Number.isNaN(to) ? undefined : Math.round((to - from) / 86_400_000);
}

export function clientStatus(m: ClientOrderMetrics, today: string = istToday()): ClientStatus {
  if (m.dateState === 'pending' || m.dateState === 'unavailable' || m.dateState === 'no-phone') return 'Unknown';
  const days = daysSinceLastOrder(m, today);
  if (days === undefined) return 'Never ordered';
  if (days < 0) return 'Unknown';
  return ORDER_BANDS.find((b) => days <= b.upTo)?.status ?? 'Inactive 12+ months';
}

export function lastOrderInFuture(m: ClientOrderMetrics, today: string = istToday()): boolean {
  return (daysSinceLastOrder(m, today) ?? 0) < 0;
}

export function daysToLapse(m: ClientOrderMetrics, today: string = istToday()): number | undefined {
  const status = clientStatus(m, today);
  const days = daysSinceLastOrder(m, today);
  if (days === undefined) return undefined;
  const band = ORDER_BANDS.slice(0, 2).find((b) => b.status === status);
  return band ? band.upTo - days : undefined;
}
