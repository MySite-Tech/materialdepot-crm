'use client';

import { DealsResult, FunnelStepKey, forgetDeals, loadDealsForPhones } from '../../data/conversionFunnel';
import { fmtDateA, phoneKey, sbGet } from '../../siteAuditShared';
import { InstallOrdersList, WallpaperOrdersList, useOwnedExtras } from '../ownedOrders';
import { AUDIT_COLS, STATUS } from '../../constants/bm-view';
import { BmOrderDrawer } from './drawer';
import { ConversionStrip, FunnelRowChip, buildFunnels, stallCounts } from './funnels';
import { BmProfile, Order } from '../../types/bm-view';
import { dropSupersededPreBookings, orderBelongsToBm } from '../../utils/bm-view';
import { fetchUsers } from '@/lib/mockApi';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export default function SiteAuditBmView({ bm, me }: { bm?: BmProfile | null; me?: BmProfile | null }) {

  const [resolved, setResolved] = useState<BmProfile | null>(bm || me || null);
  const [bmList, setBmList] = useState<BmProfile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [openPi, setOpenPi] = useState<string | null>(null);

  const [book, setBook] = useState<'audits' | 'installs' | 'wallpaper'>('audits');

  const [stall, setStall] = useState<'all' | 'lost' | 'unknown' | FunnelStepKey>('all');
  const [deals, setDeals] = useState<DealsResult | null>(null);
  const [dealsLoading, setDealsLoading] = useState(false);

  const [dealsNonce, setDealsNonce] = useState(0);

  useEffect(() => {
    if (bm) { setResolved(bm); return; }
    let alive = true;
    fetchUsers()
      .then((users) => {
        if (!alive) return;
        setBmList(users.map((u) => ({ id: u.id, name: u.name, contact: u.phone, role: u.role })).filter((u) => u.name));
      })
      .catch(() => { /* picker is optional — the session identity already works */ });
    return () => { alive = false; };
  }, [bm]);

  const lookedUpRef = useRef<string | null>(null);
  useEffect(() => {
    const key = phoneKey(resolved?.contact);
    if (!resolved || resolved.email || !key || lookedUpRef.current === key) return;
    lookedUpRef.current = key;
    let alive = true;
    sbGet('profiles?contact=eq.' + encodeURIComponent(String(resolved.contact)) + '&select=email&limit=1')
      .then((rows) => {
        if (!alive || !Array.isArray(rows) || !rows[0]?.email) return;
        setResolved((cur) => (cur && phoneKey(cur.contact) === key && !cur.email ? { ...cur, email: rows[0].email } : cur));
      })
      .catch(() => { /* email is an enhancement — name/phone matching still applies */ });
    return () => { alive = false; };
  }, [resolved]);

  const aliasLookedUpRef = useRef<string | null>(null);
  useEffect(() => {
    const key = phoneKey(resolved?.contact);
    if (!resolved || resolved.aliases?.length || !key || aliasLookedUpRef.current === key) return;
    aliasLookedUpRef.current = key;
    let alive = true;
    fetchUsers()
      .then((users) => {
        if (!alive) return;
        const hit = users.find((u) => phoneKey(u.phone) === key);
        if (!hit?.name) return;
        setResolved((cur) => (cur && phoneKey(cur.contact) === key && !cur.aliases?.length ? { ...cur, aliases: [hit.name] } : cur));
      })
      .catch(() => { /* alias is an enhancement — the profile name still matches */ });
    return () => { alive = false; };
  }, [resolved]);

  const load = useCallback(async () => {
    if (!resolved) { setLoading(false); return; }
    const rows = await sbGet('audit_orders?select=' + AUDIT_COLS + '&status=neq.deleted&order=created_at.desc');
    if (!Array.isArray(rows)) { setLoading(false); return; }

    setOrders(dropSupersededPreBookings(rows).filter((r: any) => orderBelongsToBm(r, resolved)).map((r: any) => ({
      id: r.id, pi: r.pi || '', po: r.po ? String(r.po).split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      bm: r.bm || '—', name: r.customer_name || '', phone: r.phone || '', addr: r.addr || '',
      status: r.status || 'pending', slot: r.slot || null, date: r.date || null,
      auditorName: r.auditor_name || null, log: r.log || [],
      createdAt: r.created_at || null,
      journey: Array.isArray(r.bm_journey) ? r.bm_journey : [],
      coePlaced: (r.coe_track && r.coe_track.order_placed && r.coe_track.order_placed.at)
        ? { at: r.coe_track.order_placed.at, ref: r.coe_track.order_placed.ref || '' }
        : null,
    })));
    setLoading(false);
  }, [resolved]);

  useEffect(() => {
    setLoading(true);
    load();
    const tid = setInterval(() => { if (!document.hidden && !openPi) load(); }, 30000);
    return () => clearInterval(tid);
  }, [load, openPi]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    orders.forEach((o) => { c[o.status] = (c[o.status] || 0) + 1; });
    return c;
  }, [orders]);

  const people = useMemo(() => (resolved ? [resolved] : []), [resolved]);
  const extrasKey = resolved ? [resolved.email || '', phoneKey(resolved.contact), resolved.name, ...(resolved.aliases || [])].join('|') : '';
  const extras = useOwnedExtras(people, extrasKey);

  const phonesKey = useMemo(
    () => [...new Set(orders.map((o) => phoneKey(o.phone)).filter(Boolean))].sort().join(','),
    [orders],
  );
  useEffect(() => {
    if (!phonesKey) { setDeals(null); return; }
    let alive = true;
    setDealsLoading(true);
    loadDealsForPhones(phonesKey.split(','))
      .then((r) => { if (alive) { setDeals(r); setDealsLoading(false); } })
      .catch(() => { if (alive) setDealsLoading(false); });
    return () => { alive = false; };
  }, [phonesKey, dealsNonce]);

  const recheckDeals = useCallback((phone: string) => {
    forgetDeals(phone);
    setDealsNonce((n) => n + 1);
  }, []);

  const funnels = useMemo(
    () => buildFunnels(orders, deals, extras.installs, extras.wallpapers),
    [orders, deals, extras.installs, extras.wallpapers],
  );
  const stalls = useMemo(() => stallCounts(funnels), [funnels]);

  const list = orders.filter((o) => {
    if (filter !== 'all' && o.status !== filter) return false;
    if (stall !== 'all') {
      const f = funnels.get(o.id);
      if (!f) return false;
      if (stall === 'lost') { if (!f.lost) return false; }
      else if (stall === 'unknown') { if (f.lost || !f.unknownFrom) return false; }
      else if (f.lost || f.unknownFrom || f.stalledAt?.k !== stall) return false;
    }
    if (!q) return true;
    return [o.pi, o.name, o.phone, ...(o.po || [])].join(' ').toLowerCase().includes(q.toLowerCase());
  });

  if (!resolved) {
    return (
      <div>
        <h1 className="text-lg font-bold text-black">My Orders</h1>
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-semibold text-amber-800">
          No logged-in CRM user to attribute orders to — sign in again, or pick a person below.
        </div>
        {bmList.length ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {bmList.map((b) => (
              <button key={String(b.id || b.name)} onClick={() => setResolved(b)} className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-left hover:border-[#EAB308]">
                <div className="text-[13px] font-semibold text-black">{b.name}</div>
                <div className="text-[11px] text-gray-400">{b.contact || b.role || '—'}</div>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  const openOrder = orders.find((o) => o.pi === openPi) || null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div>
          <h1 className="text-lg font-bold text-black">My Orders</h1>
          <p className="text-[13px] text-gray-400">Every site audit, installation and custom-wallpaper run linked to <b>{resolved.name}</b> as the BM{resolved.contact ? ' · ' + resolved.contact : ''}.</p>
        </div>
        {!bm && bmList.length > 1 ? (
          <label className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            Viewing
            <select
              value={String(resolved.id ?? '')}
              onChange={(e) => setResolved(bmList.find((b) => String(b.id) === e.target.value) || resolved)}
              className="rounded-md border border-gray-200 px-2 py-1.5 text-[13px] font-normal normal-case tracking-normal text-gray-900"
            >
              {(bmList.some((b) => String(b.id) === String(resolved.id)) ? bmList : [resolved, ...bmList]).map((b) => (
                <option key={String(b.id ?? b.name)} value={String(b.id ?? '')}>{b.name}{b.role ? ' · ' + b.role : ''}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="mb-4 flex gap-0 overflow-x-auto border-b border-gray-200">
        {([
          ['audits', 'Site Audits', orders.length],
          ['installs', 'Installations', extras.installs.length],
          ['wallpaper', 'Custom Wallpaper', extras.wallpapers.length],
        ] as const).map(([k, label, n]) => (
          <button
            key={k}
            onClick={() => setBook(k)}
            className={`whitespace-nowrap px-4 py-2.5 text-[13px] font-semibold border-b-2 cursor-pointer bg-transparent ${book === k ? 'border-[#EAB308] text-gray-800' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
          >
            {label} ({n})
          </button>
        ))}
      </div>

      {book === 'installs' ? <InstallOrdersList orders={extras.installs} loading={extras.loading} attribution={(resolved.name || 'BM') + ' (BM)'} /> : null}
      {book === 'wallpaper' ? <WallpaperOrdersList orders={extras.wallpapers} loading={extras.loading} /> : null}

      {book === 'audits' ? <>
      <ConversionStrip
        total={orders.length}
        stalls={stalls}
        active={stall}
        onPick={setStall}
        loading={dealsLoading && !deals}
        deals={deals}
      />

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
              {k === 'all' ? 'All' : STATUS[k].l} ({k === 'all' ? orders.length : counts[k]})
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        {loading ? (
          <div className="flex justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[#EAB308]" /></div>
        ) : list.length ? list.map((o) => {
          const st = STATUS[o.status] || { l: o.status, c: 'bg-gray-100 text-gray-600' };
          return (
            <div key={o.pi} onClick={() => setOpenPi(o.pi)} className="flex cursor-pointer items-start gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 hover:bg-gray-50">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold text-gray-900">{o.name || '—'}</div>
                <div className="text-[12px] text-gray-400">{o.pi} · {o.phone || '—'}{o.date ? ' · ' + fmtDateA(o.date) : ''}</div>
                <FunnelRowChip f={funnels.get(o.id)} />
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.c}`}>{st.l}</span>
            </div>
          );
        }) : (
          <div className="py-12 text-center text-[13px] text-gray-400">
            <div className="mb-2 text-2xl">📭</div>
            {orders.length ? 'No orders match your filters.' : 'No site audits are attributed to this person yet — an order links here when its BM field matches their name (or their contact number).'}
          </div>
        )}
      </div>

      {openOrder ? <BmOrderDrawer order={openOrder} bm={resolved} funnel={funnels.get(openOrder.id)} onRecheck={() => recheckDeals(openOrder.phone)} onClose={() => { setOpenPi(null); load(); }} /> : null}
      </> : null}
    </div>
  );
}
