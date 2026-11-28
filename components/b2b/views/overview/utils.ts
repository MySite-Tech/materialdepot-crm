'use client';

import { MonthPace } from './types';

export function monthPace(revenue: number, target: number, now: Date): MonthPace {
  const day = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - day;
  const pct = (n: number) => (target > 0 ? Math.round((n / target) * 100) : 0);
  return {
    target,
    revenue,
    achievedPct: pct(revenue),
    expectedPct: Math.round((day / daysInMonth) * 100),
    projection: Math.round((revenue / day) * daysInMonth),
    perDayNeeded: daysLeft > 0 ? Math.max(0, (target - revenue) / daysLeft) : 0,
    daysLeft,
    monthLabel: now.toLocaleString('en-IN', { month: 'long' }),
  };
}

export const pctOf = (n: number, d: number): number => (d > 0 ? Math.round((n / d) * 100) : 0);
