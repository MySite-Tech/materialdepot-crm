'use client';

import { useEffect, useMemo, useState } from 'react';
import { fmtDateA, phoneKey, sbGet, siteAuditRoleForCrmRole, type CityFilter } from '../siteAuditShared';
import SiteAuditPerfView from './SiteAuditPerfView';
import { STATUS, dropSupersededPreBookings, orderBelongsToBm, type BmProfile } from './SiteAuditBmView';
import { InstallOrdersList, WallpaperOrdersList, loadOwnedInstalls, loadOwnedWallpapers, type OwnedInstall } from './ownedOrders';
import type { WpRow } from '../coe-ops/wpTrack';
import { fetchUsers } from '@/lib/mockApi';

type SiteProfile = { id: string; name: string; email: string; role: string; contact: string | null; branch?: string | null };

type RollupOrder = {
  id: string; pi: string; bm: string; name: string; phone: string; status: string; date: string | null;
};

type Scope = {
  branches: string[];
  roster: BmProfile[];
  bms: BmProfile[];
  rosterEmails: string[];
  unassigned: number;
  crmReachable: boolean;
};

const FIELD_WORK_ROLES = new Set(['site_auditor', 'installer', 'auditor_installer', 'service_mgr']);

const ROLLUP_AUDIT_COLS = 'id,pi,po,bm,bm_email,customer_name,phone,status,date,created_at';

const EMPTY_SCOPE: Scope = { branches: [], roster: [], bms: [], rosterEmails: [], unassigned: 0, crmReachable: false };

