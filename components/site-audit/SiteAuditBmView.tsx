'use client';

/* Business Manager dashboard — port of material-depot-site's BM_Dashboard.html.

   Every site audit linked to a BM, with the completed job card, a per-segment
   material selection the BM records against it, and the manual downstream
   "customer journey" timeline (order placed → renders → approval → printing →
   delivery → installed) stored in audit_orders.bm_journey.

   IDENTITY STARTS FROM THE CRM'S OWN USER TABLE (the Django backend's
   UserOrganisation, via lib/mockApi's loginWithPhone / fetchUsers), so nobody
   needs a field-app profile just to appear in the picker. Order ownership,
   though, prefers `audit_orders.bm_email` — see `orderBelongsToBm`:

   - The logged-in CRM user IS the BM; their name and phone come from the
     session. The session carries no email, so it's looked up once from the
     `profiles` row sharing that phone number.
   - Rows that carry a `bm_email` are decided by it alone. Rows that don't
     (most legacy rows) fall back to the free-text `bm` column — matched on
     contact digits, then on the name, which originates from this same backend
     user list (the Kylas PO payload's `bm.name`).
   - Legacy rows get linked in bulk from Site Audit › Users ("Link N orders"),
     which only ever links unambiguous exact name matches. */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuditRoomCard } from './AuditRoomViews';
import RoomSkuEditor, { auditRoomSkuSaver } from './RoomSkuEditor';
import LinkInstallSection from './LinkInstallSection';
import { MD_JOURNEY_STAGES, categoryFor, journeyStage, type JourneyEntry } from './auditRegistry';
import { fmtDateA, fmtLog, phoneKey, sbGet, sbPatch } from './siteAuditShared';
import { InstallOrdersList, WallpaperOrdersList, useOwnedExtras, type OwnedInstall } from './ownedOrders';
import { DrawerShell, KV, Sec } from './drawerUi';
import {
  FUNNEL_PHONE_CAP, FUNNEL_STEPS, forgetDeals, funnelChip, funnelFor, loadDealsForPhones,
  type DealsResult, type Funnel, type FunnelStepKey,
} from './conversionFunnel';
import type { WpRow } from './coe-ops/wpTrack';
import { fetchUsers } from '@/lib/mockApi';

/* `bm_journey` and `coe_track` ride along so the conversion funnel can be built
   for the whole list in one pass — a manual "order placed" tick from either the
   BM or the COE outranks anything derived. They add ~16 KB to a ~2 MB payload
   (`log` and `skus`, already here, are almost all of it), so unlike
   SiteAuditBranchManagerView's deliberately narrow ROLLUP_AUDIT_COLS this list
   can afford them. */
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

/* `aliases` are ADDITIONAL exact names for the same person, never fuzzy
   variants. They exist because the same human is recorded under two
   authoritative names: the field-app profile's `name` and the CRM's own
   `f_name + l_name`. The CRM sync created many profiles from a short display
   name ("Anubhab", "Pranab") while order rows carry the CRM's full name
   ("Anubhab Sarkar", "Pranab Das"), so matching on the profile name alone
   loses those orders. Both names come from records already tied to this
   person by an exact phone match, so trusting either is still exact matching
   — nothing here compares partial or similar strings. */
export type BmProfile = { id?: string | number; name: string; email?: string; contact?: string; role?: string; aliases?: string[] };

type Order = {
  id: string; pi: string; po: string[]; bm: string; name: string; phone: string; addr: string;
  status: string; slot: string | null; date: string | null; auditorName: string | null; log: any[];
  createdAt: string | null;
  /* Only the "order placed" ticks are read here — the drawer re-fetches both
     blobs in full, because it can write to them. */
  journey: JourneyEntry[];
  coePlaced: { at: string; ref?: string } | null;
};

function norm(s?: string | null) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/* `bm_email` is the authoritative link, so when an order carries one it DECIDES
   ownership on its own — a name match must not override it, or two BMs sharing
   a first name would each see the other's customers. Only rows with no link
   yet fall back to the free-text `bm` (its contact digits, then its name).
   Deliberately exact-after-normalisation, never fuzzy, for the same reason. */
export function orderBelongsToBm(row: { bm?: string | null; bm_email?: string | null }, bm: BmProfile): boolean {
  if (row.bm_email) return !!bm.email && norm(row.bm_email) === norm(bm.email);
  const key = phoneKey(bm.contact);
  if (key && phoneKey(row.bm) === key) return true;
  const bmText = norm(row.bm);
  if (!bmText) return false;
  return bmNames(bm).has(bmText);
}

