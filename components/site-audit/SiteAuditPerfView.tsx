'use client';

import { useEffect, useState } from 'react';
import { activeStaffFilter, inCity, sbGet, ROLES, initials, type CityFilter } from './siteAuditShared';

interface PerfState {
  loading: boolean;
  field: any[];
  auditOrders: any[];
  installOrders: any[];
}

interface Stats {
  total: number;
  done: number;
  pending: number;
  monthly: number;
  pct: number;
}

export default function SiteAuditPerfView({ city = 'all', roster = null }: { city?: CityFilter; roster?: string[] | null } = {}) {
  const [state, setState] = useState<PerfState>({ loading: true, field: [], auditOrders: [], installOrders: [] });

  useEffect(() => {
    let alive = true;
    (async () => {
      const [usersRes, auditRes, installRes] = await Promise.all([
        /* Current staff only. A leaver would otherwise render as a row of
           zeros for any period after they left, and "these people did nothing"
           is exactly the misreading this view's roster filter exists to avoid. */
        activeStaffFilter().then((f) => sbGet('profiles?select=*&role=neq.admin&order=name.asc' + f)),
        sbGet('audit_orders?select=auditor_email,status,created_at,created_by_email,city&status=not.in.(deleted,slot_reserved,slot_converted)'),
        sbGet('install_orders_slim?select=subjobs,status,created_at,created_by_email,city'),
      ]);
      if (!alive) return;
      // City scope — staff are scoped by profiles.city, orders by their own city.
      // `roster` (a list of emails) additionally narrows staff to a single
      // branch, for the Branch Manager rollup view — every other caller
      // passes no roster, so their behavior is unchanged.
      const field = Array.isArray(usersRes)
        ? inCity(usersRes.filter((u: any) => u.role !== 'admin' && (!roster || roster.includes(u.email))), city)
        : [];
      setState({
        loading: false,
        field,
        auditOrders: Array.isArray(auditRes) ? inCity(auditRes, city) : [],
        installOrders: Array.isArray(installRes) ? inCity(installRes, city) : [],
      });
    })();
    return () => {
      alive = false;
    };
  }, [city, roster]);

  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400 text-[13px]">
        <span className="animate-spin border-2 border-gray-300 border-t-[#EAB308] rounded-full h-5 w-5"></span>
      </div>
    );
  }

  const { field, auditOrders, installOrders } = state;

  if (!field.length) {
    return (
      <>
        <div className="mb-4">
          <h1 className="text-lg font-bold text-black">Performance</h1>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-4 sm:px-6 py-4">
          <div className="text-center py-8 text-gray-400 text-[13px]">
            <div className="text-2xl mb-2">📊</div>
            <div>No field staff found. Add users with Site Auditor or Installer roles first.</div>
          </div>
        </div>
      </>
    );
  }

  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const statsFor = (u: any): Stats => {
    if (u.role === 'site_auditor' || u.role === 'auditor_installer') {
      const mine = auditOrders.filter((o) => o.auditor_email === u.email);
      const atotal = mine.length;
      const adone = mine.filter((o) => o.status === 'completed').length;
      const amonthly = mine.filter((o) => (o.created_at || '').startsWith(ym)).length;
      if (u.role === 'site_auditor') {
        return {
          total: atotal,
          done: adone,
          pending: atotal - adone,
          monthly: amonthly,
          pct: atotal ? Math.round((adone / atotal) * 100) : 0,
        };
      }
      let itotal = 0;
      let idone = 0;
      let imonthly = 0;
      installOrders.forEach((o) => {
        (o.subjobs || []).forEach((sj: any) => {
          const asgn = sj.assignments || [];
          const inAsgn = asgn.length
            ? asgn.some((a: any) => a.installer_email === u.email)
            : sj.installer_email === u.email;
          if (inAsgn) {
            itotal++;
            if (sj.status === 'completed') idone++;
            if ((o.created_at || '').startsWith(ym)) imonthly++;
          }
        });
      });
      const total = atotal + itotal;
      const done = adone + idone;
      const monthly = amonthly + imonthly;
      return { total, done, pending: total - done, monthly, pct: total ? Math.round((done / total) * 100) : 0 };
    }
    if (u.role === 'installer') {
      let total = 0;
      let done = 0;
      let monthly = 0;
      installOrders.forEach((o) => {
        (o.subjobs || []).forEach((sj: any) => {
          if (sj.installer_email === u.email) {
            total++;
            if (sj.status === 'completed') done++;
            if ((o.created_at || '').startsWith(ym)) monthly++;
          }
        });
      });
      return { total, done, pending: total - done, monthly, pct: total ? Math.round((done / total) * 100) : 0 };
    }
    const myA = auditOrders.filter((o) => o.created_by_email === u.email);
    const myI = installOrders.filter((o) => o.created_by_email === u.email);
    const total = myA.length + myI.length;
    const done = myA.filter((o) => o.status === 'completed').length + myI.filter((o) => o.status === 'completed').length;
    const monthly =
      myA.filter((o) => (o.created_at || '').startsWith(ym)).length +
      myI.filter((o) => (o.created_at || '').startsWith(ym)).length;
    return { total, done, pending: total - done, monthly, pct: total ? Math.round((done / total) * 100) : 0 };
  };

  return (
    <>
      <div className="mb-4">
        <h1 className="text-lg font-bold text-black">Performance</h1>
        <p className="text-[13px] text-gray-500">Completion stats per team member, computed from live order data.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {field.map((u) => {
          const color = ROLES[u.role]?.color || '#999';
          const s = statsFor(u);
          const pctColorClass = s.pct >= 90 ? 'text-green-600' : s.pct >= 75 ? 'text-amber-600' : 'text-red-600';
          const pctBarClass = s.pct >= 90 ? 'bg-green-600' : s.pct >= 75 ? 'bg-amber-600' : 'bg-red-600';
          const pctDisplay = s.total ? s.pct + '%' : '—';
          return (
            <div className="rounded-lg border border-gray-200 bg-white p-4" key={u.id}>
              <div className="flex items-center gap-3 mb-3 pb-2 border-b border-gray-100">
                <div
                  className="rounded-full inline-flex items-center justify-center font-semibold text-white shrink-0"
                  style={{ background: color, width: 36, height: 36, fontSize: 36 * 0.45, lineHeight: '36px' }}
                >
                  {initials(u.name)}
                </div>
                <div>
                  <div className="font-semibold text-sm text-black">{u.name}</div>
                  <div className="text-[11px] text-gray-400 uppercase tracking-wide">{ROLES[u.role]?.label || u.role}</div>
                </div>
              </div>
              <div className="flex justify-between items-center text-[13px] py-1">
                <span className="text-gray-500">Total Jobs</span>
                <span className="font-mono font-semibold">{s.total}</span>
              </div>
              <div className="flex justify-between items-center text-[13px] py-1">
                <span className="text-gray-500">Completed</span>
                <span className="font-mono font-semibold text-green-600">{s.done}</span>
              </div>
              <div className="flex justify-between items-center text-[13px] py-1">
                <span className="text-gray-500">Pending</span>
                <span className="font-mono font-semibold text-amber-600">{s.pending}</span>
              </div>
              <div className="flex justify-between items-center text-[13px] py-1">
                <span className="text-gray-500">This Month</span>
                <span className="font-mono font-semibold">{s.monthly}</span>
              </div>
              <div className="flex justify-between items-center text-[13px] py-1">
                <span className="text-gray-500">Completion Rate</span>
                <span className={`font-mono font-semibold ${s.total ? pctColorClass : 'text-gray-400'}`}>{pctDisplay}</span>
              </div>
              {s.total ? (
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-2.5">
                  <div
                    className={`h-full rounded-full ${pctBarClass}`}
                    style={{ width: s.pct + '%', transition: 'width .5s' }}
                  ></div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}
