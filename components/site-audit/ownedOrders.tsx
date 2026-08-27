'use client';

/* The installation and custom-wallpaper halves of "my orders".

   A BM's order book is three things, not one: the site audit (audit_orders),
   the installation that follows it (install_orders) and, when the wallpaper is
   printed to order, the custom-wallpaper production run (wp_production).
   SiteAuditBmView only ever loaded audit_orders, so BMs could see an audit was
   done and nothing about whether the material got installed. Both extra lists
   are READ-ONLY here — scheduling installs stays with the Service Manager and
   wallpaper production stays with the Category Ops Executive; this is purely
   "where has my customer's order got to".

   Each list opens a drawer, the same way the audit list always has, because a
   status pill answers "is it done" and a BM on a client call needs "what
   exactly is it waiting on, and since when". The drawers are read-only with two
   deliberate exceptions, both of them statements only a BM can make:
   declaring which site audit an installation came from, and (on the audit side)
   the reverse link.

   WHAT EACH DRAWER LOADS, AND WHY IT ISN'T IN THE LIST QUERY: `log` is jsonb
   averaging ~7 KB a row — on the install set that is megabytes per poll to
   render a timeline for one order at a time — and `service`/`skus` are only
   read once a drawer is open. Both lists poll every 30s, so anything drawer-only
   is fetched per order on open, the same split coe-ops/shared.ts documents for
   its own AUDIT_COLS. The one exception is `service->>audit_by`, pulled as a
   scalar through PostgREST's json path so the list can badge audit ownership
   without carrying the whole blob.

   Attribution reuses SiteAuditBmView's `orderBelongsToBm` unchanged, so all
   three lists agree on who owns an order and nothing here matches fuzzily.
   Note install_orders has no `bm_email` column at all (only audit_orders and
   wp_production do), so its rows always resolve through the free-text `bm`
   name/contact path. */

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { fmtDateA, fmtLog, sbGet } from './siteAuditShared';
import { orderBelongsToBm, type BmProfile } from './SiteAuditBmView';
import { InstallRoomCard } from './AuditRoomViews';
import { DrawerShell, KV, Sec } from './drawerUi';
import LinkAuditSection from './LinkAuditSection';
import { STATUS as INSTALL_STATUS, fmtDate, sjShortLabel, sjEffectiveAssignments, sjDeliveryDate } from './install-ops/shared';
import type { InstallOrder, Subjob } from './install-ops/types';
import WpLadder from './coe-ops/WpLadder';
import { WP_BUCKETS, wpBucket, wpNext, wpVendor, type WpRow } from './coe-ops/wpTrack';

/* `auditBy` is lifted out of the `service` jsonb as a scalar (PostgREST json
   path + alias) rather than selecting the whole column: the badge needs one
   string, and `service` also carries every SKU row. */
export const OWNED_INSTALL_COLS = 'id,pi,po,bm,customer_name,phone,addr,status,delivery_date,custom_wp,subjobs,city,created_at,auditBy:service->>audit_by';
export const OWNED_WP_COLS = 'id,pi,md_id,vendor,city,customer_name,phone,bm,bm_email,order_placed_at,stages,rounds,state,imported,install_order_id,audit_order_id,created_at';

/* Only what a drawer adds on top of the list row. */
const INSTALL_DRAWER_COLS = 'id,log,service,skus';
const WP_DRAWER_COLS = 'id,log,notes';

export type AuditSource = 'material_depot' | 'customer' | null;

