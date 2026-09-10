'use client';

import LinkAuditSection from '../../../ui/link-audit-section';
import WpLadder from '../../../coe-ops/wallpaper/ladder';
import { WpRow } from '../../../coe-ops/wallpaper/track';
import { STATUS as INSTALL_STATUS } from '../../../install-ops/constants';
import { fmtDate, sjDeliveryDate, sjEffectiveAssignments, sjShortLabel } from '../../../install-ops/utils';
import { InstallOrder, Subjob } from '../../../install-ops/types';
import { fmtDateA, fmtLog, sbGet } from '../../../shared';
import { InstallRoomCard } from '../../../ui/audit-room-views';
import { DrawerShell, KV, Sec } from '../../../ui/drawer-ui';
import { AUDIT_SOURCE_BADGE, INSTALL_DRAWER_COLS, OWNED_WP_COLS } from '../constants';
import { InstallExtras, OwnedInstall } from '../types';
import { auditSourceKey } from '../utils';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';

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

function InstallOrderDrawer({ order: o, attribution, onClose }: { order: OwnedInstall; attribution?: string; onClose: () => void }) {
  const [extras, setExtras] = useState<InstallExtras>(null);
  const [extrasFailed, setExtrasFailed] = useState(false);
  const [wp, setWp] = useState<WpRow[] | null>(null);
  const [msg, setMsg] = useState('');

  const loadExtras = useCallback(async () => {
    setExtrasFailed(false);
    const rows = await sbGet('install_orders?id=eq.' + o.id + '&select=' + INSTALL_DRAWER_COLS);

    if (!Array.isArray(rows) || !rows[0]) { setExtrasFailed(true); return; }
    setExtras({
      log: Array.isArray(rows[0].log) ? rows[0].log : [],
      service: rows[0].service || null,
      skus: Array.isArray(rows[0].skus) ? rows[0].skus : [],
    });
  }, [o.id]);

  useEffect(() => { loadExtras(); }, [loadExtras]);

  useEffect(() => {
    if (!o.customWp) { setWp([]); return; }
    let alive = true;
    const clauses = ['install_order_id.eq.' + o.id];

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

function SubjobBlock({ order, sj }: { order: OwnedInstall; sj: Subjob }) {
  const st = INSTALL_STATUS[sj.status] || { l: sj.status, badge: 'bg-gray-100 text-gray-600' };
  const asgns = sjEffectiveAssignments(sj);
  const jc = sj.jobcard;
  const rooms = jc && Array.isArray(jc.rooms) ? jc.rooms : [];

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
