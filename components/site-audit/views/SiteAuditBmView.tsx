'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuditRoomCard } from '../ui/AuditRoomViews';
import RoomSkuEditor, { auditRoomSkuSaver } from '../ui/RoomSkuEditor';
import LinkInstallSection from '../ui/LinkInstallSection';
import { MD_JOURNEY_STAGES, categoryFor, journeyStage, type JourneyEntry } from '../data/auditRegistry';
import { bmPhoneOfOrder, fmtDateA, fmtLog, phoneKey, sbGet, sbPatch } from '../siteAuditShared';
import { InstallOrdersList, WallpaperOrdersList, useOwnedExtras, type OwnedInstall } from './ownedOrders';
import { DrawerShell, KV, Sec } from '../ui/drawerUi';
import {
  FUNNEL_PHONE_CAP, FUNNEL_STEPS, forgetDeals, funnelChip, funnelFor, loadDealsForPhones,
  type DealsResult, type Funnel, type FunnelStepKey,
} from '../data/conversionFunnel';
import type { WpRow } from '../coe-ops/wpTrack';
import { fetchUsers } from '@/lib/mockApi';

export const AUDIT_COLS = 'id,pi,po,skus,bm,bm_email,customer_name,phone,addr,status,service,slot,date,auditor_name,log,created_at,bm_journey,coe_track';

export const STATUS: Record<string, { l: string; c: string }> = {
  slot_reserved: { l: 'Pre-booked (Store)', c: 'bg-sky-100 text-sky-800' },
  slot_converted: { l: 'Pre-booking Fulfilled', c: 'bg-green-100 text-green-700' },
  pending: { l: 'Pending', c: 'bg-gray-100 text-gray-600' },
  created: { l: 'Service Created', c: 'bg-sky-100 text-sky-700' },
  call_na: { l: 'Call not picked', c: 'bg-red-100 text-red-700' },
  scheduled: { l: 'Site Audit Scheduled', c: 'bg-sky-100 text-sky-700' },
  assigned: { l: 'Site Auditor Assigned', c: 'bg-purple-100 text-purple-700' },
  callpending: { l: 'Call Pending (Auditor)', c: 'bg-purple-100 text-purple-700' },
  reschedule: { l: 'To Reschedule', c: 'bg-red-100 text-red-700' },
  onway: { l: 'On The Way', c: 'bg-amber-100 text-amber-700' },
  atsite: { l: 'At Site', c: 'bg-amber-100 text-amber-700' },
  completed: { l: 'Site Audit Completed', c: 'bg-green-100 text-green-700' },
};

export type BmProfile = { id?: string | number; name: string; email?: string; contact?: string; role?: string; aliases?: string[] };

type Order = {
  id: string; pi: string; po: string[]; bm: string; name: string; phone: string; addr: string;
  status: string; slot: string | null; date: string | null; auditorName: string | null; log: any[];
  createdAt: string | null;

  journey: JourneyEntry[];
  coePlaced: { at: string; ref?: string } | null;
};

function norm(s?: string | null) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function orderBelongsToBm(row: { bm?: string | null; bm_email?: string | null }, bm: BmProfile): boolean {
  const mine = phoneKey(bm.contact);
  const theirs = bmPhoneOfOrder(row);
  if (mine && theirs) return mine === theirs;
  if (row.bm_email) return !!bm.email && norm(row.bm_email) === norm(bm.email);
  const bmText = norm(row.bm);
  if (!bmText) return false;
  return bmNames(bm).has(bmText);
}

export function isPreBooking(row: { status?: string | null }): boolean {
  return row.status === 'slot_reserved' || row.status === 'slot_converted';
}

export function dropSupersededPreBookings<T extends { pi?: string | null; po?: string | null; status?: string | null }>(rows: T[]): T[] {
  const realPis = new Set<string>();
  for (const r of rows) {
    if (isPreBooking(r) || r.status === 'deleted') continue;
    const pi = norm(r.pi);
    if (pi) realPis.add(pi);
  }
  return rows.filter((r) => {
    if (!isPreBooking(r)) return true;
    if (r.status === 'slot_converted') return false;
    return !String(r.po || '').split(',').map(norm).some((enq) => enq && realPis.has(enq));
  });
}

