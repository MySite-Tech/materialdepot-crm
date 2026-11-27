'use client';

import { MonthWindow, fetchRevenueReport } from '@/lib/b2b/revenue';
import { useEffect, useRef, useState } from 'react';
import { LOAD_PARALLEL } from '../constants';
import type { MonthState } from '../types';

export function useMonthReports(months: MonthWindow[], refreshKey: number) {
  const [state, setState] = useState<Record<string, MonthState>>({});
  const askedAt = useRef(new Map<string, number>());
  const wanted = months.map((m) => m.key).join(',');

  useEffect(() => {
    const todo = months.filter((m) => askedAt.current.get(m.key) !== refreshKey);
    if (!todo.length) return;
    const freshFor = new Set(todo.filter((m) => askedAt.current.has(m.key)).map((m) => m.key));
    for (const m of todo) askedAt.current.set(m.key, refreshKey);
    setState((s) => ({ ...s, ...Object.fromEntries(todo.map((m) => [m.key, { report: s[m.key]?.report ?? null, error: null, loading: true }])) }));

    const settle = (key: string, next: MonthState) => {
      if (askedAt.current.get(key) === refreshKey) setState((s) => ({ ...s, [key]: next }));
    };
    (async () => {
      for (let i = 0; i < todo.length; i += LOAD_PARALLEL) {
        await Promise.all(todo.slice(i, i + LOAD_PARALLEL).map(async (m) => {
          try {
            settle(m.key, { report: await fetchRevenueReport(m.from, m.to, freshFor.has(m.key)), error: null, loading: false });
          } catch (e) {
            settle(m.key, { report: null, error: e instanceof Error ? e.message : 'Revenue could not be read', loading: false });
          }
        }));
      }
    })();
  }, [wanted, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}
