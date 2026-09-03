'use client';

/* Site Audit → Analytics: the COMMERCIAL tabs (Category · Week on week · Penetration · Targets).
   ─────────────────────────────────────────────────────────────────────────────────────────
   The Analytics tab has two halves with two different sources, and they are deliberately kept
   apart — an order lives in the order book (Metabase / materialdepot_azure), a site visit lives
   in the ops DB (Supabase), and the only bridge between them is the customer phone number:

     • EXECUTION  (bookings, executions, TAT, arrival on time, NPS)  → SiteAuditAnalyticsView
     • COMMERCIAL (carts, cart conversion, orders, order value, attach rate, audit → order
                   conversion, store penetration, targets)          → THIS component

   The commercial half is drawn by public/md-cat-analytics.js, carried over byte-for-byte from
   the material-depot-site Admin console (see catAnalytics.ts). That module returns HTML strings,
   so this component is a host, not a rewrite: it owns the filter state, the target buffer, the
   drill-down modal and the CSV downloads, hands the module a filter, and injects what comes back.
   Rewriting those renderers in JSX would fork a dashboard that is supposed to stay identical in
   both apps.

   Two deliberate differences from the Admin console version:
     • City comes from the CRM's own header selector (the `city` prop), so the filter row does not
       render its own city buttons — one city control per page, not two that can disagree.
     • The filter row is real React (controlled inputs) instead of an HTML string with inline
       onclick handlers, because it is this app's chrome rather than part of the shared dashboard.
   The tab bodies still carry the module's own inline handlers, so those few names are published on
   `window` for as long as this component is mounted.
   ───────────────────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CityFilter } from './siteAuditShared';
import { loadSetting, saveSetting } from './siteAuditShared';
import {
  ALL_DATA_DAYS,
  clampToData,
  daysAgo,
  downloadCsv,
  dstr,
  fetchCatDataset,
  INITIAL_RANGE_DAYS,
  loadCatAnalytics,
  type CatAnalyticsApi,
} from './catAnalytics';

export type CommercialTab = 'category' | 'weekly' | 'penetration' | 'targets';

const TARGETS_KEY = 'cat_analytics_targets';

export default function CatAnalyticsPanel({
  tab,
  city = 'all',
  onTabChange,
}: {
  tab: CommercialTab;
  city?: CityFilter;
  onTabChange?: (tab: string) => void;
}) {
  const [api, setApi] = useState<CatAnalyticsApi | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [store, setStore] = useState('all');
  const [targetMonth, setTargetMonth] = useState('');
  const [drillKey, setDrillKey] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  /* The panel mounts with INITIAL_RANGE_DAYS of order book and re-filters that client-side. Picking
     a range that reaches outside it triggers one on-demand fetch of the wider window — the loaded
     window is tracked here so we can tell "re-filter what we have" from "go and get more". */
  const [loadedFrom, setLoadedFrom] = useState('');
  const [rangeErr, setRangeErr] = useState('');
  const [fetching, setFetching] = useState(false);

  const dsRef = useRef<any>(null);
  /* Targets are held in a MUTABLE ref, not in state, and edits bump `nonce` to force the redraw.
     That is the Admin console's design and it is the right one here too: an edit touches one cell
     of a seven-month × thirteen-store × six-category object, so a mis-typed cell can be abandoned
     by leaving the tab, and nothing is written to app_settings until Save. Cloning the whole
     object per keystroke to satisfy immutability would buy nothing and cost every keystroke. */
  const targetsRef = useRef<any>(null);
  const targetsIdRef = useRef<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const redraw = useCallback(() => setNonce((n) => n + 1), []);

  /* The module's inline handlers are installed once per mount, so anything they read has to come
     from a ref — closing over a render's values would freeze them at whatever the first render
     saw (a CSV export would keep exporting the range the tab opened on). */
  const ctxRef = useRef<any>(null);
  const targetMonthRef = useRef('');
  targetMonthRef.current = targetMonth;
  const onTabChangeRef = useRef(onTabChange);
  onTabChangeRef.current = onTabChange;

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((cur) => (cur === msg ? '' : cur)), 3200);
  }, []);

  /* ---- load the module, the dataset and the saved targets (once per mount) ---- */
  useEffect(() => {
    let alive = true;
    (async () => {
      let mod: CatAnalyticsApi;
      try {
        mod = await loadCatAnalytics();
      } catch (e: any) {
        if (alive) setLoadErr(e?.message || 'could not load the analytics module');
        return;
      }
      try {
        if (!dsRef.current) dsRef.current = await mod.mdAnDataset();
        if (!targetsRef.current) {
          /* A missing app_settings row (or a missing table) is not an error here — mdAnTargetsMerge
             seeds the workbook plan, which is exactly what an office that has never opened the
             Targets tab should see. */
          const st = await loadSetting(TARGETS_KEY).catch(() => ({ id: null, value: null }));
          targetsIdRef.current = st.id;
          targetsRef.current = mod.mdAnTargetsMerge(st.value);
        }
      } catch (e: any) {
        if (alive) setLoadErr(e?.message || 'could not load the category dataset');
        return;
      }
      if (!alive) return;
      /* Default range: the last 30 days — the same window the mount fetch pulled, so the first
         paint never asks for data that is not loaded. Clamped for the dummy source, which holds a
         fixed 2026 window and would otherwise open on an empty range. */
      setFrom((cur) => cur || defaultFrom(mod));
      setTo((cur) => cur || clampToData(mod, dstr(new Date())));
      setLoadedFrom(mod.MD_AN_DATA_FROM);
      setApi(mod);
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* ---- the module's inline handlers, published only while this panel is mounted ---- */
  useEffect(() => {
    if (!api) return;
    const w = window as any;
    const saved: Record<string, any> = {};
    const install = (name: string, fn: any) => {
      saved[name] = w[name];
      w[name] = fn;
    };

    // Clamp a typed target cell the way the Admin console does: no negatives, and rates cap at 100.
    const num = (el: HTMLInputElement, max?: number) => {
      let v = parseFloat(el.value);
      if (isNaN(v) || v < 0) v = 0;
      if (max != null && v > max) v = max;
      el.value = String(v);
      return v;
    };
    /* Installation targets are DERIVED (attach % of the product categories, plus the flooring and
       wallpaper site-audit pull-through), never typed — so any edit that feeds them recomputes the
       affected store rows, or the grid would show a plan whose own rows disagree. */
    const deriveInstall = (month: string, storeId: string) => {
      const t = targetsRef.current;
      const row = ((t.orders[month] || {})[storeId] || {}) as Record<string, number>;
      let d = 0;
      ['wallpaper', 'flooring', 'wallpanel', 'cnc'].forEach((c) => {
        d += (row[c] || 0) * (((t.attach[month] || {})[c] || 0) / 100);
      });
      d += ((row.wallpaper || 0) + (row.flooring || 0)) * 0.04575;
      row.installation = Math.round(d);
    };

    install('anSetTab', (t: string) => onTabChangeRef.current && onTabChangeRef.current(t));
    install('anDrill', (key: string) => {
      if (!api.MD_AN_DRILL || !api.MD_AN_DRILL[key]) return flash('No detail available for this metric');
      setDrillKey(key);
    });
    install('anCsv', (key: string) => {
      const c = ctxRef.current ? api.mdAnCsvData(key, ctxRef.current, targetMonthRef.current) : null;
      if (!c || !c.rows.length) return flash('Nothing to export');
      downloadCsv(c.name, c.rows);
    });
    install('anTargetMonth', (m: string) => setTargetMonth(m));
    install('anTargetWarnAt', (el: HTMLInputElement) => {
      targetsRef.current.warnAtPct = num(el, 100) || 80;
      redraw();
    });
    install('anTargetInput', (month: string, storeId: string, cat: string, el: HTMLInputElement) => {
      const t = targetsRef.current;
      t.orders[month] = t.orders[month] || {};
      t.orders[month][storeId] = t.orders[month][storeId] || {};
      t.orders[month][storeId][cat] = num(el);
      deriveInstall(month, storeId);
      redraw();
    });
    install('anTargetRate', (kind: string, month: string, cat: string, el: HTMLInputElement) => {
      const t = targetsRef.current;
      const v = num(el, 100);
      if (kind === 'auditConv') t.auditConv[month] = v;
      else {
        t[kind][month] = t[kind][month] || {};
        t[kind][month][cat] = v;
      }
      // Attach % feeds every store's derived installation target for that month.
      if (kind === 'attach') Object.keys(t.orders[month] || {}).forEach((s) => deriveInstall(month, s));
      redraw();
    });
    install('anTargetAov', (cat: string, el: HTMLInputElement) => {
      targetsRef.current.aov[cat] = num(el);
      redraw();
    });
    install('anSaveTargets', async () => {
      try {
        targetsRef.current.savedAt = new Date().toISOString();
        targetsIdRef.current = await saveSetting(TARGETS_KEY, targetsRef.current, targetsIdRef.current);
        flash('✓ Targets saved for everyone');
      } catch (e: any) {
        flash('⚠ Could not save targets — ' + (e?.message || 'the app_settings table may be missing'));
      }
      redraw();
    });
    install('anResetTargets', () => {
      if (!window.confirm('Reset every target back to the plan seeded from the workbook? Unsaved edits are lost, and the saved copy is only replaced when you press Save afterwards.')) return;
      targetsRef.current = api.mdAnTargetsMerge(null);
      flash('Targets reset to the seeded plan — press Save to make it stick');
      redraw();
    });

    return () => {
      // Hand the globals back exactly as they were, so two mounts (rail + role viewer preview)
      // can never leave a dead handler pointing at an unmounted panel.
      Object.keys(saved).forEach((k) => {
        if (saved[k] === undefined) delete w[k];
        else w[k] = saved[k];
      });
    };
  }, [api, flash, redraw]);

  /* ---- widen the loaded window on demand ----
     Only ever reaches BACKWARDS: `to` is capped at today by the inputs, and the mount fetch already
     ends there. Refetching the union (not just the missing slice) keeps one dataset in `dsRef`
     rather than making the render layer stitch two, and the backend's 60s cache makes a repeated
     window nearly free. Live source only — the dummy generator holds a fixed window with nothing
     behind it to fetch. */
  useEffect(() => {
    if (!api || !from || !loadedFrom) return;
    if (api.MD_AN_SOURCE.mode === 'dummy') return;
    if (from >= loadedFrom) return;

    let alive = true;
    setFetching(true);
    setRangeErr('');
    fetchCatDataset(api, from, dstr(new Date()))
      .then((ds) => {
        if (!alive) return;
        dsRef.current = ds;
        setLoadedFrom(ds.meta?.from || from);
        redraw();
      })
      .catch((e: any) => {
        if (!alive) return;
        /* Keep the narrower dataset and say so, rather than blanking a working panel: the range on
           screen is now wider than the data behind it, which is exactly what has to be visible. */
        setRangeErr(e?.message || 'could not load that range');
      })
      .finally(() => {
        if (alive) setFetching(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, from, loadedFrom]);

  /* ---- build the slice, then render the tab ---- */
  const html = useMemo(() => {
    if (!api || !from || !to) return '';
    try {
      const ctx = api.mdAnBuildCtx(dsRef.current, { from, to, store, city: city || 'all' }, targetsRef.current);
      ctxRef.current = ctx;
      const banner = tab === 'targets' ? '' : api.mdAnWarnBanner(ctx);
      const body =
        tab === 'category'
          ? api.mdAnRenderCategory(ctx)
          : tab === 'weekly'
            ? api.mdAnRenderWeekly(ctx)
            : tab === 'penetration'
              ? api.mdAnRenderPenetration(ctx)
              : api.mdAnRenderTargets(ctx, targetMonth);
      return banner + body + footerHtml(api);
    } catch (e: any) {
      return '<div style="padding:24px;color:var(--red);font-weight:600">⚠ Could not render this tab — ' + (e?.message || 'unknown error') + '</div>';
    }
    // `nonce` is the redraw trigger for in-place target edits — see targetsRef above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, from, to, store, city, tab, targetMonth, nonce]);

  if (loadErr)
    return (
      <div className="md-an">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-[13px] font-semibold text-red-700">⚠ Could not load the category analytics — {loadErr}</div>
      </div>
    );
  if (!api)
    return (
      <div className="md-an">
        <div className="loading-row">
          <span className="spinner" />
        </div>
      </div>
    );

  const drill = drillKey ? api.MD_AN_DRILL[drillKey] : null;
  const dummy = api.MD_AN_SOURCE.mode === 'dummy';
  const quick = (kind: 'month' | 'lastmonth' | '30' | 'all') => {
    const t = new Date();
    let f: string, u: string;
    if (kind === 'month') {
      f = dstr(new Date(t.getFullYear(), t.getMonth(), 1));
      u = dstr(t);
    } else if (kind === 'lastmonth') {
      f = dstr(new Date(t.getFullYear(), t.getMonth() - 1, 1));
      u = dstr(new Date(t.getFullYear(), t.getMonth(), 0));
    } else if (kind === '30') {
      const x = new Date(t);
      x.setDate(x.getDate() - 29);
      f = dstr(x);
      u = dstr(t);
    } else {
      /* Live: reach past the loaded window and let the widening effect fetch it. Dummy: its own
         window IS all the data there is. */
      f = api.MD_AN_SOURCE.mode === 'dummy' ? api.MD_AN_DATA_FROM : daysAgo(ALL_DATA_DAYS - 1);
      u = api.MD_AN_SOURCE.mode === 'dummy' ? api.MD_AN_DATA_TO : dstr(t);
    }
    f = clampToData(api, f);
    u = clampToData(api, u);
    setFrom(f > u ? u : f);
    setTo(u);
  };

  return (
    <div className="md-an">
      {/* One filter row for every commercial tab, not one per chart. */}
      <div className="an-filter">
        <div>
          <label>From</label>
          <input
            type="date"
            className="an-date-inp"
            value={from}
            min={dummy ? api.MD_AN_DATA_FROM : undefined}
            max={dummy ? api.MD_AN_DATA_TO : undefined}
            onChange={(e) => e.target.value && setFrom(clampToData(api, e.target.value))}
          />
        </div>
        <div>
          <label>To</label>
          <input
            type="date"
            className="an-date-inp"
            value={to}
            min={dummy ? api.MD_AN_DATA_FROM : undefined}
            max={dummy ? api.MD_AN_DATA_TO : undefined}
            onChange={(e) => e.target.value && setTo(clampToData(api, e.target.value))}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="filt-btn" onClick={() => quick('month')}>
            This month
          </button>
          <button className="filt-btn" onClick={() => quick('lastmonth')}>
            Last month
          </button>
          <button className="filt-btn" onClick={() => quick('30')}>
            Last 30 days
          </button>
          <button className="filt-btn" onClick={() => quick('all')}>
            All data
          </button>
        </div>
        <div>
          <label>Store</label>
          <select className="an-date-inp" value={store} onChange={(e) => setStore(e.target.value)}>
            <option value="all">All stores &amp; channels</option>
            {api.MD_AN_STORE_IDS.map((s) => (
              <option key={s} value={s}>
                {api.mdAnStoreLabel(s)}
                {api.MD_AN_STORES[s].kind === 'channel' ? ' (channel)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
          <b style={{ color: dummy ? 'var(--amber)' : 'var(--green)' }}>{dummy ? '◆ Dummy data' : '● Live (order book)'}</b>
          <br />
          {dummy ? `Seeded from the Jun–Aug 2026 category workbook · data window ${api.MD_AN_DATA_FROM} → ${api.MD_AN_DATA_TO}` : `Order book, live · data window ${api.MD_AN_DATA_FROM} → ${api.MD_AN_DATA_TO}`}
          {/* A wider range is one request, and it can take a while on a cold cache — say so rather
              than leaving the old numbers on screen looking like the answer. */}
          {fetching ? (
            <>
              <br />
              <span style={{ color: 'var(--amber)' }}>loading a wider range…</span>
            </>
          ) : null}
          {rangeErr ? (
            <>
              <br />
              <span style={{ color: 'var(--red)' }}>
                showing {api.MD_AN_DATA_FROM} onwards — {rangeErr}
              </span>
            </>
          ) : null}
        </div>
      </div>

      <div dangerouslySetInnerHTML={{ __html: html }} />

      {/* ---- drill-down: which rows make up a metric, with the same CSV the tables offer ---- */}
      {drill ? (
        <div
          onClick={() => setDrillKey(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,15,25,.45)', zIndex: 200, display: 'grid', placeItems: 'center', padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 14, width: 'min(980px,100%)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: '1px solid var(--line)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)' }}>{drill.title}</h3>
              <button
                onClick={() => setDrillKey(null)}
                style={{ marginLeft: 'auto', border: 0, background: 'none', fontSize: 22, lineHeight: 1, cursor: 'pointer', color: 'var(--muted)' }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div style={{ padding: '16px 20px', overflow: 'auto' }}>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: drill.note + '<br><b>' + drill.rows.length + '</b> row(s).' }} />
              <table className="an-inst-table">
                <thead>
                  <tr>
                    {drill.cols.map((c, i) => (
                      <th key={i}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {drill.rows.length ? (
                    drill.rows.map((r, ri) => (
                      <tr key={ri}>
                        {r.map((v, ci) => (
                          <td
                            key={ci}
                            style={{
                              fontFamily: ci === 0 ? 'var(--font-mono, monospace)' : undefined,
                              color: /^✓/.test(String(v)) ? 'var(--green)' : /^✗/.test(String(v)) ? 'var(--red)' : undefined,
                              fontWeight: /^✓/.test(String(v)) ? 700 : undefined,
                            }}
                          >
                            {v == null ? '—' : String(v)}
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={drill.cols.length} style={{ color: 'var(--muted)' }}>
                        No rows
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="btn-primary"
                onClick={() => {
                  if (!drill.rows.length) return flash('Nothing to export');
                  downloadCsv(drill.title.replace(/[^a-z0-9]+/gi, '_').toLowerCase(), [drill.cols as any[]].concat(drill.rows));
                }}
              >
                ⬇ Download CSV
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--ink)',
            color: '#fff',
            borderRadius: 10,
            padding: '10px 18px',
            fontSize: 13.5,
            fontWeight: 600,
            zIndex: 300,
          }}
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function defaultFrom(api: CatAnalyticsApi): string {
  const start = clampToData(api, daysAgo(INITIAL_RANGE_DAYS - 1));
  const today = clampToData(api, dstr(new Date()));
  // Today is past the dummy window's end, so a raw "30 days ago" clamps ABOVE the clamped "today"
  // and would invert the range — fall back to the window's own start in that case.
  return start > today ? clampToData(api, api.MD_AN_DATA_FROM) : start;
}

/* Where every number on these tabs comes from, and what it does not cover. Kept visible on the
   page rather than in a doc: the whole point of this dashboard is that no figure on it is
   unexplained. Text follows md-cat-analytics.js's own MD_AN_LIMITS / MD_AN_ASSUMPTIONS, so
   editing a limit there updates it here. */
function footerHtml(api: CatAnalyticsApi): string {
  const L = api.MD_AN_LIMITS;
  const A = api.MD_AN_ASSUMPTIONS;
  const modelled = api.MD_AN_CAT_IDS.filter((c) => api.MD_AN_CATEGORIES[c].modelled).map((c) => api.MD_AN_CATEGORIES[c].label);
  return `<div class="an-footer">
    <b>Where these numbers come from:</b> the order book, live, via <code>GET /crm/cat-analytics/</code>, using the same order definition as the Sales Rep Analytics dashboard — confirmed/placed/shipped/delivered estimates only, quotes and cancellations excluded, order date = <code>COALESCE(order_placed_time, created_at)</code> in IST.${api.MD_AN_SOURCE.mode === 'dummy' ? ' Right now that source is a <b>dummy generator seeded from the Jun–Aug 2026 category workbook</b>: every store-month total, order value, quantity, customer count, attach count and cart figure adds back up to the workbook exactly.' : ' Cross-checked against the Jun–Aug 2026 category workbook: site-audit AOV, wallpaper, flooring and installation all reconcile to within a few percent.'}<br>
    <b>Order count</b> is distinct orders CONTAINING the category — an order with wallpaper and flooring counts in both. <b>Order value</b> is only that category's line value (net of discount, incl. tax), never the whole order.<br>
    <b>Not comparable with the Execution tab:</b> these figures count order lines in the order book; Execution counts site visits in the ops DB. The only bridge between the two is the customer phone number.<br>
    <b>Attach rate:</b> ${L.attachIdentical}<br>
    <b>Site audit:</b> ${L.auditCategory}<br>
    <b>Site audit → order conversion</b> is judged per audit, never "has this phone ever ordered", and splits material-only from material + installation so the customers who did NOT take installation from us stay visible. ${A.auditConv}<br>
    <b>Carts:</b> ${L.cartStore}<br>
    <b>August:</b> ${L.augPartial}<br>
    ${modelled.length ? `<b>Modelled categories:</b> ${modelled.join(' and ')} — ${A.modelledCats}<br>` : ''}
    <b>Within-month dates:</b> ${A.intraMonth}<br>
    <b>Excluded:</b> ${L.testAccounts} 3 orders (2 wallpaper Jun, 1 wallpaper Jul, 1 flooring Jul) carry no branch_id and sit outside the store tables, so they appear in no store row.
  </div>`;
}