export function bmNames(bm: BmProfile): Set<string> {
  const out = new Set<string>();
  for (const n of [bm.name, ...(bm.aliases || [])]) {
    const v = norm(n);
    if (v) out.add(v);
  }
  return out;
}

function auditAnchor(o: Order): string | null {
  return o.date || (o.createdAt ? String(o.createdAt).slice(0, 10) : null);
}

function buildFunnels(
  orders: Order[],
  deals: DealsResult | null,
  installs: OwnedInstall[],
  wallpapers: WpRow[],
): Map<string, Funnel> {
  const installByPhone = new Map<string, OwnedInstall[]>();
  for (const i of installs) {
    const k = phoneKey(i.phone);
    if (!k) continue;
    const list = installByPhone.get(k);
    if (list) list.push(i); else installByPhone.set(k, [i]);
  }
  const wpByPhone = new Map<string, WpRow[]>();
  for (const w of wallpapers) {
    const k = phoneKey(w.phone);
    if (!k) continue;
    const list = wpByPhone.get(k);
    if (list) list.push(w); else wpByPhone.set(k, [w]);
  }

  const out = new Map<string, Funnel>();
  for (const o of orders) {
    const key = phoneKey(o.phone);
    const anchor = auditAnchor(o);
    const since = (d: string | null | undefined) => !anchor || (!!d && String(d).slice(0, 10) >= anchor);

    const candidates = (installByPhone.get(key) || []).filter((i) => since(i.createdAt));

    const install = candidates.find((i) => i.status === 'completed')
      || candidates.slice().sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))[0]
      || null;
    const wpRun = (wpByPhone.get(key) || []).find((w) => since(w.order_placed_at || w.created_at)) || null;

    const journeyPlaced = o.journey.filter((e) => e.stage === 'order_placed')
      .sort((a, b) => String(a.ts).localeCompare(String(b.ts)))[0] || null;
    const declared = o.coePlaced || (journeyPlaced ? { at: journeyPlaced.ts, ref: journeyPlaced.refId || '' } : null);

    out.set(o.id, funnelFor({
      auditDate: anchor,
      auditCompleted: o.status === 'completed',
      auditCompletedAt: o.date,

      deals: key ? (deals ? deals.byPhone.get(key) ?? null : null) : null,
      install: install ? { pi: install.pi, createdAt: install.createdAt, status: install.status } : null,
      wpRun: wpRun ? { pi: wpRun.pi || wpRun.md_id || '', placedAt: wpRun.order_placed_at || wpRun.created_at || null } : null,
      declaredOrderAt: declared?.at || null,
      declaredOrderRef: declared?.ref || '',
    }));
  }
  return out;
}

function stallCounts(funnels: Map<string, Funnel>): { lost: number; byStep: Record<string, number>; done: number; unknown: number } {
  const byStep: Record<string, number> = {};
  let lost = 0;
  let done = 0;
  let unknown = 0;
  for (const f of funnels.values()) {
    if (f.lost) { lost++; continue; }

    if (f.unknownFrom) { unknown++; continue; }
    if (!f.stalledAt) { done++; continue; }
    byStep[f.stalledAt.k] = (byStep[f.stalledAt.k] || 0) + 1;
  }
  return { lost, byStep, done, unknown };
}

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

