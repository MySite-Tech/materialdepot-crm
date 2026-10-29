import { istToday } from '../../inbound';
import { ACTIVE_DAYS, INACTIVE_DAYS } from '../../../constants/client';
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
  if (days === undefined || days > INACTIVE_DAYS) return 'Inactive';
  return days <= ACTIVE_DAYS ? 'Active' : 'Inactive 1 month';
}

export function daysToLapse(m: ClientOrderMetrics, today: string = istToday()): number | undefined {
  const status = clientStatus(m, today);
  const days = daysSinceLastOrder(m, today);
  if (days === undefined) return undefined;
  if (status === 'Active') return ACTIVE_DAYS - days;
  if (status === 'Inactive 1 month') return INACTIVE_DAYS - days;
  return undefined;
}