export type OwnedInstall = {
  id: string; pi: string; po: string[]; bm: string; name: string; phone: string; addr: string;
  status: string; deliveryDate: string | null; customWp: boolean; city: string;
  createdAt: string | null;
  auditBy: AuditSource;
  subjobs: Subjob[];
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
    city: r.city || '',
    createdAt: r.created_at || null,
    auditBy: (r.auditBy === 'material_depot' || r.auditBy === 'customer') ? r.auditBy : null,
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

const AUDIT_SOURCE_BADGE: Record<'material_depot' | 'customer' | 'unset', { l: string; badge: string; hint: string }> = {
  material_depot: {
    l: 'MD audit', badge: 'bg-green-100 text-green-700',
    hint: 'A Material Depot site auditor measured this site, so there is a job card behind this installation.',
  },
  customer: {
    l: 'External audit', badge: 'bg-blue-100 text-blue-700',
    hint: 'The client (or somebody outside Material Depot) supplied the measurements — there is no site audit job card.',
  },
  unset: {
    l: 'Audit not set', badge: 'bg-red-100 text-red-700',
    hint: "Nobody has recorded who did the site audit. The Service Manager sets this on the order, and it decides what the installer's app shows on site.",
  },
};
export function auditSourceKey(o: OwnedInstall): 'material_depot' | 'customer' | 'unset' {
  return o.auditBy === 'material_depot' ? 'material_depot' : o.auditBy === 'customer' ? 'customer' : 'unset';
}

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

export function InstallOrdersList({ orders, loading, showBm = false, attribution }: {
  orders: OwnedInstall[];
  loading: boolean;
  showBm?: boolean;
  /* Who is looking, for the one write this list allows: declaring which site
     audit an installation came from. Omitted in rollup views, where nobody
     identifiable owns the order — the drawer is then entirely read-only. */
  attribution?: string;
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [source, setSource] = useState<'all' | 'material_depot' | 'customer' | 'unset'>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    orders.forEach((o) => { c[o.status] = (c[o.status] || 0) + 1; });
    return c;
  }, [orders]);
  const sourceCounts = useMemo(() => {
    const c: Record<string, number> = {};
    orders.forEach((o) => { const k = auditSourceKey(o); c[k] = (c[k] || 0) + 1; });
    return c;
  }, [orders]);

  const list = orders.filter((o) => {
    if (filter !== 'all' && o.status !== filter) return false;
    if (source !== 'all' && auditSourceKey(o) !== source) return false;
    if (!q) return true;
    return [o.pi, o.name, o.phone, o.bm, ...(o.po || [])].join(' ').toLowerCase().includes(q.toLowerCase());
  });

  const openOrder = orders.find((o) => o.id === openId) || null;

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
        {/* Who measured the site is a different question from where the job has
            got to, so it filters independently rather than joining the status
            pills. */}
        <label className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          Audit by
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as typeof source)}
            className="rounded-md border border-gray-200 px-2 py-1.5 text-[13px] font-normal normal-case tracking-normal text-gray-900"
          >
            <option value="all">Anyone ({orders.length})</option>
            <option value="material_depot">Material Depot ({sourceCounts.material_depot || 0})</option>
            <option value="customer">External / client ({sourceCounts.customer || 0})</option>
            <option value="unset">Not set ({sourceCounts.unset || 0})</option>
          </select>
        </label>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        {loading ? (
          <div className="flex justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[#EAB308]" /></div>
        ) : list.length ? list.map((o) => {
          const st = INSTALL_STATUS[o.status] || { l: o.status, badge: 'bg-gray-100 text-gray-600' };
          const src = AUDIT_SOURCE_BADGE[auditSourceKey(o)];
          return (
            <div key={o.id} onClick={() => setOpenId(o.id)} className="flex cursor-pointer items-start gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 hover:bg-gray-50">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold text-gray-900">
                  {o.name || '—'}
                  {o.customWp ? <span className="ml-1.5 rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700">Custom WP</span> : null}
                  <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${src.badge}`}>{src.l}</span>
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

      {openOrder ? <InstallOrderDrawer order={openOrder} attribution={attribution} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}

/* ── Installation drawer ───────────────────────────────────────────────── */

type InstallExtras = { log: any[]; service: InstallOrder['service']; skus: any[] } | null;

function InstallOrderDrawer({ order: o, attribution, onClose }: { order: OwnedInstall; attribution?: string; onClose: () => void }) {
  const [extras, setExtras] = useState<InstallExtras>(null);
  const [extrasFailed, setExtrasFailed] = useState(false);
  const [wp, setWp] = useState<WpRow[] | null>(null);
  const [msg, setMsg] = useState('');

  const loadExtras = useCallback(async () => {
    setExtrasFailed(false);
    const rows = await sbGet('install_orders?id=eq.' + o.id + '&select=' + INSTALL_DRAWER_COLS);
    /* Not `Array.isArray(rows) ? … : []`: a failed request would then render an
       empty timeline that reads exactly like a job nobody has touched. */
    if (!Array.isArray(rows) || !rows[0]) { setExtrasFailed(true); return; }
    setExtras({
      log: Array.isArray(rows[0].log) ? rows[0].log : [],
      service: rows[0].service || null,
      skus: Array.isArray(rows[0].skus) ? rows[0].skus : [],
    });
  }, [o.id]);

  useEffect(() => { loadExtras(); }, [loadExtras]);

  /* The production run behind a custom-wallpaper order, by the id the COE's own
     tracker writes, or the lead id when it was raised before that link existed.
     Verified against live data: every run whose `install_order_id` is set also
     agrees on `pi`, so the two clauses never disagree — the second only widens
     coverage. Never by phone: one client's two projects share a number. */
  useEffect(() => {
    if (!o.customWp) { setWp([]); return; }
    let alive = true;
    const clauses = ['install_order_id.eq.' + o.id];
    /* A comma or bracket in the value would be read as PostgREST `or=()`
       syntax rather than as data, so a lead id carrying one is skipped instead
       of corrupting the whole filter. Enquiry ids never do — this is a guard,
       not a known case. */
    if (o.pi && !/[,()]/.test(o.pi)) clauses.push('pi.eq.' + o.pi);
    sbGet('wp_production?or=(' + clauses.join(',') + ')&select=' + OWNED_WP_COLS + ',notes&order=created_at.desc')
      .then((rows) => { if (alive) setWp(Array.isArray(rows) ? rows : null); })
      .catch(() => { if (alive) setWp(null); });
    return () => { alive = false; };
  }, [o.customWp, o.id, o.pi]);

  const src = AUDIT_SOURCE_BADGE[auditSourceKey(o)];
  const st = INSTALL_STATUS[o.status] || { l: o.status, badge: 'bg-gray-100 text-gray-600' };

  return (
    <DrawerShell
      title={o.name || '—'}
      subtitle={<>{o.pi} · {st.l}{o.city ? ' · ' + o.city : ''}</>}
      onClose={onClose}
      footer={msg ? <div className="border-t border-gray-100 bg-green-50 px-5 py-2 text-[12.5px] font-semibold text-green-700">{msg}</div> : null}
    >
      <Sec title="Order">
        <KV k="Lead ID" v={o.pi || '—'} />
        <KV k="Enquiry" v={o.po.length ? o.po.join(', ') : '—'} />
        <KV k="BM" v={o.bm} />
        <KV k="Delivery" v={o.deliveryDate ? fmtDate(o.deliveryDate) : '—'} />
        <KV k="Type" v={o.customWp ? 'Custom (printed to order) wallpaper' : 'Standard, from stock'} />
        <KV k="Raised" v={o.createdAt ? fmtLog(o.createdAt) : '—'} />
        {extras && extras.skus.length ? (
          <KV k="SKUs" v={
            <div className="flex flex-wrap gap-1">
              {extras.skus.map((s: any, i: number) => (
                <span key={i} className="rounded-md bg-gray-100 px-2 py-0.5 text-[10.5px] font-bold text-[#1F3A5F]">{s.c}{s.n ? ' · ' + s.n : ''}</span>
              ))}
            </div>
          } />
        ) : null}
      </Sec>

      <Sec title="Customer">
        <KV k="Phone" v={o.phone ? <a className="text-blue-600" href={'tel:' + o.phone.replace(/\s/g, '')}>{o.phone}</a> : '—'} />
        <KV k="Address" v={o.addr ? <a className="text-blue-600" href={'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(o.addr)} target="_blank" rel="noopener noreferrer">{o.addr}</a> : '—'} />
      </Sec>

      {/* Who measured the site, and — when it was us — the job card the
          installer is working from. */}
      <Sec title="Site audit">
        <div className="mb-2 flex items-start gap-2">
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${src.badge}`}>{src.l}</span>
          <span className="text-[12.5px] text-gray-600">{src.hint}</span>
        </div>
        {o.auditBy === 'material_depot' ? (
          <LinkAuditSection
            installId={String(o.id)}
            installPi={o.pi}
            installPhone={o.phone}
            attribution={attribution}
            onMsg={setMsg}
          />
        ) : null}
      </Sec>

      {o.customWp ? (
        <Sec title="Custom wallpaper production">
          {wp === null ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-800">
              Couldn&apos;t load the production run just now — a connection problem, not a missing run.
            </div>
          ) : !wp.length ? (
            <div className="text-[12.5px] text-gray-400">
              No production run is recorded against this order yet. The Category Ops Executive raises one when the
              dimensions go to the vendor.
            </div>
          ) : wp.map((r) => (
            <div key={r.id} className="mb-3 last:mb-0">
              <WpLadder row={r} />
            </div>
          ))}
        </Sec>
      ) : null}

      <Sec title="Installation jobs">
        {!o.subjobs.length ? (
          <div className="text-[12.5px] text-gray-400">
            No sub-jobs yet — the Service Manager creates one per category (flooring, wallpaper, wall panels) once
            delivery is confirmed.
          </div>
        ) : o.subjobs.map((sj) => <SubjobBlock key={sj.id} order={o} sj={sj} />)}
      </Sec>

      <Sec title="Timeline">
        {extrasFailed ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-800">
            Couldn&apos;t load this order&apos;s activity — a connection problem, not an empty timeline.
            <button className="ml-1.5 font-bold underline" onClick={loadExtras}>Retry</button>
          </div>
        ) : !extras ? <div className="text-[12.5px] text-gray-400">Loading…</div>
          : extras.log.length ? extras.log.slice().reverse().map((l: any, i: number) => (
            <div key={i} className="border-b border-gray-100 py-2 last:border-b-0">
              <div className="text-[13px] font-semibold text-gray-900">{l.who ? <b className="text-[#1F3A5F]">{l.who}</b> : null}{l.who ? ' · ' : ''}{l.t || ''}</div>
              <div className="mt-0.5 text-[11.5px] text-gray-400">{fmtLog(l.d)}{l.by ? ' · ' + (l.by === 'auto' ? 'system' : l.by) : ''}</div>
            </div>
          )) : <div className="text-[12.5px] text-gray-400">No activity logged yet.</div>}
      </Sec>
    </DrawerShell>
  );
}