function BmOrderDrawer({ order: o, bm, funnel, onRecheck, onClose }: { order: Order; bm: BmProfile; funnel?: Funnel; onRecheck: () => void; onClose: () => void }) {
  const [ticked, setTicked] = useState<any>(null);
  const [jcLoading, setJcLoading] = useState(o.status === 'completed');
  const [journey, setJourney] = useState<JourneyEntry[] | null>(null);
  const [msg, setMsg] = useState('');

  const loadCard = useCallback(async () => {
    const rows = await sbGet('audit_orders?id=eq.' + o.id + '&select=audit_ticked');
    setTicked(Array.isArray(rows) && rows[0] ? rows[0].audit_ticked : null);
    setJcLoading(false);
  }, [o.id]);
  const loadJourney = useCallback(async () => {
    const rows = await sbGet('audit_orders?id=eq.' + o.id + '&select=bm_journey');
    setJourney(Array.isArray(rows) && rows[0] && Array.isArray(rows[0].bm_journey) ? rows[0].bm_journey : []);
  }, [o.id]);

  useEffect(() => {
    if (o.status === 'completed') loadCard();
    loadJourney();
  }, [o.status, loadCard, loadJourney]);

  const rooms = (ticked && Array.isArray(ticked.rooms) && ticked.rooms) || [];
  const isDraft = ticked && ticked.draft && !(ticked.sign && !ticked.sign.draft);

  return (
    <DrawerShell
      title={o.name || '—'}
      subtitle={<>{o.pi} · {(STATUS[o.status] || { l: o.status }).l}</>}
      onClose={onClose}
      footer={msg ? <div className="border-t border-gray-100 bg-green-50 px-5 py-2 text-[12.5px] font-semibold text-green-700">{msg}</div> : null}
    >
      <Sec title="Customer">
        <KV k="Phone" v={<a className="text-blue-600" href={'tel:' + o.phone.replace(/\s/g, '')}>{o.phone || '—'}</a>} />
        <KV k="Address" v={o.addr ? <a className="text-blue-600" href={'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(o.addr)} target="_blank" rel="noopener noreferrer">{o.addr}</a> : '—'} />
        <KV k="Date" v={o.date ? fmtDateA(o.date) : '—'} />
        <KV k="Auditor" v={o.auditorName || '—'} />
        <KV k="Enquiry ID" v={(o.po && o.po[0]) || '—'} />
      </Sec>

      <Sec title="Timeline">
        {o.log && o.log.length ? o.log.slice().reverse().map((l: any, i: number) => (
          <div key={i} className="border-b border-gray-100 py-2 last:border-b-0">
            <div className="text-[13px] font-semibold text-gray-900">{l.who ? <b className="text-[#1F3A5F]">{l.who}</b> : null}{l.who ? ' · ' : ''}{l.t || ''}</div>
            <div className="mt-0.5 text-[11.5px] text-gray-400">{fmtLog(l.d)}{l.by ? ' · ' + (l.by === 'auto' ? 'system' : l.by) : ''}</div>
          </div>
        )) : <div className="text-[12.5px] text-gray-400">No activity logged yet.</div>}
      </Sec>

      <Sec title="Job Card">
        {o.status !== 'completed' ? <div className="text-[12.5px] text-gray-400">Not available yet — the site audit has not been completed.</div>
          : jcLoading ? <div className="text-[12.5px] text-gray-400">Loading…</div>
            : !rooms.length ? <div className="text-[12.5px] text-gray-400">No job card details recorded.</div>
              : (
                <>
                  {isDraft
                    ? <div className="mb-2.5 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] font-bold text-amber-800">⚠️ Job card is still a draft — not yet signed off by the client.</div>
                    : ticked.sign ? <div className="mb-2.5 rounded-lg bg-green-50 px-3 py-2 text-[12.5px] font-bold text-green-700">✓ Signed off by the client{ticked.sign.name ? ' — ' + ticked.sign.name : ''}</div> : null}
                  {rooms.map((r: any, i: number) => (
                    <Fragment key={i}>
                      <AuditRoomCard room={r} index={i} />

                      <RoomSkuEditor
                        room={r}
                        save={auditRoomSkuSaver(String(o.id), i, (bm.name || 'BM') + ' (BM)')}
                        onSaved={() => { setMsg('Room SKU saved'); loadCard(); }}
                      />
                      <MaterialSection room={r} roomIdx={i} orderId={o.id} bm={bm} onSaved={(m) => { setMsg(m); loadCard(); }} />
                    </Fragment>
                  ))}
                </>
              )}
      </Sec>

      <Sec title="Linked Installation">
        <LinkInstallSection
          auditPi={o.pi}
          auditPhone={o.phone}
          attribution={(bm.name || 'BM') + ' (BM)'}
          onMsg={setMsg}
        />
      </Sec>

      <Sec title="Did it convert?">
        <ConversionLadder f={funnel} phone={o.phone} onRecheck={onRecheck} />
      </Sec>

      <Sec title="Customer Journey">
        <JourneyTimeline entries={journey} />
        <JourneyAddForm entries={journey || []} orderId={o.id} bm={bm} onSaved={(m) => { setMsg(m); loadJourney(); }} />
      </Sec>
    </DrawerShell>
  );
}

function MaterialSection({ room, roomIdx, orderId, bm, onSaved }: { room: any; roomIdx: number; orderId: string; bm: BmProfile; onSaved: (m: string) => void }) {
  if (!(room?.v >= 2) || !Array.isArray(room.segments) || !room.segments.length) return null;
  const cat = categoryFor(room.category);
  const multi = !!(cat.segment && cat.segment.model === 'multi');
  return (
    <div className="mb-3.5 rounded-lg border border-dashed border-blue-400 bg-blue-50/40 p-2.5">
      <div className="mb-2 text-[12px] font-extrabold text-[#1F3A5F]">🎨 Material selection</div>
      {room.segments.map((s: any, si: number) => (
        <MaterialCard
          key={si}
          label={multi ? (cat.segment!.segLabel || 'Segment') + ' ' + (si + 1) + (s.facing ? ' — ' + s.facing : '') : (cat.segment?.segLabel || 'Area')}
          seg={s} roomIdx={roomIdx} segIdx={si} orderId={orderId} bm={bm} onSaved={onSaved}
        />
      ))}
    </div>
  );
}

function MaterialCard({ label, seg, roomIdx, segIdx, orderId, bm, onSaved }: {
  label: string; seg: any; roomIdx: number; segIdx: number; orderId: string; bm: BmProfile; onSaved: (m: string) => void;
}) {
  const [editing, setEditing] = useState(!seg.material);
  const [sku, setSku] = useState(seg.material?.sku || '');
  const [name, setName] = useState(seg.material?.productName || '');
  const [url, setUrl] = useState(seg.material?.url || '');
  const [image, setImage] = useState<string | null>(seg.material?.image || null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);

  if (!editing && seg.material) {
    return (
      <div className="mb-1.5 rounded-lg border border-gray-200 bg-white p-2">
        <div className="mb-1.5 text-[11.5px] font-bold text-[#1F3A5F]">{label}</div>
        <div className="flex items-center gap-2">
          {seg.material.image ? <img src={seg.material.image} alt="" className="h-11 w-11 shrink-0 rounded-md border border-gray-200 object-cover" /> : null}
          <div className="min-w-0 flex-1 text-[12px]">
            <div className="font-bold">{seg.material.productName || seg.material.sku || '—'}</div>
            {seg.material.sku ? <div className="text-[11px] text-gray-400">SKU: {seg.material.sku}</div> : null}
          </div>
          <button className="shrink-0 rounded-md bg-gray-100 px-3 py-1.5 text-[12px] font-bold text-[#1F3A5F]" onClick={() => setEditing(true)}>Edit</button>
        </div>
      </div>
    );
  }

  async function fetchImage() {
    setErr('');
    if (!url.trim()) { setErr('Paste a materialdepot.com product URL first.'); return; }
    setFetching(true);
    try {
      const r = await fetch('/api/site-audit/fetch-og-image?url=' + encodeURIComponent(url.trim()));
      const j = await r.json();
      if (j.image) setImage(j.image);
      else setErr(j.error ? 'Could not fetch an image from that page.' : 'No preview image found on that page.');
    } catch {
      setErr('Could not reach the image fetcher — try again.');
    }
    setFetching(false);
  }

  async function save() {
    setErr('');
    if (!sku.trim() && !name.trim() && !url.trim()) { setErr('Enter at least a SKU, product name, or URL.'); return; }
    setBusy(true);
    try {
      const rows = await sbGet('audit_orders?id=eq.' + orderId + '&select=audit_ticked');
      const fresh = Array.isArray(rows) && rows[0] ? rows[0].audit_ticked : null;
      if (!fresh || !Array.isArray(fresh.rooms)) throw new Error('Could not load the latest job card — reload and try again.');
      const room = fresh.rooms[roomIdx];
      if (!room || !(room.v >= 2) || !Array.isArray(room.segments) || !room.segments[segIdx]) throw new Error('That room/segment could not be found — reload and try again.');
      room.segments[segIdx].material = {
        sku: sku.trim(), productName: name.trim(), url: url.trim(), image: image || null,
        by: { email: bm.email || '', name: bm.name }, at: new Date().toISOString(),
      };
      await sbPatch('audit_orders', orderId, { audit_ticked: fresh });
      setEditing(false);
      onSaved('Material saved for ' + label);
    } catch (e: any) {
      setErr('Save failed — ' + (e?.message || 'try again'));
    }
    setBusy(false);
  }

  return (
    <div className="mb-1.5 rounded-lg border border-gray-200 bg-white p-2">
      <div className="mb-1.5 text-[11.5px] font-bold text-[#1F3A5F]">{label}</div>
      <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU code" className="mb-1.5 w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]" />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Product name" className="mb-1.5 w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]" />
      <div className="mb-1.5 flex gap-1.5">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="materialdepot.com product URL" className="flex-1 rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]" />
        <button disabled={fetching} onClick={fetchImage} className="shrink-0 whitespace-nowrap rounded-md bg-[#1F3A5F] px-2.5 py-1.5 text-[12px] font-bold text-white disabled:opacity-60">{fetching ? 'Fetching…' : 'Fetch image'}</button>
      </div>
      <div className="mb-1.5">{image ? <img src={image} alt="" className="h-11 w-11 rounded-md border border-gray-200 object-cover" /> : <div className="text-[11px] text-gray-400">No image yet — paste a URL and click Fetch image.</div>}</div>
      <div className="flex gap-1.5">
        <button disabled={busy} onClick={save} className="rounded-md bg-green-700 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button>
        {seg.material ? <button onClick={() => setEditing(false)} className="rounded-md bg-gray-100 px-3 py-1.5 text-[12px] font-bold text-gray-500">Cancel</button> : null}
      </div>
      {err ? <div className="mt-1 text-[11.5px] text-red-600">{err}</div> : null}
    </div>
  );
}

function ConversionStrip({ total, stalls, active, onPick, loading, deals }: {
  total: number;
  stalls: ReturnType<typeof stallCounts>;
  active: 'all' | 'lost' | 'unknown' | FunnelStepKey;
  onPick: (v: 'all' | 'lost' | 'unknown' | FunnelStepKey) => void;
  loading: boolean;
  deals: DealsResult | null;
}) {
  if (!total) return null;

  const tiles = FUNNEL_STEPS.filter((st) => stalls.byStep[st.k]);

  return (
    <div className="mb-3">
      <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500">Where the client stopped</span>
        <span className="text-[11.5px] text-gray-400">
          After the audit: cart → quotation → order → installation. Cart, quotation and order come from this
          client&apos;s own CRM deals, raised on or after the audit.
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => onPick('all')}
          className={active === 'all' ? 'rounded-full bg-[#1A1A1A] px-3 py-1.5 text-xs font-semibold text-white' : 'rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600'}
        >
          All ({total})
        </button>
        {tiles.map((st) => (
          <button
            key={st.k}
            title={st.hint}
            onClick={() => onPick(st.k)}
            className={active === st.k ? 'rounded-full bg-[#1A1A1A] px-3 py-1.5 text-xs font-semibold text-white' : 'rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600'}
          >
            Waiting on {st.short.toLowerCase()} ({stalls.byStep[st.k]})
          </button>
        ))}
        {stalls.lost ? (
          <button
            onClick={() => onPick('lost')}
            className={active === 'lost' ? 'rounded-full bg-[#1A1A1A] px-3 py-1.5 text-xs font-semibold text-white' : 'rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700'}
          >
            Lost / cancelled ({stalls.lost})
          </button>
        ) : null}
        {stalls.unknown ? (
          <button
            title="The CRM deal pipeline couldn't be read for these clients, so cart / quotation / order are unknown — not absent."
            onClick={() => onPick('unknown')}
            className={active === 'unknown' ? 'rounded-full bg-[#1A1A1A] px-3 py-1.5 text-xs font-semibold text-white' : 'rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-500'}
          >
            Pipeline unknown ({stalls.unknown})
          </button>
        ) : null}
        {stalls.done ? (
          <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700">
            Installed ({stalls.done})
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="mt-1.5 text-[11.5px] text-gray-400">Reading the CRM pipeline for these clients…</div>
      ) : null}

      {deals?.allFailed ? (
        <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800">
          Couldn&apos;t read the CRM deal pipeline, so cart / quotation / order are unknown below — not absent. The
          audit and installation steps are unaffected.
        </div>
      ) : null}
      {deals?.skipped ? (
        <div className="mt-1.5 text-[11.5px] text-amber-700">
          Cart and quotation were looked up for the first {FUNNEL_PHONE_CAP} clients only — {deals.skipped} more are
          shown with audit and installation steps alone. Filter or search to check them.
        </div>
      ) : null}
    </div>
  );
}

