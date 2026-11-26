'use client';

import { useCallback, useState } from 'react';
import { fetchCRMLeads, fetchFootfallNoCart, fetchFootfallNonConverted, type CRMLeadRow, type CRMLeadsQuery } from '@/lib/api';
import { importLeads } from '@/lib/bda-retail/api';
import { buildCohorts, type NoCartVisit } from '@/lib/bda-retail/cohorts';
import {
  CART_WINDOW_DAYS, COHORT_BY_KEY, EARLIER_PHASE_LOOKBACK_DAYS, EC_VISIT_LOOKBACK_DAYS, PENDING_LOOKBACK_DAYS, PHASE_CATEGORIES,
  UPSELL_LAG_DAYS, UPSELL_WINDOW_DAYS, VISIT_WINDOW_DAYS,
} from '@/lib/bda-retail/constants';
import type { ImportDiag, ImportRun } from '@/lib/bda-retail/types';
import { istToday, shiftDays } from '@/lib/bda-retail/utils';

const PAGE = 1000;
const MAX_PAGES = 40;
const RETRY_WAITS_MS = [1500, 4000];
const B2B_BRANCH = /^b2b$/i;
const FINAL = /Session expired|do not have access/;

class Capped extends Error {}

interface Page<T> {
  rows: T[];
  totalPages: number;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(get: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await get();
    } catch (err) {
      if (i >= RETRY_WAITS_MS.length || (err instanceof Error && FINAL.test(err.message))) throw err;
      await wait(RETRY_WAITS_MS[i]);
    }
  }
}

async function pageOf<T>(get: (page: number, size: number) => Promise<Page<T>>, page: number): Promise<Page<T>> {
  try {
    return await withRetry(() => get(page, PAGE));
  } catch (err) {
    if (err instanceof Error && FINAL.test(err.message)) throw err;
    const half = PAGE / 2;
    const a = await withRetry(() => get(page * 2 - 1, half));
    const b = a.totalPages >= page * 2 ? await withRetry(() => get(page * 2, half)) : { rows: [], totalPages: a.totalPages };
    return { rows: [...a.rows, ...b.rows], totalPages: Math.ceil(a.totalPages / 2) };
  }
}

