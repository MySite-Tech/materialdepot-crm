import { DashboardBranchStatus } from '@/lib/api';

import { CORE_CATEGORIES, NON_CORE_CATEGORIES, ORDER_STATUSES, SPECIAL_CATEGORIES } from './constants';
import { BucketResult, CategoryRow, CategoryTargets, Metrics, Segregation, SegregationTable, StoreTarget } from './types';

const SHEETS: { segregation: Exclude<Segregation, 'Unclassified'>; names: string[] }[] = [
  { segregation: 'Core', names: CORE_CATEGORIES },
  { segregation: 'Non-Core', names: NON_CORE_CATEGORIES },
  { segregation: 'Special', names: SPECIAL_CATEGORIES },
];

const SHEET_CATEGORIES = SHEETS.flatMap(s => s.names);
const SHEET_SET = new Set(SHEET_CATEGORIES);

export function buildSegregationTables(liveCategories: string[]): SegregationTable[] {
  const live = new Set(liveCategories);
  const sheetTables = SHEETS.map<SegregationTable>(({ segregation, names }) => {
    const rows = names.map<CategoryRow>(name => ({ name, segregation, unmatched: !live.has(name) }));
    return { segregation, rows, queryNames: rows.filter(r => !r.unmatched).map(r => r.name) };
  });
  const unclassified = liveCategories
    .filter(name => !SHEET_SET.has(name))
    .sort((a, b) => a.localeCompare(b))
    .map<CategoryRow>(name => ({ name, segregation: 'Unclassified', unmatched: false }));
  return [
    ...sheetTables,
    { segregation: 'Unclassified', rows: unclassified, queryNames: unclassified.map(r => r.name) },
  ];
}

export function unmatchedSheetCategories(liveCategories: string[]): string[] {
  const live = new Set(liveCategories);
  return SHEET_CATEGORIES.filter(n => !live.has(n));
}

export const ZERO_METRICS: Metrics = { carts: 0, orders: 0, revenue: 0 };

export function bucketResultFromBranchStatus(branchStatus: DashboardBranchStatus[]): BucketResult {
  const byStore: Record<string, Metrics> = {};
  const overall: Metrics = { carts: 0, orders: 0, revenue: 0 };
  for (const b of branchStatus || []) {
    const m: Metrics = { carts: 0, orders: 0, revenue: 0 };
    for (const s of b.statuses || []) {
      const count = s.count || 0;
      m.carts += count;
      if (!ORDER_STATUSES.has(s.status)) continue;
      m.orders += count;
      m.revenue += s.value || 0;
    }
    byStore[b.branch] = m;
    overall.carts += m.carts;
    overall.orders += m.orders;
    overall.revenue += m.revenue;
  }
  return { byStore, overall };
}

export const fmtFull = (n: number): string => '₹' + Math.round(n || 0).toLocaleString('en-IN');

export const fmtShort = (n: number): string => {
  const v = n || 0;
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(0)}k`;
  return `₹${Math.round(v)}`;
};

export const pctStr = (part: number, whole: number): string =>
  whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '—';

export const fmtChipDate = (d: string): string => {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

const isoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const monthKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export const monthLabel = (key: string): string => {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

export function monthToDateRange(now = new Date()): { from: string; to: string } {
  return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDate(now) };
}

export function previousMonthRange(now = new Date()): { from: string; to: string } {
  return {
    from: isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
    to: isoDate(new Date(now.getFullYear(), now.getMonth(), 0)),
  };
}

export function monthElapsedFraction(now = new Date()): number {
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.min(1, now.getDate() / days);
}

export const EMPTY_TARGET: StoreTarget = { total: 0, core: 0, nonCore: 0, special: 0 };

export const targetFor = (targets: CategoryTargets, month: string, store: string): StoreTarget =>
  targets[month]?.[store] ?? EMPTY_TARGET;

export const hasAnyTarget = (t: StoreTarget): boolean =>
  t.total > 0 || t.core > 0 || t.nonCore > 0 || t.special > 0;

const positiveNumber = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function coerceTargets(raw: unknown): CategoryTargets {
  const out: CategoryTargets = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [month, stores] of Object.entries(raw as Record<string, unknown>)) {
    if (!stores || typeof stores !== 'object') continue;
    const byStore: Record<string, StoreTarget> = {};
    for (const [store, t] of Object.entries(stores as Record<string, unknown>)) {
      const o = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
      byStore[store] = {
        total: positiveNumber(o.total),
        core: positiveNumber(o.core),
        nonCore: positiveNumber(o.nonCore),
        special: positiveNumber(o.special),
      };
    }
    out[month] = byStore;
  }
  return out;
}
