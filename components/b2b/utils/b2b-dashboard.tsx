'use client';

import { RangeKey } from '../types/b2b-dashboard';
import { istToday } from '@/lib/b2bLeads';

export function rangeFor(key: RangeKey, now: Date): { from?: string; to?: string } {
  if (key === 'all') return {};
  const today = istToday(now);
  const [y, m] = today.split('-').map(Number);
  if (key === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const mm = String(pm).padStart(2, '0');
  const lastDay = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  return { from: `${py}-${mm}-01`, to: `${py}-${mm}-${lastDay}` };
}
