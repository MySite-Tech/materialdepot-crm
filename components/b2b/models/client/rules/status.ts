import { istToday } from '../../inbound';
import { ORDER_BANDS } from '../../../constants/client';
import { ClientOrderMetrics, ClientStatus } from '../../../types/client';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthIndex(date: string): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : undefined;
}

function monthsSinceLastOrder(m: ClientOrderMetrics, today: string): number | undefined {
  const last = String(m.lastOrderPlaced || '').slice(0, 10);
  const from = monthIndex(last);
  const to = monthIndex(today);
  if (from === undefined || to === undefined) return undefined;
  return last > today.slice(0, 10) ? -1 : to - from;
}

function monthStart(index: number): string {
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`;
}

function monthLabel(index: number, withYear: boolean): string {
  return `${MONTH_NAMES[index % 12]}${withYear ? ` ${Math.floor(index / 12)}` : ''}`;
}

export function clientStatus(m: ClientOrderMetrics, today: string = istToday()): ClientStatus {
  if (m.dateState === 'pending' || m.dateState === 'unavailable' || m.dateState === 'no-phone') return 'Unknown';
  const months = monthsSinceLastOrder(m, today);
  if (months === undefined) return 'Never ordered';
  if (months < 0) return 'Unknown';
  return ORDER_BANDS.find((b) => months <= b.upTo)?.status ?? 'Inactive over 12 months';
}

export function lastOrderInFuture(m: ClientOrderMetrics, today: string = istToday()): boolean {
  return (monthsSinceLastOrder(m, today) ?? 0) < 0;
}

export function daysToLapse(m: ClientOrderMetrics, today: string = istToday()): number | undefined {
  const status = clientStatus(m, today);
  const from = monthIndex(String(m.lastOrderPlaced || '').slice(0, 10));
  const band = ORDER_BANDS.slice(0, 2).find((b) => b.status === status);
  if (!band || from === undefined) return undefined;
  const lapse = Date.parse(`${monthStart(from + band.upTo + 1)}T00:00:00Z`);
  return Math.round((lapse - Date.parse(`${today.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
}

export function nextStatus(status: ClientStatus): ClientStatus | undefined {
  const i = ORDER_BANDS.findIndex((b) => b.status === status);
  return i < 0 ? undefined : ORDER_BANDS[i + 1]?.status ?? 'Inactive over 12 months';
}

export function statusMonths(status: ClientStatus, today: string = istToday()): string | undefined {
  const now = monthIndex(today);
  const i = ORDER_BANDS.findIndex((b) => b.status === status);
  if (now === undefined) return undefined;
  if (status === 'Inactive over 12 months') return `before ${monthLabel(now - ORDER_BANDS[ORDER_BANDS.length - 1].upTo, true)}`;
  if (i < 0) return undefined;
  const newest = now - (i === 0 ? 0 : ORDER_BANDS[i - 1].upTo + 1);
  const oldest = now - ORDER_BANDS[i].upTo;
  const sameYear = Math.floor(newest / 12) === Math.floor(oldest / 12);
  return `${monthLabel(oldest, !sameYear)}–${monthLabel(newest, true)}`;
}
