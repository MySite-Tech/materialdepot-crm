'use client';

/* The installation and wallpaper halves of "my orders".

   A BM's order book is three things, not one: the site audit (audit_orders),
   the installation that follows it (install_orders) and, when the wallpaper is
   printed to order, the custom-wallpaper production run (wp_production).
   SiteAuditBmView only ever loaded audit_orders, so BMs could see an audit was
   done and nothing about whether the material got installed. Both extra lists
   are READ-ONLY here — scheduling installs stays with the Service Manager and
   wallpaper production stays with the Category Ops Executive; this is purely
   "where has my customer's order got to".

   Attribution reuses SiteAuditBmView's `orderBelongsToBm` unchanged, so all
   three lists agree on who owns an order and nothing here matches fuzzily.
   Note install_orders has no `bm_email` column at all (only audit_orders and
   wp_production do), so its rows always resolve through the free-text `bm`
   name/contact path. */

import { useEffect, useMemo, useState } from 'react';
import { fmtDateA, sbGet } from './siteAuditShared';
import { orderBelongsToBm, type BmProfile } from './SiteAuditBmView';
import { STATUS as INSTALL_STATUS } from './install-ops/shared';
import { WP_BUCKETS, wpBucket, wpNext, wpVendor, type WpRow } from './coe-ops/wpTrack';

export const OWNED_INSTALL_COLS = 'id,pi,po,bm,customer_name,phone,addr,status,delivery_date,custom_wp,subjobs,city,created_at';
export const OWNED_WP_COLS = 'id,pi,md_id,vendor,city,customer_name,phone,bm,bm_email,order_placed_at,stages,rounds,state,imported,install_order_id,audit_order_id,created_at';

export type OwnedInstall = {
  id: string; pi: string; po: string[]; bm: string; name: string; phone: string; addr: string;
  status: string; deliveryDate: string | null; customWp: boolean;
  subjobs: Array<{ id?: string; type?: string; date?: string | null; status?: string }>;
};

export function mapOwnedInstall(r: any): OwnedInstall {
  return {
    id: r.id,
    pi: r.pi || '',
    po: r.po ? String(r.po).split(',').map((s: string) => s.trim()).filter(Boolean) : [],
    bm: r.bm || '—',
    name: r.customer_name || '',
    phone: r.phone || '',
    addr: r.addr || '',
    status: r.status || 'pending',
    deliveryDate: r.delivery_date || null,
    customWp: !!r.custom_wp,
    subjobs: Array.isArray(r.subjobs) ? r.subjobs : [],
  };
}

/* One fetch per table, filtered client-side against every person passed in —
   the same shape SiteAuditBmView and SiteAuditBranchManagerView already use,
   so a store manager's whole-branch rollup costs the same two requests as one
   BM's own list. */
export async function loadOwnedInstalls(people: BmProfile[]): Promise<OwnedInstall[]> {
  if (!people.length) return [];
  const rows = await sbGet('install_orders_slim?select=' + OWNED_INSTALL_COLS + '&status=neq.deleted&order=created_at.desc');
  if (!Array.isArray(rows)) return [];
  return rows.filter((r: any) => people.some((p) => orderBelongsToBm(r, p))).map(mapOwnedInstall);
}

export async function loadOwnedWallpapers(people: BmProfile[]): Promise<WpRow[]> {
  if (!people.length) return [];
  const rows = await sbGet('wp_production?select=' + OWNED_WP_COLS + '&order=created_at.desc');
  if (!Array.isArray(rows)) return [];
  return rows.filter((r: any) => people.some((p) => orderBelongsToBm(r, p))) as WpRow[];
}

/* ── Installations ─────────────────────────────────────────────────────── */

function SubjobChips({ subjobs }: { subjobs: OwnedInstall['subjobs'] }) {
  if (!subjobs.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {subjobs.map((sj, i) => {
        const st = sj.status ? INSTALL_STATUS[sj.status] : null;
        return (
          <span key={sj.id || i} className="rounded bg-gray-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-gray-500">
            {sj.type || 'job'}
            {sj.date ? ' · ' + fmtDateA(sj.date) : ''}
            {st ? ' · ' + st.l : ''}
          </span>
        );
      })}
    </div>
  );
}