export default function SiteAuditBranchManagerView({
  branches = null,
  contact = null,
  city = 'all',
}: {

  branches?: string[] | null;
  contact?: string | null;
  city?: CityFilter;
}) {
  const [tab, setTab] = useState<'audits' | 'installs' | 'wallpaper' | 'perf'>('audits');
  const [scope, setScope] = useState<Scope>(EMPTY_SCOPE);
  const [scopeReady, setScopeReady] = useState(false);
  const [notFoundInCrm, setNotFoundInCrm] = useState(false);
  const [noBranchAccess, setNoBranchAccess] = useState(false);
  const [audits, setAudits] = useState<RollupOrder[]>([]);
  const [installs, setInstalls] = useState<OwnedInstall[]>([]);
  const [wallpapers, setWallpapers] = useState<WpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');

  const branchKey = branches === null ? 'auto:' + phoneKey(contact) : branches.join('|');

  useEffect(() => {
    let alive = true;
    setScopeReady(false);
    (async () => {
      const [crmUsers, profileRows] = await Promise.all([
        fetchUsers().catch(() => null),

        sbGet('profiles?select=id,name,email,role,contact,branch&order=name.asc').catch(() => null),
      ]);
      if (!alive) return;

      const profiles: SiteProfile[] = Array.isArray(profileRows) ? profileRows : [];
      const profileByPhone = new Map<string, SiteProfile>();
      const ambiguousPhones = new Set<string>();
      for (const p of profiles) {
        const key = phoneKey(p.contact);
        if (!key) continue;

        if (profileByPhone.has(key)) ambiguousPhones.add(key);
        else profileByPhone.set(key, p);
      }

      const crmReachable = Array.isArray(crmUsers);
      const allUsers = Array.isArray(crmUsers) ? crmUsers : [];

      const users = allUsers.filter((u) => u.active !== false);

      let inScope = branches;
      let unscopedManager = false;
      if (inScope === null) {
        const key = phoneKey(contact);
        const me = key ? allUsers.find((u) => phoneKey(u.phone) === key) : undefined;
        if (!me && crmReachable) { setNotFoundInCrm(true); setNoBranchAccess(false); setScope({ ...EMPTY_SCOPE, crmReachable }); setScopeReady(true); return; }
        inScope = me?.allowedBranches || [];

        unscopedManager = inScope.length === 0;
      }
      setNotFoundInCrm(false);

      setNoBranchAccess(unscopedManager);
      if (unscopedManager) {
        setScope({ ...EMPTY_SCOPE, crmReachable });
        setScopeReady(true);
        return;
      }

      const everyStore = inScope.length === 0;
      const wanted = new Set(inScope.map((b) => b.trim().toLowerCase()));
      const belongs = (list?: string[]) =>
        everyStore ? true : !!list?.length && list.some((b) => wanted.has(b.trim().toLowerCase()));

      const roster: BmProfile[] = [];
      const bms: BmProfile[] = [];
      const seen = new Set<string>();
      let unassigned = 0;

      for (const u of users) {
        const saRole = siteAuditRoleForCrmRole(u.role);
        if (!saRole) continue;
        const key = phoneKey(u.phone);
        const profile = key && !ambiguousPhones.has(key) ? profileByPhone.get(key) || null : null;
        if (saRole === 'bm' && !everyStore && !u.allowedBranches?.length) { unassigned++; continue; }
        if (!belongs(u.allowedBranches) && !(profile?.branch && belongs([profile.branch]))) continue;
        const person: BmProfile = {
          id: profile?.id ?? u.id,
          name: profile?.name || u.name,
          email: profile?.email,
          contact: u.phone,
          role: profile?.role || saRole,

          aliases: [u.name, profile?.name].filter((n): n is string => !!n),
        };
        roster.push(person);
        if (key) seen.add(key);
        if (person.role === 'bm' || saRole === 'bm') bms.push(person);
      }

      for (const p of profiles) {
        if (p.role === 'admin') continue;
        if (!p.branch || !belongs([p.branch])) continue;
        const key = phoneKey(p.contact);
        if (key && seen.has(key)) continue;
        const person: BmProfile = { id: p.id, name: p.name, email: p.email, contact: p.contact || undefined, role: p.role };
        roster.push(person);
        if (key) seen.add(key);
        if (p.role === 'bm') bms.push(person);
      }

      setScope({
        branches: inScope,
        roster,
        bms,
        rosterEmails: roster
          .filter((p) => p.role && FIELD_WORK_ROLES.has(p.role))
          .map((p) => p.email)
          .filter((e): e is string => !!e),
        unassigned,
        crmReachable,
      });
      setScopeReady(true);
    })().catch(() => { if (alive) { setScope(EMPTY_SCOPE); setScopeReady(true); } });
    return () => { alive = false; };
  }, [branchKey, branches, contact]);

  const bmKey = scope.bms.map((b) => phoneKey(b.contact) || b.name).join('|');

  useEffect(() => {
    if (!scopeReady) return;
    if (!scope.bms.length) { setAudits([]); setInstalls([]); setWallpapers([]); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    const run = async () => {
      const [auditRows, installRows, wpRows] = await Promise.all([
        sbGet('audit_orders?select=' + ROLLUP_AUDIT_COLS + '&status=neq.deleted&order=created_at.desc'),
        loadOwnedInstalls(scope.bms),
        loadOwnedWallpapers(scope.bms),
      ]);
      if (!alive) return;

      const list = dropSupersededPreBookings(Array.isArray(auditRows) ? auditRows : []);
      setAudits(
        list
          .filter((r: any) => scope.bms.some((bm) => orderBelongsToBm(r, bm)))
          .map((r: any) => ({
            id: r.id, pi: r.pi || '', bm: r.bm || '—', name: r.customer_name || '',
            phone: r.phone || '', status: r.status || 'pending', date: r.date || null,
          })),
      );
      setInstalls(installRows);
      setWallpapers(wpRows);
      setLoading(false);
    };
    run().catch(() => { if (alive) setLoading(false); });
    const tid = setInterval(() => { if (!document.hidden) run().catch(() => {}); }, 30000);
    return () => { alive = false; clearInterval(tid); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeReady, bmKey]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    audits.forEach((o) => { c[o.status] = (c[o.status] || 0) + 1; });
    return c;
  }, [audits]);

  const auditList = audits.filter((o) => {
    if (filter !== 'all' && o.status !== filter) return false;
    if (!q) return true;
    return (o.pi + ' ' + o.name + ' ' + o.phone + ' ' + o.bm).toLowerCase().includes(q.toLowerCase());
  });

  const storeLabel = scope.branches.length ? scope.branches.join(', ') : 'All stores';

  if (!scopeReady) {
    return <div className="flex justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[#EAB308]" /></div>;
  }

  if (noBranchAccess) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-semibold text-amber-800">
        No Branch Access is set on this CRM account, so there&apos;s no store to roll up. Ask an admin to set it in Admin &gt; Users &gt; Branch Access.
        <div className="mt-1 text-[12px] font-normal">Until then this stays empty on purpose — an unset store means no store, not every store.</div>
      </div>
    );
  }

  if (notFoundInCrm) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-semibold text-amber-800">
        This phone number isn&apos;t in the CRM employee list, so there&apos;s no store to scope this dashboard to. Ask an admin to check Admin &gt; Users.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3">
        <h1 className="text-lg font-bold text-black">Store Manager — {storeLabel}</h1>
        <p className="text-[13px] text-gray-400">
          Read-only view of your store&apos;s field work — {scope.roster.length} staff, {scope.bms.length} BM{scope.bms.length === 1 ? '' : 's'}.
        </p>
      </div>

      {!scope.crmReachable ? (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12.5px] font-semibold text-amber-800">
          Couldn&apos;t load the CRM employee list, so this store&apos;s roster may be incomplete — only profiles with a branch already set are included.
        </div>
      ) : null}

      {scope.unassigned ? (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12.5px] font-semibold text-amber-800">
          {scope.unassigned} BM{scope.unassigned === 1 ? ' has' : 's have'} no Branch Access set in the CRM, so their orders aren&apos;t counted for any store. An admin can fix that in Admin &gt; Users &gt; Branch Access.
        </div>
      ) : null}

      <div className="mb-4 flex gap-0 overflow-x-auto border-b border-gray-200">
        {([
          ['audits', 'Site Audits', audits.length],
          ['installs', 'Installations', installs.length],
          ['wallpaper', 'Custom Wallpaper', wallpapers.length],
          ['perf', 'Team Performance', null],
        ] as const).map(([k, label, n]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`whitespace-nowrap px-4 py-2.5 text-[13px] font-semibold border-b-2 cursor-pointer bg-transparent ${tab === k ? 'border-[#EAB308] text-gray-800' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
          >
            {label}{n === null ? '' : ` (${n})`}
          </button>
        ))}
      </div>

      {!scope.bms.length && tab !== 'perf' ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[13px] text-gray-400">
          <div className="mb-2 text-2xl">🏬</div>
          No BMs are assigned to {storeLabel.toLowerCase() === 'all stores' ? 'any store' : storeLabel} in the CRM yet, so there are no orders to roll up.
          <div className="mt-1 text-[12px]">An admin sets this in Admin &gt; Users &gt; Branch Access.</div>
        </div>
      ) : tab === 'installs' ? (
        <InstallOrdersList orders={installs} loading={loading} showBm />
      ) : tab === 'wallpaper' ? (
        <WallpaperOrdersList orders={wallpapers} loading={loading} showBm />
      ) : tab === 'perf' ? (
        scope.rosterEmails.length ? (
          <SiteAuditPerfView city={city} roster={scope.rosterEmails} />
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[13px] text-gray-400">
            <div className="mb-2 text-2xl">📊</div>
            No site auditors or installers are attached to this store yet, so there are no performance stats to show.
            <div className="mt-1 text-[12px]">
              Field staff aren&apos;t assigned to a store anywhere yet — the CRM&apos;s `field_worker` permission
              doesn&apos;t carry one, and no field-app profile has a branch set.
            </div>
          </div>
        )
      ) : (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1 max-w-[320px]">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">🔎</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, PI…" className="w-full rounded-md border border-gray-200 py-2 pl-8 pr-3 text-[13.5px] outline-none focus:border-yellow-400" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {['all', ...Object.keys(STATUS).filter((k) => counts[k])].map((k) => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className={filter === k ? 'rounded-full bg-[#1A1A1A] px-3 py-1.5 text-xs font-semibold text-white' : 'rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600'}
                >
                  {k === 'all' ? 'All' : STATUS[k].l} ({k === 'all' ? audits.length : counts[k]})
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white">
            {loading ? (
              <div className="flex justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[#EAB308]" /></div>
            ) : auditList.length ? auditList.map((o) => {
              const st = STATUS[o.status] || { l: o.status, c: 'bg-gray-100 text-gray-600' };
              return (
                <div key={o.id} className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-bold text-gray-900">{o.name || '—'}</div>
                    <div className="text-[12px] text-gray-400">{o.pi} · {o.phone || '—'} · BM: {o.bm}{o.date ? ' · ' + fmtDateA(o.date) : ''}</div>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.c}`}>{st.l}</span>
                </div>
              );
            }) : (
              <div className="py-12 text-center text-[13px] text-gray-400">
                <div className="mb-2 text-2xl">📭</div>
                {audits.length ? 'No site audits match your filters.' : 'No site audits found for the BMs in this store yet.'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