/* A store pre-booking and the site audit it becomes are two separate
   audit_orders rows, not one row changing state: the pre-booking is created by
   the store booking app under its own `SRES-<STORE>-…` PI and carries the
   enquiry ID it was booked against in `po`, and the Kylas service order later
   arrives as its own row whose `pi` IS that enquiry ID. A BM's list therefore
   showed the same customer twice — the slot that was held, and the audit that
   actually got scheduled off it — which reads as two jobs.

   The pre-booking is only the previous step of the same workflow, so it drops
   out once the audit exists. "Exists" is either of:

   - the linked order is really there — the pre-booking's enquiry ID matches a
     non-pre-booking row's `pi` exactly. Same `po`→`pi` link the store
     calendar's slot-availability check already absorbs bookings by, and it
     covers pre-bookings nobody remembered to mark fulfilled;
   - status `slot_converted` — a service manager confirmed in the drawer that
     the service order was created, so the audit exists even when its row is
     attributed to someone else and never reaches this list.

   Matched on the enquiry ID alone, never on customer name or phone: both are
   free text on the reservation form (the phone is often the store's own), so
   matching on them would collapse two different customers into one. A
   pre-booking still waiting on its service order stays visible — it is the
   only record that the slot was ever held.

   Takes the RAW fetched rows, before they are narrowed to one BM: whether the
   audit was created is a question about the whole table, and the audit row may
   carry a different (or missing) BM link than the pre-booking it came from. */
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

/* Every exact name this person is known by, normalised. */
export function bmNames(bm: BmProfile): Set<string> {
  const out = new Set<string>();
  for (const n of [bm.name, ...(bm.aliases || [])]) {
    const v = norm(n);
    if (v) out.add(v);
  }
  return out;
}

/* ── Conversion funnel plumbing ───────────────────────────────────────────
   Ties each audit to the downstream rows this dashboard has already loaded.
   Everything here matches on the client's exact phone digits AND on the audit
   day: a client can have several audits and several orders, so "this number
   ever ordered" would mark a fresh audit converted off an unrelated older one
   — the trap coe-ops/shared.ts's `orderPlacedFor` documents, and the reason
   this list agrees with the COE's queue instead of contradicting it. */

/* The day the audit happened: `date` is the visit date, falling back to when
   the row was created for the legacy orders that never got one. Same rule as
   coe-ops' `anchorDate`. */
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
    /* A completed installation is the more informative of two candidates — it
       carries the end of the ladder — otherwise take the earliest, which is the
       one this audit led to. */
    const install = candidates.find((i) => i.status === 'completed')
      || candidates.slice().sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))[0]
      || null;
    const wpRun = (wpByPhone.get(key) || []).find((w) => since(w.order_placed_at || w.created_at)) || null;

    /* A manual tick beats anything derived, and either of the two people who
       can leave one counts. */
    const journeyPlaced = o.journey.filter((e) => e.stage === 'order_placed')
      .sort((a, b) => String(a.ts).localeCompare(String(b.ts)))[0] || null;
    const declared = o.coePlaced || (journeyPlaced ? { at: journeyPlaced.ts, ref: journeyPlaced.refId || '' } : null);

    out.set(o.id, funnelFor({
      auditDate: anchor,
      auditCompleted: o.status === 'completed',
      auditCompletedAt: o.date,
      /* `undefined` (a phone the cap skipped) and a failed request both mean
         "we don't know", which is not the same as an empty deal list. */
      deals: key ? (deals ? deals.byPhone.get(key) ?? null : null) : null,
      install: install ? { pi: install.pi, createdAt: install.createdAt, status: install.status } : null,
      wpRun: wpRun ? { pi: wpRun.pi || wpRun.md_id || '', placedAt: wpRun.order_placed_at || wpRun.created_at || null } : null,
      declaredOrderAt: declared?.at || null,
      declaredOrderRef: declared?.ref || '',
    }));
  }
  return out;
}

/* The strip above the list: how many of this BM's audits are sitting on each
   step. Counts a stall, not a "reached" — "12 audits reached cart" hides the
   nine that never got past it, which is the number worth acting on. */
function stallCounts(funnels: Map<string, Funnel>): { lost: number; byStep: Record<string, number>; done: number; unknown: number } {
  const byStep: Record<string, number> = {};
  let lost = 0;
  let done = 0;
  let unknown = 0;
  for (const f of funnels.values()) {
    if (f.lost) { lost++; continue; }
    /* Counted apart from every step: an unreadable pipeline is not a drop-off,
       and folding it into "waiting on cart" would turn one Django outage into a
       dashboard full of clients who look like they walked away. */
    if (f.unknownFrom) { unknown++; continue; }
    if (!f.stalledAt) { done++; continue; }
    byStep[f.stalledAt.k] = (byStep[f.stalledAt.k] || 0) + 1;
  }
  return { lost, byStep, done, unknown };
}

