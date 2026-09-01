'use client';

/* Category Operations Executive dashboard — port of material-depot-site's
   COE_Dashboard.html. The COE chases a completed site audit through to an
   order (D+1/D+3/D+14 call cadence) and tracks custom-wallpaper production
   PO-by-PO through render → approval → print → delivery → install.

   Six tabs, ONE shared data load (audit_orders/install_orders/wp_production/
   ratings) — every tab reads the same in-memory rows so a number on one tab can
   never disagree with another (the CLAUDE.md "sum-to-total" lesson this
   feature's source repo learned the hard way). That is also why 📊 NPS
   analytics computes from `scoredCalls` over these same rows rather than
   querying for its own: it and ⭐ Review scores must never be able to disagree
   about what the COE typed. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { inCity, phoneKey, sbGet, type CityFilter } from './siteAuditShared';
import {
  AUDIT_COLS, AUDIT_TICKED_QUERY, INSTALL_COLS, RATING_COLS, applyCoeCategories, auditCategoryMap,
  mapCoeAudit, mapCoeInstall, type CoeInstall, type CoeOrder, type RatingRow,
} from './coe-ops/shared';
import type { WpRow } from './coe-ops/wpTrack';
import Followups from './coe-ops/Followups';
import InstallReviews from './coe-ops/InstallReviews';
import ReviewScores from './coe-ops/ReviewScores';
import NpsAnalytics from './coe-ops/NpsAnalytics';
import Wallpaper from './coe-ops/Wallpaper';
import Insights from './coe-ops/Insights';

type Tab = 'followups' | 'installreviews' | 'scores' | 'nps' | 'wallpaper' | 'insights';
const TABS: Array<{ k: Tab; l: string }> = [
  { k: 'followups', l: '📞 Audit Follow-ups' },
  { k: 'installreviews', l: '📞 Install Reviews' },
  { k: 'scores', l: '⭐ Review scores' },
  { k: 'nps', l: '📊 NPS analytics' },
  { k: 'wallpaper', l: '🖼️ Custom wallpaper' },
  { k: 'insights', l: '📉 Where it stalls' },
];

export default function SiteAuditCoeView({ city, who, whoEmail }: { city?: CityFilter; who?: string; whoEmail?: string | null }) {
  const [tab, setTab] = useState<Tab>('followups');
  const [orders, setOrders] = useState<CoeOrder[]>([]);
  const [installs, setInstalls] = useState<CoeInstall[]>([]);
  const [wpRows, setWpRows] = useState<WpRow[]>([]);
  /* null = the ratings read failed or hasn't run. NOT an empty table — see the
     `ratings` prop comment in ReviewScores: collapsing the two would offer to
     re-push every score ever captured. sbGet resolves a PostgREST error object
     instead of throwing (CLAUDE.md's Array.isArray landmine), so the array
     check IS the error check here, and the last good value survives a blip. */
  const [ratings, setRatings] = useState<RatingRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  /* Ticked categories, held outside React state because they are only ever
     merged INTO the order list (see the fetch below for why they aren't in
     AUDIT_COLS). The ref is what lets a poll repaint the table with its
     category pills still on it while the second query is in flight — the same
     shape SiteAuditOpsView uses for its own AUDIT_CATEGORY_QUERY. */
  const catsRef = useRef<Map<string, string[]>>(new Map());
  const catsInFlight = useRef(false);

  const load = useCallback(async () => {
    const [aRows, iRows, wRows, rRows] = await Promise.all([
      sbGet('audit_orders?select=' + AUDIT_COLS + '&status=eq.completed&order=date.desc'),
      // _slim (not the base table) — INSTALL_COLS now carries subjobs/log for the Install Reviews
      // tab, and this is the repo's established way to add those columns without reintroducing the
      // photo-bloat problem the base install_orders table has (see e.g. SiteAuditJobsView.tsx).
      sbGet('install_orders_slim?select=' + INSTALL_COLS + '&status=neq.deleted&order=created_at.desc'),
      sbGet('wp_production?select=*&order=created_at.desc'),
      // Narrow projection of the ratings table — only what's needed to tell
      // which captured scores already reached it.
      sbGet('ratings?select=' + RATING_COLS),
    ]);
    if (Array.isArray(aRows)) {
      const mapped = aRows.map(mapCoeAudit).map((o) => {
        const t = catsRef.current.get(String(o.id));
        return t ? { ...o, tickedCats: t } : o;
      });
      setOrders(mapped);

      /* The category query is `audit_ticked` over the same completed rows — the
         only place the auditor's ticked material is recorded, and 1.2 MB / ~1.4s
         because on a completed audit that column IS the job card (the detoast
         trap in CLAUDE.md). So it is NOT part of the 30s poll: a completed
         audit's job card is terminal, so it is asked once and then only again
         when an audit turns up that we have no answer for — a fresh completion.
         Fire-and-forget and fails quietly: no category pill is worth delaying
         or blanking the queue for, and the previous answer stays on screen. */
      const unknown = mapped.some((o) => !catsRef.current.has(String(o.id)));
      if (unknown && !catsInFlight.current) {
        catsInFlight.current = true;
        sbGet(AUDIT_TICKED_QUERY)
          .then((rows) => {
            if (!Array.isArray(rows)) return;
            catsRef.current = auditCategoryMap(rows);
            setOrders((prev) => applyCoeCategories(prev, catsRef.current));
          })
          .catch(() => { /* keep whatever categories we already had */ })
          .finally(() => { catsInFlight.current = false; });
      }
    }
    if (Array.isArray(iRows)) setInstalls(iRows.map(mapCoeInstall));
    if (Array.isArray(wRows)) setWpRows(wRows);
    setRatings(Array.isArray(rRows) ? (rRows as RatingRow[]) : (cur) => cur);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // Each tab's drawer keeps its own local form state (see Wallpaper.tsx's
    // WpDrawer / Followups.tsx's LogCallForm), so a background refetch that
    // replaces `orders`/`wpRows` while one is open can't clobber an
    // in-progress, uncommitted edit — safe to poll unconditionally.
    const tid = setInterval(() => { if (!document.hidden) load(); }, 30000);
    return () => clearInterval(tid);
  }, [load]);

  const installByPhone = useMemo(() => {
    const m = new Map<string, CoeInstall[]>();
    installs.forEach((io) => {
      // Normalised, not raw — orderPlacedFor looks up by phoneKey too.
      const key = phoneKey(io.phone);
      if (!key) return;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(io);
    });
    // oldest first, so orderPlacedFor picks the FIRST order after the audit,
    // not the latest.
    m.forEach((list) => list.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))));
    return m;
  }, [installs]);

  const cityScope = city || 'all';
  const scopedOrders = useMemo(() => inCity(orders, cityScope), [orders, cityScope]);
  const scopedWp = useMemo(() => inCity(wpRows as unknown as Array<{ city?: string | null }>, cityScope) as unknown as WpRow[], [wpRows, cityScope]);
  const scopedInstalls = installs; // installs aren't city-tagged in this table; seeds/phone-matching stay global.

  const attribution = who || 'Category Ops';

  return (
    <div>
      <div className="mb-4 flex gap-0 overflow-x-auto border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`whitespace-nowrap border-b-2 bg-transparent px-4 py-2.5 text-[13px] font-semibold ${tab === t.k ? 'border-[#1F3A5F] text-gray-800' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
          >
            {t.l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-[#1F3A5F]" /></div>
      ) : tab === 'followups' ? (
        <Followups orders={scopedOrders} installByPhone={installByPhone} who={attribution} whoEmail={whoEmail} onChanged={load} />
      ) : tab === 'installreviews' ? (
        <InstallReviews installs={scopedInstalls} who={attribution} whoEmail={whoEmail} onChanged={load} />
      ) : tab === 'scores' ? (
        <ReviewScores orders={scopedOrders} installs={scopedInstalls} installByPhone={installByPhone} ratings={ratings} onChanged={load} />
      ) : tab === 'nps' ? (
        <NpsAnalytics orders={scopedOrders} installs={scopedInstalls} installByPhone={installByPhone} />
      ) : tab === 'wallpaper' ? (
        <Wallpaper rows={scopedWp} installs={scopedInstalls} who={attribution} city={cityScope} onChanged={load} />
      ) : (
        <Insights orders={scopedOrders} installByPhone={installByPhone} wpRows={scopedWp} />
      )}
    </div>
  );
}