function FunnelRowChip({ f }: { f?: Funnel }) {
  if (!f) return null;
  const chip = funnelChip(f);
  return (
    <div className="mt-1">
      <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${chip.badge}`}>{chip.label}</span>
    </div>
  );
}

function ConversionLadder({ f, phone, onRecheck }: { f?: Funnel; phone: string; onRecheck: () => void }) {
  if (!f) return <div className="text-[12.5px] text-gray-400">Working out where this client got to…</div>;

  return (
    <>
      {f.lost ? (
        <div className="mb-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
          <b>Marked {f.lost.status.toLowerCase()} in the CRM{f.lost.reason ? ' — ' + f.lost.reason : ''}.</b>
          {f.lost.at ? <span className="text-red-600"> ({fmtDateA(String(f.lost.at).slice(0, 10))})</span> : null}
        </div>
      ) : f.unknownFrom ? (
        <div className="mb-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[12.5px] text-gray-600">
          <b>Can&apos;t tell yet — {f.unknownFrom.label.toLowerCase()} couldn&apos;t be checked.</b> This is a gap in the
          data, not a client who went quiet.
        </div>
      ) : f.stalledAt ? (
        <div className="mb-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
          <b>Waiting on: {f.stalledAt.label}.</b> {f.stalledAt.hint}
        </div>
      ) : (
        <div className="mb-2.5 rounded-lg bg-green-50 px-3 py-2 text-[12.5px] font-bold text-green-700">
          ✓ Audit → order → installation, all the way through.
        </div>
      )}

      {f.steps.map((st) => (
        <div key={st.k} className="flex gap-2.5 py-1.5">
          {st.state === 'done' ? (
            <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[#1f7a3f] text-[9px] font-extrabold text-white">✓</span>
          ) : st.state === 'implied' ? (
            <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 border-[#1f7a3f] text-[9px] font-extrabold text-[#1f7a3f]">✓</span>
          ) : st.state === 'unknown' ? (
            <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 border-gray-300 text-[9px] font-extrabold text-gray-400">?</span>
          ) : (
            <span className={`h-4 w-4 shrink-0 rounded-full border-2 ${f.stalledAt?.k === st.k ? 'border-amber-500' : 'border-gray-200'}`} />
          )}
          <div className="min-w-0 flex-1">
            <div className={`text-[12.5px] ${st.state !== 'pending' || f.stalledAt?.k === st.k ? 'font-bold' : ''} ${st.state !== 'pending' ? 'text-gray-900' : f.stalledAt?.k === st.k ? 'text-[#1F3A5F]' : 'text-gray-400'}`}>
              {st.label}
            </div>
            {st.at ? <div className="text-[11px] text-gray-400">{fmtDateA(String(st.at).slice(0, 10))}{st.ref ? ' · ' + st.ref : ''}</div> : null}
            {st.detail ? <div className="mt-0.5 text-[11.5px] text-gray-500">{st.detail}</div> : null}
          </div>
        </div>
      ))}

      {f.value ? (
        <div className="mt-2 text-[12px] text-gray-500">Cart value across these deals: <b className="text-gray-900">₹{f.value.toLocaleString('en-IN')}</b></div>
      ) : null}
      {f.priorDeals ? (
        <div className="mt-1.5 border-l-2 border-gray-200 pl-2 text-[11.5px] text-gray-400">
          {f.priorDeals} earlier {f.priorDeals === 1 ? 'enquiry' : 'enquiries'} on {phone || 'this number'}, raised before
          this audit. Not counted — an older order can&apos;t be this audit&apos;s conversion.
        </div>
      ) : null}
      {!f.pipelineKnown ? (
        <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800">
          The CRM deal pipeline couldn&apos;t be read for this client, so cart / quotation / order above are unknown
          rather than absent.
        </div>
      ) : null}
      <button className="mt-2 text-[12px] font-semibold text-blue-700" onClick={onRecheck}>
        Re-check the CRM pipeline for this client
      </button>
    </>
  );
}

function JourneyTimeline({ entries }: { entries: JourneyEntry[] | null }) {
  if (entries === null) return <div className="text-[12.5px] text-gray-400">Loading…</div>;
  if (!entries.length) return <div className="text-[12.5px] text-gray-400">No journey entries logged yet.</div>;
  const sorted = entries.slice().sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  return (
    <>
      {sorted.map((e) => {
        const st = journeyStage(e.stage);
        return (
          <div key={e.id} className="border-b border-gray-100 py-2 last:border-b-0">
            <div className="text-[13px] font-bold">
              {st.icon} {st.label}
              {e.round ? <span className="text-gray-400"> · Round {e.round}</span> : null}
              {e.decision === 'approved' ? <span className="text-green-700"> ✓ Approved</span> : e.decision === 'changes_requested' ? <span className="text-red-600"> ✎ Changes requested</span> : null}
            </div>
            {e.note ? <div className="mt-0.5 text-[12px]">{e.note}</div> : null}
            {e.refId ? <div className="mt-0.5 text-[11.5px] text-gray-400">Ref: {e.refId}</div> : null}
            <div className="mt-0.5 text-[11.5px] text-gray-400">{e.by?.name ? e.by.name + ' · ' : ''}{fmtLog(e.ts)}{e.by?.role ? ' · ' + e.by.role : ''}</div>
          </div>
        );
      })}
    </>
  );
}

function JourneyAddForm({ entries, orderId, bm, onSaved }: { entries: JourneyEntry[]; orderId: string; bm: BmProfile; onSaved: (m: string) => void }) {
  const [stage, setStage] = useState(MD_JOURNEY_STAGES[0].k);
  const cfg = journeyStage(stage);
  const priorChanges = entries.filter((e) => e.decision === 'changes_requested').length;
  const [round, setRound] = useState('');
  const [decision, setDecision] = useState('');
  const [refId, setRefId] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    setErr(''); setBusy(true);
    try {
      const rows = await sbGet('audit_orders?id=eq.' + orderId + '&select=bm_journey');
      const fresh: JourneyEntry[] = Array.isArray(rows) && rows[0] && Array.isArray(rows[0].bm_journey) ? rows[0].bm_journey : [];
      fresh.push({
        id: 'j_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        ts: new Date().toISOString(),
        stage,
        round: cfg.hasRound ? parseInt(round || String(priorChanges + 1), 10) || null : null,
        decision: (cfg.hasDecision ? (decision || null) : null) as JourneyEntry['decision'],
        note: note.trim(), refId: cfg.hasRef ? refId.trim() : '',
        by: { email: bm.email || '', name: bm.name, role: 'bm' },
      });
      await sbPatch('audit_orders', orderId, { bm_journey: fresh });
      setNote(''); setRefId(''); setDecision(''); setRound('');
      onSaved('Journey entry added');
    } catch (e: any) {
      setErr('Failed — ' + (e?.message || 'try again'));
    }
    setBusy(false);
  }

  return (
    <div className="mt-2.5 rounded-lg border border-gray-200 bg-gray-50 p-2.5">
      <select value={stage} onChange={(e) => setStage(e.target.value)} className="mb-1.5 w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]">
        {MD_JOURNEY_STAGES.map((s) => <option key={s.k} value={s.k}>{s.icon} {s.label}</option>)}
      </select>
      {cfg.hasRound ? <input type="number" min={1} value={round} onChange={(e) => setRound(e.target.value)} placeholder={'Round # (default ' + (priorChanges + 1) + ')'} className="mb-1.5 w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]" /> : null}
      {cfg.hasDecision ? (
        <select value={decision} onChange={(e) => setDecision(e.target.value)} className="mb-1.5 w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]">
          <option value="">— Client decision —</option>
          <option value="approved">Approved</option>
          <option value="changes_requested">Changes requested</option>
        </select>
      ) : null}
      {cfg.hasRef ? <input value={refId} onChange={(e) => setRefId(e.target.value)} placeholder={cfg.refLabel || 'Reference'} className="mb-1.5 w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]" /> : null}
      <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="mb-1.5 min-h-[50px] w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]" />
      {err ? <div className="mb-1 text-[11.5px] text-red-600">{err}</div> : null}
      <button disabled={busy} onClick={add} className="rounded-md bg-green-700 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-60">{busy ? 'Saving…' : '+ Add entry'}</button>
    </div>
  );
}
