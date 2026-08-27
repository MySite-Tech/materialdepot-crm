/* Loader + types for the CATEGORY & COMMERCIAL analytics layer.
   ─────────────────────────────────────────────────────────────────────────────────────────
   public/md-cat-analytics.js is a VERBATIM copy of md-cat-analytics.js in the
   material-depot-site Admin console — the registry, the dummy data layer seeded from the
   Jun–Aug 2026 category workbook, the target model, and the string-returning renderers for the
   Category / Week-on-week / Penetration / Targets tabs. It is a self-contained IIFE that
   publishes everything on `window` and touches no DOM, no network and no framework, which is
   why it can be shared byte-for-byte between a static PWA and this Next app instead of being
   hand-rewritten into JSX (1,700 lines of dashboard that must not drift between the two).

   It is loaded on demand — only when someone actually opens a commercial analytics tab — so the
   127 KB never lands in the main bundle or on any other Site Audit screen.

   GOING LIVE ON REAL DATA: nothing in this file or in CatAnalyticsPanel.tsx changes. Implement
   MD_AN_SOURCE.metabase() inside public/md-cat-analytics.js to return the same shape
   MD_AN_SOURCE.dummy() returns (documented at MD_AN_ROW_CONTRACT in that file) and flip
   MD_AN_SOURCE.mode off 'dummy'. The filter row reads that flag and stops badging the numbers
   as dummy data by itself.
   ───────────────────────────────────────────────────────────────────────────────────────── */

export const CAT_ANALYTICS_SRC = '/md-cat-analytics.js';

export type CatFilter = { from: string; to: string; store: string; city: string };

/* The subset of the module's surface this app calls. Deliberately loose (`any` for the dataset
   and the render context): those objects are defined by md-cat-analytics.js and re-declaring
   their full shape here would be a second source of truth that silently rots. */
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
  /* Execution-tab primitives — the ops-DB half of the dashboard draws its bookings-vs-executions
     columns and its TAT distribution with these, so both halves look like one page. */
  mdAnBuckets: (from: string, to: string) => Array<{ key: string; label: string; short: string; from: string; to: string; days: number }>;
  mdAnGrouped: (buckets: any[], series: Array<{ label: string; color: string }>, h: number) => string;
  mdAnTatStats: (tats: Array<number | null>) => any;
  mdAnTatHtml: (st: any, label: string) => string;
  mdAnNum1: (n: number) => string;
};

/* One in-flight load shared by every mount — the Analytics tab can be rendered by four different
   hosts (the rail, the role viewer, an SM's own dashboard, the site-audit page), and a remount
   must reuse the already-executed script instead of appending a second <script> for it. */
let pending: Promise<CatAnalyticsApi> | null = null;

export function loadCatAnalytics(): Promise<CatAnalyticsApi> {
  if (typeof window === 'undefined') return Promise.reject(new Error('cat analytics is browser-only'));
  const w = window as any;
  if (w.mdAnDataset) return Promise.resolve(w as CatAnalyticsApi);
  if (pending) return pending;
  pending = new Promise<CatAnalyticsApi>((resolve, reject) => {
    const done = () => (w.mdAnDataset ? resolve(w as CatAnalyticsApi) : reject(new Error('md-cat-analytics.js loaded but published nothing')));
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
  /* A failed load must not be cached as the answer forever — the next mount should get a fresh
     attempt (a flaky network on first paint is the common case here, not a missing file). */
  pending.catch(() => {
    pending = null;
  });
  return pending;
}

/* Reads the module's globals without forcing a load — for the Execution tab, which shows its own
   ops metrics whether or not the commercial module is up yet. */
export function catAnalyticsIfLoaded(): CatAnalyticsApi | null {
  if (typeof window === 'undefined') return null;
  return (window as any).mdAnDataset ? ((window as any) as CatAnalyticsApi) : null;
}

/* ---- CSV download, shared by the tab exports and the drill-down modal ---- */
function csvEscape(v: any): string {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function downloadCsv(name: string, rows: any[][]) {
  const lines = rows.map((r) => (r || []).map(csvEscape).join(','));
  // Leading BOM so Excel opens the ₹ figures and store names as UTF-8 rather than mojibake.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---- the commercial tabs' shared date range, clamped to what the source actually holds ----
   The dummy source only covers 1 Jun – 17 Aug 2026. Without this clamp a default "this month"
   (today is well past the data cut) renders an empty dashboard, which reads as broken rather
   than as out-of-range. A live Metabase source has no such window, so the clamp lifts itself. */
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
