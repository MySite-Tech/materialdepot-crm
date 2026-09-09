'use client';

import { CatAnalyticsApi, catAnalyticsIfLoaded, loadCatAnalytics } from '../../../data/cat-analytics';
import { CityFilter, inCity, sbGetLong } from '../../../shared';
import { AnalyticsBody } from './body';
import { AnalyticsData, AnalyticsState } from '../types';
import { _anDstr } from '../utils';
import { useEffect, useState } from 'react';

export function ExecutionAnalyticsView({ city = 'all' }: { city?: CityFilter }) {
  const [analyticsFrom, setAnalyticsFrom] = useState(() => {
    const t = new Date();
    t.setDate(t.getDate() - 6);
    return _anDstr(t);
  });
  const [analyticsTo, setAnalyticsTo] = useState(() => _anDstr(new Date()));

  const [state, setState] = useState<AnalyticsState>({ loading: true, error: false, data: null });

  const [chartApi, setChartApi] = useState<CatAnalyticsApi | null>(() => catAnalyticsIfLoaded());
  useEffect(() => {
    if (chartApi) return;
    let alive = true;
    loadCatAnalytics()
      .then((m) => alive && setChartApi(m))
      .catch(() => {
        /* charts stay hidden; every ops number on this tab is unaffected */
      });
    return () => {
      alive = false;
    };
  }, [chartApi]);
  const [tempFrom, setTempFrom] = useState(analyticsFrom);
  const [tempTo, setTempTo] = useState(analyticsTo);
  useEffect(() => {
    setTempFrom(analyticsFrom);
    setTempTo(analyticsTo);
  }, [analyticsFrom, analyticsTo]);

  useEffect(() => {
    let alive = true;
    (async () => {
      let installRes: any, auditRes: any, ratingsRes: any;
      try {
        [installRes, auditRes, ratingsRes] = await Promise.all([

          sbGetLong('install_orders_slim?select=id,pi,status,subjobs,service,delivery_date,created_at,city,customer_name,bm,phone&status=neq.deleted'),
          sbGetLong(
            'audit_orders?select=id,pi,status,date,slot,auditor_name,auditor_email,phone,log,created_at,city&status=not.in.(deleted,slot_reserved,slot_converted)'
          ),

          sbGetLong('ratings?select=order_type,order_id,pi,q1_score,q2_score,q3_score,created_at,staff_name,staff_email'),
        ]);
      } catch (e) {
        if (alive) setState({ loading: false, error: true, data: null });
        return;
      }

      if (Array.isArray(installRes)) installRes = inCity(installRes, city);
      if (Array.isArray(auditRes)) auditRes = inCity(auditRes, city);

      const [ratingsFallback, delivMeta, installLogRes, signMeta] = await Promise.all([
        Array.isArray(ratingsRes)
          ? Promise.resolve(ratingsRes)
          : sbGetLong('ratings?select=order_type,order_id,pi,q1_score,q2_score,created_at,staff_name,staff_email').catch(() => []),
        sbGetLong('install_orders?select=pi,original_delivery_date&status=neq.deleted').catch(() => []),
        sbGetLong('install_orders?select=pi,phone,log&status=neq.deleted&created_at=gte.2026-07-01').catch(() => []),

        sbGetLong('audit_orders?select=id,signedName:audit_ticked->sign->>name&status=eq.completed').catch(() => null),
      ]);
      ratingsRes = ratingsFallback;

      if (city !== 'all' && Array.isArray(ratingsRes)) {
        const iRows = Array.isArray(installRes) ? installRes : [];
        const aRows = Array.isArray(auditRes) ? auditRes : [];
        const iIds = new Set(iRows.map((o: any) => String(o.id)));
        const aIds = new Set(aRows.map((o: any) => String(o.id)));
        const iPis = new Set(iRows.map((o: any) => o.pi));
        const aPis = new Set(aRows.map((o: any) => o.pi));
        ratingsRes = ratingsRes.filter((r: any) => {
          if (r.order_type === 'install') return r.order_id ? iIds.has(String(r.order_id)) : iPis.has(r.pi);
          if (r.order_type === 'audit') return r.order_id ? aIds.has(String(r.order_id)) : aPis.has(r.pi);
          return false;
        });
      }

      const signOk = Array.isArray(signMeta);
      if (signOk && Array.isArray(auditRes)) {
        const sm: Record<string, string | null> = {};
        for (const r of signMeta as any[]) sm[r.id] = r.signedName || null;
        for (const o of auditRes) o.signedName = sm[o.id] || null;
      }
      if (Array.isArray(installRes) && Array.isArray(delivMeta)) {
        const dm: Record<string, any> = {};
        for (const r of delivMeta) dm[r.pi] = r.original_delivery_date || null;
        for (const o of installRes) o.original_delivery_date = dm[o.pi] || null;
      }
      if (Array.isArray(installLogRes) && Array.isArray(installRes)) {
        const lm: Record<string, any> = {};
        for (const r of installLogRes) lm[r.pi] = { phone: r.phone || null, log: r.log || [] };
        for (const o of installRes) {

          o.phone = lm[o.pi]?.phone ?? o.phone ?? null;
          o.log = lm[o.pi]?.log || [];
        }
      }
      if (!alive) return;
      setState({
        loading: false,
        error: false,
        data: {
          installs: Array.isArray(installRes) ? installRes : [],
          audits: Array.isArray(auditRes) ? auditRes : [],
          ratings: Array.isArray(ratingsRes) ? ratingsRes : [],
          auditSignOk: signOk,
        },
      });
    })();
    return () => {
      alive = false;
    };
  }, [city]);

  if (state.loading)
    return <div className="text-center py-8 text-[13px] text-gray-400">Loading…</div>;
  if (state.error)
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-4 py-6 text-[13px] font-semibold text-red-600">
        ⚠ Failed to load operations data — network timeout. Please try again.
      </div>
    );

  return (
    <AnalyticsBody
      data={state.data as AnalyticsData}
      chartApi={chartApi}
      from={analyticsFrom}
      to={analyticsTo}
      tempFrom={tempFrom}
      tempTo={tempTo}
      setTempFrom={setTempFrom}
      setTempTo={setTempTo}
      setAnalyticsFrom={setAnalyticsFrom}
      setAnalyticsTo={setAnalyticsTo}
    />
  );
}