async function paged<T>(label: string, get: (page: number, size: number) => Promise<Page<T>>, step: (s: string) => void): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; ; page++) {
    step(`${label}: page ${page}`);
    let res: Page<T>;
    try {
      res = await pageOf(get, page);
    } catch (err) {
      throw new Error(`${label}, page ${page}: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
    rows.push(...res.rows);
    if (page >= res.totalPages || res.rows.length === 0) break;
    if (page >= MAX_PAGES) throw new Capped(`${label} has more than ${MAX_PAGES * PAGE} rows. Nothing was saved.`);
  }
  return rows;
}

async function allLeads(label: string, query: CRMLeadsQuery, step: (s: string) => void): Promise<CRMLeadRow[]> {
  const rows = await paged(label, async (page, pageSize) => {
    const res = await fetchCRMLeads({ ...query, page, pageSize });
    return { rows: res.results, totalPages: res.totalPages };
  }, step);
  return rows.filter((r) => !B2B_BRANCH.test(r.branch ?? '') && !B2B_BRANCH.test(r.bookedBranch ?? ''));
}

type FootfallList = typeof fetchFootfallNoCart | typeof fetchFootfallNonConverted;

const allFootfall = (label: string, list: FootfallList, from: string, to: string, step: (s: string) => void): Promise<NoCartVisit[]> =>
  paged(label, async (page, pageSize) => {
    const res = await list({ dateFrom: from, dateTo: to, page, pageSize });
    return { rows: res.results as unknown as NoCartVisit[], totalPages: res.total_pages || 1 };
  }, step);

const tally = <T,>(rows: T[], f: (r: T) => string): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = f(r) || '(blank)';
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
};

function diagnose(carts: CRMLeadRow[], visits: NoCartVisit[]): ImportDiag {
  return {
    cartFields: Object.keys(carts[0] ?? {}),
    visitFields: Object.keys(visits[0] ?? {}),
    statuses: tally(carts, (r) => r.status),
    branches: tally(carts, (r) => r.branch),
  };
}

export function useBdaImport(onDone: () => Promise<void>) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [summary, setSummary] = useState('');

  const run = useCallback(async () => {
    setRunning(true);
    setError('');
    setSummary('');
    const today = istToday();
    const due = shiftDays(today, -UPSELL_LAG_DAYS);
    const orderFrom = shiftDays(due, -UPSELL_WINDOW_DAYS);
    let saving = false;
    try {
      const recent = await allLeads('Carts, last 30 days', { createdFrom: shiftDays(today, -CART_WINDOW_DAYS), createdTo: today }, setProgress);
      const olderFrom = shiftDays(today, -PENDING_LOOKBACK_DAYS);
      const olderTo = shiftDays(today, -CART_WINDOW_DAYS - 1);
      const inCart = await allLeads('Older carts', { status: 'In Cart', createdFrom: olderFrom, createdTo: olderTo }, setProgress);
      const quoted = await allLeads('Older quotes', { status: 'Quote Approval Pending', createdFrom: olderFrom, createdTo: olderTo }, setProgress);
      const civil = await allLeads('Civil orders', { orderFrom, orderTo: today, category: PHASE_CATEGORIES.civil.join(',') }, setProgress);
      const carpentry = await allLeads('Carpentry orders', { orderFrom, orderTo: today, category: PHASE_CATEGORIES.carpentry.join(',') }, setProgress);
      const decorative = await allLeads('Decorative orders', { orderFrom, orderTo: today, category: PHASE_CATEGORIES.decorative.join(',') }, setProgress);
      const earlier = await allLeads('Earlier civil and carpentry orders', {
        orderFrom: shiftDays(today, -EARLIER_PHASE_LOOKBACK_DAYS),
        orderTo: shiftDays(orderFrom, -1),
        category: [...PHASE_CATEGORIES.civil, ...PHASE_CATEGORIES.carpentry].join(','),
      }, setProgress);
      const visits = await allFootfall('EC visits with no cart', fetchFootfallNoCart, shiftDays(today, -VISIT_WINDOW_DAYS), today, setProgress);
      const yearFrom = shiftDays(today, -EC_VISIT_LOOKBACK_DAYS);
      const visitedNoCart = await allFootfall('EC visitors this year, no cart', fetchFootfallNoCart, yearFrom, today, setProgress);
      const visitedWithCart = await allFootfall('EC visitors this year, cart not converted', fetchFootfallNonConverted, yearFrom, today, setProgress);

      const carts = [...recent, ...inCart, ...quoted];
      const result = buildCohorts({ carts, orders: { civil, carpentry, decorative, earlier }, visits, ecVisitors: [...visitedNoCart, ...visitedWithCart], today });
      const byCohort: ImportRun['byCohort'] = {};
      for (const l of result.leads) byCohort[l.cohort] = (byCohort[l.cohort] ?? 0) + 1;
      saving = true;
      const saved = await importLeads(result.leads, { skippedActive: result.skippedActive, byCohort, read: result.read, diag: diagnose(carts, visits) }, setProgress);
      const parts = Object.entries(saved.byCohort).map(([k, n]) => `${COHORT_BY_KEY[k as keyof typeof COHORT_BY_KEY].label} ${n}`);
      setSummary(`${saved.added} new, ${saved.refreshed} already in the bank, ${saved.samePerson} skipped as already in the bank under another cohort. ${parts.join(' · ')}. Left out ${saved.skippedActive} a BM is working.`);
      await onDone();
    } catch (err) {
      const why = err instanceof Error ? err.message : 'unknown error';
      setError(err instanceof Capped ? err.message : saving
        ? `Saving stopped part way: ${why}. Leads saved so far stay in the bank; fetch again to finish.`
        : `Fetching stopped and nothing was saved: ${why}`);
      if (saving) await onDone();
    } finally {
      setRunning(false);
      setProgress('');
    }
  }, [onDone]);

  return { run, running, progress, error, summary };
}
