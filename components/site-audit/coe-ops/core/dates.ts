import { DatePresetKey, DateRange } from '../types';
import { addDays, daysBetween, todayStr } from '../utils';

export function presetRange(k: DatePresetKey): DateRange {
  const today = todayStr();
  const monthStart = (y: number, m: number) => y + '-' + String(m + 1).padStart(2, '0') + '-01';
  const d = new Date(today + 'T00:00');
  switch (k) {
    case 'today': return { from: today, to: today };
    case 'last7': return { from: addDays(today, -6), to: today };
    case 'last30': return { from: addDays(today, -29), to: today };
    case 'last90': return { from: addDays(today, -89), to: today };
    case 'thismonth': return { from: monthStart(d.getFullYear(), d.getMonth()), to: today };
    case 'lastmonth': {
      const first = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const last = new Date(d.getFullYear(), d.getMonth(), 0);
      return { from: monthStart(first.getFullYear(), first.getMonth()), to: last.getFullYear() + '-' + String(last.getMonth() + 1).padStart(2, '0') + '-' + String(last.getDate()).padStart(2, '0') };
    }
    default: return { from: '', to: '' };
  }
}

export function previousRange(r: DateRange): DateRange | null {
  if (!r.from || !r.to) return null;
  const span = daysBetween(r.from, r.to) + 1;
  return { from: addDays(r.from, -span), to: addDays(r.from, -1) };
}

export function inDateRange(d: string | null | undefined, r: DateRange): boolean {
  if (!r.from && !r.to) return true;
  if (!d) return false;
  const day = String(d).slice(0, 10);
  if (r.from && day < r.from) return false;
  if (r.to && day > r.to) return false;
  return true;
}
