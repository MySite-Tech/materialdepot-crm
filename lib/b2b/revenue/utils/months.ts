import { istToday } from '../../stats/pipeline';
import type { MonthWindow } from '../types';

export function monthWindows(now: Date, count: number): MonthWindow[] {
  const today = istToday(now);
  const [y, m] = today.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
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