export function InstallOrdersList({ orders, loading, showBm = false }: { orders: OwnedInstall[]; loading: boolean; showBm?: boolean }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    orders.forEach((o) => { c[o.status] = (c[o.status] || 0) + 1; });
    return c;
  }, [orders]);

  const list = orders.filter((o) => {
    if (filter !== 'all' && o.status !== filter) return false;
    if (!q) return true;
    return [o.pi, o.name, o.phone, o.bm, ...(o.po || [])].join(' ').toLowerCase().includes(q.toLowerCase());
  });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 max-w-[320px]">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">🔎</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, PI…" className="w-full rounded-md border border-gray-200 py-2 pl-8 pr-3 text-[13.5px] outline-none focus:border-yellow-400" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {['all', ...Object.keys(INSTALL_STATUS).filter((k) => counts[k])].map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={filter === k ? 'rounded-full bg-[#1A1A1A] px-3 py-1.5 text-xs font-semibold text-white' : 'rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600'}
            >
              {k === 'all' ? 'All' : INSTALL_STATUS[k].l} ({k === 'all' ? orders.length : counts[k]})
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        {loading ? (
          <div className="flex justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[#EAB308]" /></div>
        ) : list.length ? list.map((o) => {
          const st = INSTALL_STATUS[o.status] || { l: o.status, badge: 'bg-gray-100 text-gray-600' };
          return (
            <div key={o.id} className="flex items-start gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold text-gray-900">
                  {o.name || '—'}
                  {o.customWp ? <span className="ml-1.5 rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700">Custom WP</span> : null}
                </div>
                <div className="text-[12px] text-gray-400">
                  {o.pi} · {o.phone || '—'}
                  {showBm ? ' · BM: ' + o.bm : ''}
                  {o.deliveryDate ? ' · delivery ' + fmtDateA(o.deliveryDate) : ''}
                </div>
                <SubjobChips subjobs={o.subjobs} />
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.badge}`}>{st.l}</span>
            </div>
          );
        }) : (
          <div className="py-12 text-center text-[13px] text-gray-400">
            <div className="mb-2 text-2xl">🛠</div>
            {orders.length
              ? 'No installations match your filters.'
              : 'No installation orders are attributed here yet — an install order links to a BM by the name (or contact number) in its BM field.'}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Custom wallpaper production ───────────────────────────────────────── */

const WP_STATE_BADGE: Record<string, { l: string; badge: string }> = {
  active: { l: 'In production', badge: 'bg-sky-100 text-sky-700' },
  done: { l: 'Done', badge: 'bg-green-100 text-green-700' },
  on_hold: { l: 'On hold', badge: 'bg-amber-100 text-amber-800' },
  cancelled: { l: 'Cancelled', badge: 'bg-red-100 text-red-700' },
};

export function WallpaperOrdersList({ orders, loading, showBm = false }: { orders: WpRow[]; loading: boolean; showBm?: boolean }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    orders.forEach((o) => { const b = wpBucket(o); c[b] = (c[b] || 0) + 1; });
    return c;
  }, [orders]);

  const list = orders.filter((o) => {
    if (filter !== 'all' && wpBucket(o) !== filter) return false;
    if (!q) return true;
    return [o.pi, o.md_id, o.customer_name, o.phone, o.bm].join(' ').toLowerCase().includes(q.toLowerCase());
  });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 max-w-[320px]">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">🔎</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, PI, MD ID…" className="w-full rounded-md border border-gray-200 py-2 pl-8 pr-3 text-[13.5px] outline-none focus:border-yellow-400" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {['all', ...WP_BUCKETS.filter((b) => counts[b.k]).map((b) => b.k)].map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={filter === k ? 'rounded-full bg-[#1A1A1A] px-3 py-1.5 text-xs font-semibold text-white' : 'rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600'}
            >
              {k === 'all' ? 'All' : (WP_BUCKETS.find((b) => b.k === k)?.l || k)} ({k === 'all' ? orders.length : counts[k]})
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        {loading ? (
          <div className="flex justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[#EAB308]" /></div>
        ) : list.length ? list.map((o) => {
          const state = WP_STATE_BADGE[o.state] || { l: o.state || '—', badge: 'bg-gray-100 text-gray-600' };
          const next = wpNext(o);
          return (
            <div key={o.id} className="flex items-start gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold text-gray-900">{o.customer_name || '—'}</div>
                <div className="text-[12px] text-gray-400">
                  {o.pi || o.md_id || '—'} · {o.phone || '—'} · {wpVendor(o.vendor).label}
                  {showBm ? ' · BM: ' + (o.bm || '—') : ''}
                  {o.order_placed_at ? ' · placed ' + fmtDateA(String(o.order_placed_at).slice(0, 10)) : ''}
                </div>
                <div className="mt-1 text-[11.5px] font-semibold text-gray-500">
                  {/* wpNext() returns null both for a finished run and a cancelled
                      one — don't report a cancelled PO as complete. */}
                  {next
                    ? 'Next: ' + next.label + (next.redo ? ' (redo)' : '')
                    : o.state === 'cancelled' ? 'PO cancelled — production stopped' : 'All production stages complete'}
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${state.badge}`}>{state.l}</span>
            </div>
          );
        }) : (
          <div className="py-12 text-center text-[13px] text-gray-400">
            <div className="mb-2 text-2xl">🎨</div>
            {orders.length
              ? 'No wallpaper orders match your filters.'
              : 'No custom-wallpaper production runs are attributed here yet — a run links to a BM by its BM field.'}
          </div>
        )}
      </div>
    </div>
  );
}

/* Loads both extra lists for a set of people and keeps them fresh on the same
   30s cadence the other Site Audit views poll on. */
export function useOwnedExtras(people: BmProfile[], deps: string) {
  const [installs, setInstalls] = useState<OwnedInstall[]>([]);
  const [wallpapers, setWallpapers] = useState<WpRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const run = () => Promise.all([loadOwnedInstalls(people), loadOwnedWallpapers(people)])
      .then(([i, w]) => { if (!alive) return; setInstalls(i); setWallpapers(w); setLoading(false); })
      .catch(() => { if (alive) setLoading(false); });
    run();
    const tid = setInterval(() => { if (!document.hidden) run(); }, 30000);
    return () => { alive = false; clearInterval(tid); };
    // `deps` is a stable key for `people` — the array identity changes on every
    // render of the parent, which would otherwise re-fetch in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps]);

  return { installs, wallpapers, loading };
}
