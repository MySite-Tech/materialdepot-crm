'use client';

import { SOURCE_COLORS, UNATTRIBUTED_SOURCE } from './constants';
import { RangeKey } from './types';
import { VerticalStats, istToday } from '@/lib/b2b';

const UNATTRIBUTED_COLOR = '#9CA3AF';

export function revenueSources(
  verticals: VerticalStats[],
  branchTotal: number,
): { source: string; value: number; color: string }[] {
  const rows = verticals.map((v, i) => ({
    source: v.label,
    value: v.won.value,
    color: SOURCE_COLORS[i % SOURCE_COLORS.length],
  }));
  const unattributed = branchTotal - rows.reduce((s, r) => s + r.value, 0);
  if (unattributed <= 0) return rows;
  return [...rows, { source: UNATTRIBUTED_SOURCE, value: unattributed, color: UNATTRIBUTED_COLOR }];
}

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
