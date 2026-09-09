import { mdFetch } from '@/lib/mockApi';

export const CAT_ANALYTICS_SRC = '/md-cat-analytics.js';

export const INITIAL_RANGE_DAYS = 30;

export const MAX_RANGE_DAYS = 1200;

export const ALL_DATA_DAYS = 730;

export function daysAgo(n: number): string {
  return dstr(new Date(Date.now() - n * 86400000));
}

export async function fetchCatDataset(api: CatAnalyticsApi, from: string, to: string) {
  const floor = daysAgo(MAX_RANGE_DAYS - 1);
  const start = from < floor ? floor : from;
  const ds = await mdFetch(`/crm/cat-analytics/?from=${start}&to=${to}`);
  if (!ds || !Array.isArray(ds.orders) || !Array.isArray(ds.carts)) {
    throw new Error('the order-book API returned an unexpected shape');
  }
  if (ds.meta?.from) api.MD_AN_DATA_FROM = ds.meta.from;
  if (ds.meta?.to) api.MD_AN_DATA_TO = ds.meta.to;
  return ds;
}

function installLiveSource(api: CatAnalyticsApi) {
  const w = window as any;
  if (w.MD_AN_FETCH) return;
  w.MD_AN_FETCH = () =>
    fetchCatDataset(api, daysAgo(INITIAL_RANGE_DAYS - 1), dstr(new Date()));
  api.MD_AN_SOURCE.mode = 'metabase';
}

export type CatFilter = { from: string; to: string; store: string; city: string };

export type CatAnalyticsApi = {
  MD_AN_DATA_FROM: string;
  MD_AN_DATA_TO: string;
  MD_AN_STORE_IDS: string[];
  MD_AN_STORES: Record<string, { label: string; city: string; kind: string; status: string; opened: string; ord: number }>;
  MD_AN_CAT_IDS: string[];
  MD_AN_CATEGORIES: Record<string, any>;
  MD_AN_SOURCE: { mode: string; fetch: () => Promise<any> };
  MD_AN_TABS: Array<{ k: string; ico: string; label: string; sub: string }>;
  MD_AN_DRILL: Record<string, { title: string; note: string; cols: string[]; rows: any[][] }>;
  mdAnStoreLabel: (s: string) => string;
  mdAnDataset: () => Promise<any>;
  mdAnTargetsMerge: (saved: any) => any;
  mdAnBuildCtx: (ds: any, f: CatFilter, t: any) => any;
  mdAnWarnBanner: (ctx: any) => string;
  mdAnRenderCategory: (ctx: any) => string;
  mdAnRenderWeekly: (ctx: any) => string;
  mdAnRenderPenetration: (ctx: any) => string;
  mdAnRenderTargets: (ctx: any, editMonth: string) => string;
  mdAnCsvData: (key: string, ctx: any, editMonth: string) => { name: string; rows: any[][] } | null;
  MD_AN_LIMITS: Record<string, string>;
  MD_AN_ASSUMPTIONS: Record<string, string>;

  mdAnBuckets: (from: string, to: string) => Array<{ key: string; label: string; short: string; from: string; to: string; days: number }>;
  mdAnGrouped: (buckets: any[], series: Array<{ label: string; color: string }>, h: number) => string;
  mdAnTatStats: (tats: Array<number | null>) => any;
  mdAnTatHtml: (st: any, label: string) => string;
  mdAnNum1: (n: number) => string;
};

let pending: Promise<CatAnalyticsApi> | null = null;

export function loadCatAnalytics(): Promise<CatAnalyticsApi> {
  if (typeof window === 'undefined') return Promise.reject(new Error('cat analytics is browser-only'));
  const w = window as any;
  if (w.mdAnDataset) {
    installLiveSource(w as CatAnalyticsApi);
    return Promise.resolve(w as CatAnalyticsApi);
  }
  if (pending) return pending;
  pending = new Promise<CatAnalyticsApi>((resolve, reject) => {
    const done = () => {
      if (!w.mdAnDataset) return reject(new Error('md-cat-analytics.js loaded but published nothing'));
      installLiveSource(w as CatAnalyticsApi);
      resolve(w as CatAnalyticsApi);
    };
    const existing = document.querySelector<HTMLScriptElement>('script[data-md-cat-analytics]');
    if (existing) {
      existing.addEventListener('load', done);
      existing.addEventListener('error', () => reject(new Error('could not load the analytics module')));
      return;
    }
    const s = document.createElement('script');
    s.src = CAT_ANALYTICS_SRC;
    s.async = true;
    s.dataset.mdCatAnalytics = '1';
    s.onload = done;
    s.onerror = () => reject(new Error('could not load the analytics module'));
    document.head.appendChild(s);
  });

  pending.catch(() => {
    pending = null;
  });
  return pending;
}

export function catAnalyticsIfLoaded(): CatAnalyticsApi | null {
  if (typeof window === 'undefined') return null;
  return (window as any).mdAnDataset ? ((window as any) as CatAnalyticsApi) : null;
}

function csvEscape(v: any): string {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function downloadCsv(name: string, rows: any[][]) {
  const lines = rows.map((r) => (r || []).map(csvEscape).join(','));

  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function clampToData(api: CatAnalyticsApi, d: string): string {
  if (api.MD_AN_SOURCE.mode !== 'dummy') return d;
  if (d < api.MD_AN_DATA_FROM) return api.MD_AN_DATA_FROM;
  if (d > api.MD_AN_DATA_TO) return api.MD_AN_DATA_TO;
  return d;
}

export function dstr(d: Date): string {
  const z = (n: number) => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
}
