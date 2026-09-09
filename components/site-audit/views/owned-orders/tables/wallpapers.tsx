'use client';

import WpLadder from '../../../coe-ops/wallpaper/ladder';
import { WP_BUCKETS, WpRow, wpBucket, wpNext, wpVendor } from '../../../coe-ops/wallpaper/track';
import { STATUS as INSTALL_STATUS } from '../../../install-ops/shared';
import { fmtDateA, fmtLog, sbGet } from '../../../shared';
import { DrawerShell, KV, Sec } from '../../../ui/drawer-ui';
import { WP_DRAWER_COLS, WP_STATE_BADGE } from '../constants';
import { useCallback, useEffect, useMemo, useState } from 'react';

export function WallpaperOrdersList({ orders, loading, showBm = false }: { orders: WpRow[]; loading: boolean; showBm?: boolean }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState<string | null>(null);

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

  const openRow = orders.find((o) => o.id === openId) || null;

  return (
    <div>
      <div className="mb-2 text-[12px] text-gray-400">
        Wallpaper printed to order for your clients. Standard wallpaper from stock has no production run — it shows up
        under Installations instead.
      </div>
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
            <div key={o.id} onClick={() => setOpenId(o.id)} className="flex cursor-pointer items-start gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 hover:bg-gray-50">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold text-gray-900">{o.customer_name || '—'}</div>
                <div className="text-[12px] text-gray-400">
                  {o.pi || o.md_id || '—'} · {o.phone || '—'} · {wpVendor(o.vendor).label}
                  {showBm ? ' · BM: ' + (o.bm || '—') : ''}
                  {o.order_placed_at ? ' · placed ' + fmtDateA(String(o.order_placed_at).slice(0, 10)) : ''}
                </div>
                <div className="mt-1 text-[11.5px] font-semibold text-gray-500">

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

      {openRow ? <WallpaperOrderDrawer row={openRow} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}

function WallpaperOrderDrawer({ row, onClose }: { row: WpRow; onClose: () => void }) {

  const [full, setFull] = useState<WpRow>(row);
  const [extrasFailed, setExtrasFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [install, setInstall] = useState<{ pi: string; status: string; delivery_date: string | null } | null | 'none'>(null);

  const loadExtras = useCallback(async () => {
    setExtrasFailed(false);
    const rows = await sbGet('wp_production?id=eq.' + row.id + '&select=' + WP_DRAWER_COLS);
    if (!Array.isArray(rows) || !rows[0]) { setExtrasFailed(true); setLoaded(true); return; }
    setFull((cur) => ({ ...cur, log: Array.isArray(rows[0].log) ? rows[0].log : [], notes: rows[0].notes || '' }));
    setLoaded(true);
  }, [row.id]);

  useEffect(() => { setFull(row); setLoaded(false); loadExtras(); }, [row, loadExtras]);

  useEffect(() => {
    if (!row.install_order_id) { setInstall('none'); return; }
    let alive = true;
    sbGet('install_orders_slim?id=eq.' + row.install_order_id + '&select=pi,status,delivery_date')
      .then((rows) => { if (alive) setInstall(Array.isArray(rows) && rows[0] ? rows[0] : 'none'); })
      .catch(() => { if (alive) setInstall(null); });
    return () => { alive = false; };
  }, [row.install_order_id]);

  const v = wpVendor(full.vendor);
  const state = WP_STATE_BADGE[full.state] || { l: full.state || '—', badge: 'bg-gray-100 text-gray-600' };

  return (
    <DrawerShell
      title={full.customer_name || '—'}
      subtitle={<>{full.md_id || '—'} · {full.pi || '—'} · {v.label}</>}
      badge={<span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${state.badge}`}>{state.l}</span>}
      onClose={onClose}
    >
      <Sec title="Order">
        <KV k="Phone" v={full.phone ? <a className="text-blue-600" href={'tel:' + String(full.phone).replace(/\s/g, '')}>{full.phone}</a> : '—'} />
        <KV k="BM" v={full.bm || '—'} />
        <KV k="Vendor" v={<>{v.label}{v.note ? <span className="text-gray-400"> · {v.note}</span> : null}</>} />
        <KV k="City" v={full.city || '—'} />
        <KV k="Order placed" v={full.order_placed_at ? fmtLog(full.order_placed_at) : '—'} />
        <KV k="Installation" v={
          install === null ? <span className="text-amber-700">couldn&apos;t load</span>
            : install === 'none' ? <span className="text-gray-400">not linked to an installation order yet</span>
              : <>{install.pi} · {(INSTALL_STATUS[install.status] || { l: install.status }).l}{install.delivery_date ? ' · delivery ' + fmtDateA(install.delivery_date) : ''}</>
        } />
      </Sec>

      <Sec title="Production ladder"><WpLadder row={full} /></Sec>

      <Sec title="Activity">
        {extrasFailed ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-800">
            Couldn&apos;t load this run&apos;s activity — a connection problem, not an empty log.
            <button className="ml-1.5 font-bold underline" onClick={loadExtras}>Retry</button>
          </div>
        ) : !loaded ? <div className="text-[12.5px] text-gray-400">Loading…</div>
          : Array.isArray(full.log) && full.log.length ? full.log.slice().reverse().map((l, i) => (
            <div key={i} className="border-b border-gray-100 py-2 last:border-b-0">
              <div className="text-[13px] font-bold">{l.t || ''}</div>
              <div className="mt-0.5 text-[11.5px] text-gray-400">{fmtLog(l.d)}{l.who ? ' · ' + l.who : ''}</div>
            </div>
          )) : <div className="text-[12.5px] text-gray-400">Nothing logged yet.</div>}
      </Sec>
    </DrawerShell>
  );
}
