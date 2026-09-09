'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { inCity, phoneKey, sbGet, type CityFilter } from '../siteAuditShared';
import {
  AUDIT_COLS, AUDIT_TICKED_QUERY, INSTALL_COLS, RATING_COLS, applyCoeCategories, auditCategoryMap,
  mapCoeAudit, mapCoeInstall, type CoeInstall, type CoeOrder, type RatingRow,
} from '../coe-ops/shared';
import type { WpRow } from '../coe-ops/wpTrack';
import Followups from '../coe-ops/Followups';
import InstallReviews from '../coe-ops/InstallReviews';
import ReviewScores from '../coe-ops/ReviewScores';
import NpsAnalytics from '../coe-ops/NpsAnalytics';
import Wallpaper from '../coe-ops/Wallpaper';
import Insights from '../coe-ops/Insights';

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

  const [ratings, setRatings] = useState<RatingRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  const catsRef = useRef<Map<string, string[]>>(new Map());
  const catsInFlight = useRef(false);

  const load = useCallback(async () => {
    const [aRows, iRows, wRows, rRows] = await Promise.all([
      sbGet('audit_orders?select=' + AUDIT_COLS + '&status=eq.completed&order=date.desc'),

      sbGet('install_orders_slim?select=' + INSTALL_COLS + '&status=neq.deleted&order=created_at.desc'),
      sbGet('wp_production?select=*&order=created_at.desc'),

      sbGet('ratings?select=' + RATING_COLS),
    ]);
    if (Array.isArray(aRows)) {
      const mapped = aRows.map(mapCoeAudit).map((o) => {
        const t = catsRef.current.get(String(o.id));
        return t ? { ...o, tickedCats: t } : o;
      });
      setOrders(mapped);

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

    const tid = setInterval(() => { if (!document.hidden) load(); }, 30000);
    return () => clearInterval(tid);
  }, [load]);

  const installByPhone = useMemo(() => {
    const m = new Map<string, CoeInstall[]>();
    installs.forEach((io) => {

      const key = phoneKey(io.phone);
      if (!key) return;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(io);
    });

    m.forEach((list) => list.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))));
    return m;
  }, [installs]);

  const cityScope = city || 'all';
  const scopedOrders = useMemo(() => inCity(orders, cityScope), [orders, cityScope]);
  const scopedWp = useMemo(() => inCity(wpRows as unknown as Array<{ city?: string | null }>, cityScope) as unknown as WpRow[], [wpRows, cityScope]);
  const scopedInstalls = installs;

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
