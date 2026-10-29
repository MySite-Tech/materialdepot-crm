import { Period, monthPeriod } from '../../models/outreach/kpis';
import { addDays } from '../../models/performance/utils';

const shiftMonth = (ym: string, n: number): string => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};

export function periodFor(key: string, today: string, custom: Period): Period {
  switch (key) {
    case 'today': return { from: today, to: today };
    case 'yesterday': return { from: addDays(today, -1), to: addDays(today, -1) };
    case 'week': return { from: addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7)), to: today };
    case 'last7': return { from: addDays(today, -6), to: today };
    case 'last30': return { from: addDays(today, -29), to: today };
    case 'last-month': return monthPeriod(shiftMonth(today.slice(0, 7), -1));
    case 'custom': return custom.from && custom.to && custom.from <= custom.to ? custom : { from: today, to: today };
    default: return monthPeriod(today.slice(0, 7));
  }
}

export const fmtDay = (d: string, weekday = false): string =>
  new Date(`${d}T00:00:00Z`).toLocaleString('en-IN', { ...(weekday ? { weekday: 'short' } : {}), day: 'numeric', month: 'short', timeZone: 'UTC' });

export const fmtPeriod = (p: Period): string => (p.from === p.to ? fmtDay(p.from) : `${fmtDay(p.from)} – ${fmtDay(p.to)}`);