export default function SiteAuditBmView({ bm, me }: { bm?: BmProfile | null; me?: BmProfile | null }) {
  /* The acting BM: an explicitly-passed profile (Role Viewer / own dashboard)
     wins, otherwise it's simply the logged-in CRM user. */
  const [resolved, setResolved] = useState<BmProfile | null>(bm || me || null);
  const [bmList, setBmList] = useState<BmProfile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [openPi, setOpenPi] = useState<string | null>(null);
  /* A BM's order book is three tables, not one — see ownedOrders.tsx. */
  const [book, setBook] = useState<'audits' | 'installs' | 'wallpaper'>('audits');
  /* Which conversion step the list is narrowed to — 'all', a step key meaning
     "stalled here", or 'lost'. Separate from `filter` (the audit's own status):
     "audit completed" and "client never built a cart" are different questions,
     and the second is the one this dashboard exists to answer. */
  const [stall, setStall] = useState<'all' | 'lost' | 'unknown' | FunnelStepKey>('all');
  const [deals, setDeals] = useState<DealsResult | null>(null);
  const [dealsLoading, setDealsLoading] = useState(false);
  /* Bumped to re-ask Django about one client after a BM says they've just
     raised the cart — the deal cache is module-level and deliberately outlives
     this component, so nothing else would pick the change up. */
  const [dealsNonce, setDealsNonce] = useState(0);

  /* The "view another person's orders" picker is the CRM's own user roster
     (backend UserOrganisation), so nobody needs a field-app profile to appear
     here. Loaded lazily and best-effort — the view works without it. */
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

  /* The CRM session gives us a name + phone but never an email, and `bm_email`
     is now what decides ownership on linked rows — so fill the email in from
     the field-app profile that shares this phone number, once per person. A BM
     with no such profile simply keeps the name/phone fallback. */
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

  /* Fill in the CRM's own name for this person as an order-matching alias when
     the caller didn't supply one. A BM's own session passes it (SiteAuditOwnDashboard
     knows it from the CRM login), but Role Viewer's admin preview only has the
     field-app profile — so without this the preview matched on the profile name
     alone and showed a DIFFERENT, smaller order list than the person actually
     sees, which defeats the point of previewing. Same exact phone match the
     email lookup above uses; nothing here compares partial or similar strings. */
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
    /* Superseded pre-bookings are dropped against the WHOLE table, before the
       rows are narrowed to this BM — see dropSupersededPreBookings. */
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

  /* Installations and wallpaper runs for the same person. Called before the
     early return below so the hook order never changes between renders. */
  const people = useMemo(() => (resolved ? [resolved] : []), [resolved]);
  const extrasKey = resolved ? [resolved.email || '', phoneKey(resolved.contact), resolved.name, ...(resolved.aliases || [])].join('|') : '';
  const extras = useOwnedExtras(people, extrasKey);

  /* The CRM deal pipeline for every client in this list — one request per
     client phone, cached and capped inside loadDealsForPhones. Keyed on the set
     of phones rather than on `orders`, so the 30s order poll doesn't re-ask
     Django about clients whose deals are already known. Best-effort: a failure
     leaves the funnel reporting "unknown", never "no cart". */
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

/* ── Drawer: timeline, job card + material selection, customer journey ─── */
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
                      {/* The BM already writes into this same blob (material
                          selection below), so the room SKU the auditor left
                          blank is theirs to fill too — it's what prints on
                          the card they send the client. */}
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

/* ── Material selection (v2 rooms only) ───────────────────────────────────
   Legacy rooms have no `segments[]` to hang a per-segment material choice on,
   and are being phased out, so this section is deliberately v2-only. */
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

  /* Always re-fetch audit_ticked immediately before merging rather than
     trusting the copy this drawer loaded with — the field app autosaves the
     same blob, so a stale write here could clobber a concurrent one. */
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

/* ── Conversion funnel UI ─────────────────────────────────────────────────
   Three views of the same derivation: a strip that counts where this BM's
   audits are stuck, a chip on each row, and the full ladder in the drawer. */

function ConversionStrip({ total, stalls, active, onPick, loading, deals }: {
  total: number;
  stalls: ReturnType<typeof stallCounts>;
  active: 'all' | 'lost' | 'unknown' | FunnelStepKey;
  onPick: (v: 'all' | 'lost' | 'unknown' | FunnelStepKey) => void;
  loading: boolean;
  deals: DealsResult | null;
}) {
  if (!total) return null;
  /* Only the steps somebody is actually stuck on, so the strip doesn't carry
     five zeroes. `installed` is never a stall (it's the finish line) and is
     shown as the "converted" tile instead. */
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
      {/* Soft-gate-and-surface: say which half is missing rather than letting a
          dead pipeline read as "nobody built a cart". */}
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

/* The drawer's ladder. Every step says what proved it, because "cart created"
   with no evidence behind it is the kind of claim a BM will be asked to defend
   on a call. */
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

/* ── Journey ───────────────────────────────────────────────────────────── */
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

/* Appends to bm_journey. Same fresh-fetch-before-write pattern as the material
   save — BM, SM and Admin can all append to the same array. */
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
