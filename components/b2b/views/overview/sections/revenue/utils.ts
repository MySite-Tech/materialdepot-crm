import { istToday } from '@/lib/b2b';
import { MONTHS_OFFERED } from './constants';

export interface MonthOption {
  key: string;
  label: string;
  from: string;
  to: string;
}

export function monthOptions(now: Date): MonthOption[] {
  const today = istToday(now);
  const [y, m] = today.split('-').map(Number);
  return Array.from({ length: MONTHS_OFFERED }, (_, i) => {
    const first = new Date(Date.UTC(y, m - 1 - i, 1));
    const key = first.toISOString().slice(0, 7);
    const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    return {
      key,
      label: first.toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      from: `${key}-01`,
      to: i === 0 ? today : `${key}-${String(lastDay).padStart(2, '0')}`,
    };
  });
}

export const share = (n: number, d: number): string => (d > 0 ? `${Math.round((n / d) * 100)}%` : '0%');