/* One installation sub-job: who is on it, when, and the job card they signed.
   `sjShortLabel`/`sjDeliveryDate`/`sjEffectiveAssignments` are the SM view's own
   helpers — split sub-jobs and legacy single-installer rows both normalise
   through them, so this can't disagree with what the SM sees. */
function SubjobBlock({ order, sj }: { order: OwnedInstall; sj: Subjob }) {
  const st = INSTALL_STATUS[sj.status] || { l: sj.status, badge: 'bg-gray-100 text-gray-600' };
  const asgns = sjEffectiveAssignments(sj);
  const jc = sj.jobcard;
  const rooms = jc && Array.isArray(jc.rooms) ? jc.rooms : [];
  /* `sjDeliveryDate` wants the SM view's InstallOrder; only these two fields
     are read, so pass them rather than widening OwnedInstall. */
  const deliv = sjDeliveryDate({ deliveryDate: order.deliveryDate } as InstallOrder, sj);

  return (
    <div className="mb-3 rounded-lg border border-gray-200 p-3 last:mb-0">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-[#1F3A5F]">
          {sjShortLabel({ subjobs: order.subjobs } as InstallOrder, sj).toUpperCase()}
        </span>
        <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.badge}`}>{st.l}</span>
      </div>
      <KV k="Scheduled" v={sj.date ? fmtDate(sj.date) : 'not scheduled yet'} />
      <KV k="Delivery" v={deliv ? fmtDate(deliv) : '—'} />
      <KV k="Installer" v={asgns.length ? asgns.map((a) => a.installer_name || a.installer_email || 'assigned').join(', ') : 'not assigned yet'} />
      {sj.items && sj.items.length ? (
        <KV k="Material" v={sj.items.map((it) => it.sku + (it.name ? ' · ' + it.name : '') + (it.sqft ? ' · ' + it.sqft + ' sq.ft' : '')).join(', ')} />
      ) : null}
      {jc ? (
        <div className="mt-2">
          {jc.draft && !(jc.sign && !(jc.sign as any).draft)
            ? <div className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] font-bold text-amber-800">⚠️ Job card is still a draft — not signed off yet.</div>
            : jc.sign ? <div className="mb-2 rounded-lg bg-green-50 px-3 py-2 text-[12.5px] font-bold text-green-700">✓ Signed off by the client{jc.sign.name ? ' — ' + jc.sign.name : ''}</div> : null}
          {rooms.map((r: any, i: number) => <Fragment key={i}><InstallRoomCard room={r} index={i} /></Fragment>)}
        </div>
      ) : null}
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

      {openRow ? <WallpaperOrderDrawer row={openRow} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}

/* ── Custom wallpaper drawer ───────────────────────────────────────────── */

function WallpaperOrderDrawer({ row, onClose }: { row: WpRow; onClose: () => void }) {
  /* The ladder needs `notes`, and the activity list needs `log` — neither is in
     the list query (see the header note). Merged over the list row so the
     ladder renders immediately from what we already have. */
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

  /* The installation this run feeds, when the COE recorded one. Not guessed
     from the phone — see the same note in the installation drawer. */
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

      {/* The whole point of the tab: every step this print job goes through,
          which round it is on, and what it is waiting for right now. */}
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
