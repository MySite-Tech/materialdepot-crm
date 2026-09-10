import { istToday } from '../../inbound';
import { ACTIVE_WINDOW_MONTHS } from '../../../constants/client';
import { ClientOrderMetrics, ClientStatus } from '../../../types/client';
import { monthsBefore } from '../../utils/client';
export function clientStatus(m: ClientOrderMetrics, today: string = istToday()): ClientStatus {
  if (m.dateState === 'pending' || m.dateState === 'unavailable' || m.dateState === 'no-phone') return 'Unknown';
  const last = String(m.lastOrderPlaced || '').slice(0, 10);
  if (!last) return 'Inactive';
  return last >= monthsBefore(today, ACTIVE_WINDOW_MONTHS) ? 'Active' : 'Inactive';
}

export function daysToInactive(m: ClientOrderMetrics, today: string = istToday()): number | undefined {
  if (clientStatus(m, today) !== 'Active') return undefined;
  const last = String(m.lastOrderPlaced || '').slice(0, 10);
  if (!last) return undefined;
  const cutoff = Date.parse(`${last}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(cutoff) || Number.isNaN(now)) return undefined;

  const [ly, lm, ld] = last.split('-').map(Number);
  const expiry = new Date(Date.UTC(ly, lm - 1 + ACTIVE_WINDOW_MONTHS, ld)).getTime();
  return Math.max(0, Math.round((expiry - now) / 86_400_000));
}

