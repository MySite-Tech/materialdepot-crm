'use client';

/* Install Ops — port of material-depot-site's app/src/pages/SMInstall.jsx
   (the Service Manager's installation-order operations center) into this
   CRM. The caller (SiteAuditOwnDashboard / site-audit-view / Role Viewer)
   already knows who's looking at it — the `attribution` prop carries that
   real name through so activity-log entries aren't all attributed to the
   same generic `SM_ATTRIBUTION` fallback (still used for a caller that
   genuinely has no resolved person, same deliberate deviation as
   SiteAuditStoreTeamView.tsx, which attributes writes to the selected store
   name instead of a person).

   Internal navigation is this view's OWN flat horizontal tab bar (styled
   like SiteAuditRail.tsx's outer tab bar), not the original's left rail —
   the outer Site Audit tab bar already made that call for this feature
   area. "Live Locations" from the original rail is intentionally omitted:
   it's already covered by SiteAuditLiveView.tsx (owned separately), which
   shows the same profiles-based location tracking for installers/auditors. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { poFieldFor } from './omsService';
import { autoImportInstallOrders } from './autoImportAuditOrders';
import { inCity, mapCaps, rosterSelect, sbGet, sbPatch, sbPost, type CityFilter } from './siteAuditShared';
import OrdersView from './install-ops/OrdersView';
import { CallsView, FollowupsView, NeedActionView, RescheduleView } from './install-ops/QueueViews';
import { CalendarView, ScheduleView } from './install-ops/ScheduleCalendarViews';
import { InstallersView, SlotsView } from './install-ops/SetupViews';
import { DeletedView, RectificationsView } from './install-ops/DataViews';
import { FoamView, PayoutsView } from './install-ops/FoamPayoutViews';
import type { ShadowerOption } from './install-ops/ShadowerSelect';
import OrderDrawer from './install-ops/OrderDrawer';
import { AddOrderOverlay, AddStaffOverlay, KylasOverlay, RectOverlay, type AoSkuRow, type AoState } from './install-ops/Overlays';
import { Toast } from './install-ops/ui';
import {
  DEFAULT_SLOTS_FL, DEFAULT_SLOTS_WP, INSTALL_SKU, detectAuditBy, dstr, followUpDue, loadSlots, mapInstallRow, needActionCount, opsCallDue, today,
} from './install-ops/shared';
import { SM_ATTRIBUTION } from './install-ops/types';
import type { InstallOrder, Installer, SlotDef, ViewKey } from './install-ops/types';

const TABS: Array<{ view: ViewKey; label: string }> = [
  { view: 'orders', label: 'Orders' },
  { view: 'needaction', label: 'Need Action' },
  { view: 'calls', label: 'Call Operations today' },
  { view: 'schedule', label: "Today's installs" },
  { view: 'reschedule', label: 'To reschedule' },
  { view: 'followups', label: 'Follow-ups' },
  { view: 'calendar', label: 'Schedule' },
  { view: 'slots', label: 'Slots & timings' },
  { view: 'installers', label: 'Installers' },
  { view: 'foam', label: 'Foam Rolls' },
  { view: 'payouts', label: 'Payouts' },
  { view: 'deleted', label: 'Deleted Orders' },
  { view: 'rectifications', label: 'Rectifications' },
];

export default function SiteAuditInstallOpsView({ city = 'all', attribution = SM_ATTRIBUTION }: { city?: CityFilter; attribution?: string } = {}) {
  const [activeView, setActiveView] = useState<ViewKey>('orders');
  const [rawOrders, setOrders] = useState<InstallOrder[]>([]);
  const [rawDeleted, setDeleted] = useState<InstallOrder[]>([]);
  const [deletedLoaded, setDeletedLoaded] = useState(false);
  const [installers, setInstallers] = useState<Installer[]>([]);
  /* Every list, counter and capacity check below runs on the city-scoped
     slice; the drawer still looks its order up in the unscoped list so an
     open order never vanishes mid-edit when the toggle changes. */
  const orders = useMemo(() => inCity(rawOrders, city), [rawOrders, city]);
  const cityInstallers = useMemo(() => inCity(installers, city), [installers, city]);
  const deleted = useMemo(() => inCity(rawDeleted, city), [rawDeleted, city]);
  const [shadowerPool, setShadowerPool] = useState<ShadowerOption[]>([]);
  const [connErr, setConnErr] = useState(false);
  const retryTid = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [slotsFl, setSlotsFl] = useState<SlotDef[]>(DEFAULT_SLOTS_FL);
  const [slotsWp, setSlotsWp] = useState<SlotDef[]>(DEFAULT_SLOTS_WP);
  useEffect(() => { setSlotsFl(loadSlots('fl')); setSlotsWp(loadSlots('wp')); }, []);

  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDate, setFilterDate] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [sortDelivery, setSortDelivery] = useState<'asc' | 'desc'>('asc');
  const [calSelDay, setCalSelDay] = useState(dstr(today));
  const [currentPI, setCurrentPI] = useState<string | null>(null);
  const [drawerNonce, setDrawerNonce] = useState(0);

  const [toastMsg, setToastMsg] = useState('');
  const [toastShow, setToastShow] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((m: string) => {
    setToastMsg(m); setToastShow(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastShow(false), 2400);
  }, []);

  const [aoOpen, setAoOpen] = useState(false);
  const [ao, setAo] = useState<AoState>({ pi: '', po: '', name: '', phone: '', addr: '', bm: '', delivery: '' });
  const [aoSkus, setAoSkus] = useState<AoSkuRow[]>([{ code: '', type: 'flooring', name: '' }]);
  const [aoCwp, setAoCwp] = useState(false);
  const [aoErr, setAoErr] = useState('');
  const [aoKylasNote, setAoKylasNote] = useState(false);
  const [aoBusy, setAoBusy] = useState(false);

  const [kylasOpen, setKylasOpen] = useState(false);
  const [rectOrder, setRectOrder] = useState<InstallOrder | null>(null);
  const [asOpen, setAsOpen] = useState(false);
  /* "Roster failed to load" vs "nobody registered" — the picker's empty state
     has to say which, see loadInstallers. */
  const [installersErr, setInstallersErr] = useState(false);
  const instRetryTid = useRef<ReturnType<typeof setTimeout> | null>(null);
  const installersErrRef = useRef(false);
  installersErrRef.current = installersErr;

  /* Fetched once on mount but read by the assignment picker on every drawer
     open, so one failed fetch left the installer dropdown empty for as long as
     the view stayed mounted — see SiteAuditOpsView's loadAuditors for the full
     story. `Array.isArray(rows) ? rows : []` is the sharp edge: sbGet resolves a
     PostgREST error object on any 4xx/5xx, which mapped a server error onto
     "zero installers" and wiped a roster that had been working. */
  const loadInstallers = useCallback(async () => {
    try {
      const rows = await sbGet('profiles?role=in.(installer,auditor_installer)&select=' + await rosterSelect('id,name,email,installer_type,city,weekly_off,leave_dates,active_from'));
      if (!Array.isArray(rows)) throw new Error('installer roster unavailable');
      setInstallers(rows.map((r: any) => ({
        id: r.id, name: r.name, email: r.email, type: r.installer_type || 'flooring', zone: '', phone: '',
        city: r.city || 'Bengaluru',
        weeklyOff: r.weekly_off == null ? null : r.weekly_off,
        leaveDates: Array.isArray(r.leave_dates) ? r.leave_dates.slice() : [],
        activeFrom: r.active_from || null,
        ...mapCaps(r),
      })));
      setInstallersErr(false);
      if (instRetryTid.current) { clearTimeout(instRetryTid.current); instRetryTid.current = null; }
    } catch {
      /* keep previous roster on transient failure */
      setInstallersErr(true);
      if (!instRetryTid.current) instRetryTid.current = setTimeout(() => { instRetryTid.current = null; loadInstallers(); }, 8000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Shadower pool = everyone registered except store staff, whose kiosk app
     has no login and therefore no personal shadow schedule. Deliberately a
     separate list from `installers` so it can never leak into capacity or
     conflict logic. */
  const loadShadowers = useCallback(async () => {
    try {
      const rows = await sbGet('profiles?role=neq.store_staff&select=name,email,role&order=name');
      setShadowerPool((Array.isArray(rows) ? rows : []).map((r: any) => ({ name: r.name, email: r.email, role: r.role })));
    } catch {
      /* keep previous pool on transient failure */
    }
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      const rows = await sbGet('install_orders_slim?select=*&status=neq.deleted&order=created_at.desc');
      if (!Array.isArray(rows)) {
        setConnErr(true);
        if (!retryTid.current) retryTid.current = setTimeout(() => { retryTid.current = null; loadOrders(); }, 8000);
        return;
      }
      setConnErr(false);
      if (retryTid.current) { clearTimeout(retryTid.current); retryTid.current = null; }
      setOrders(rows.map(mapInstallRow));
    } catch {
      setConnErr(true);
      if (!retryTid.current) retryTid.current = setTimeout(() => { retryTid.current = null; loadOrders(); }, 8000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDeletedOrders = useCallback(async () => {
    try {
      const rows = await sbGet('install_orders_slim?select=id,pi,po,skus,bm,customer_name,phone,addr,status,log,delivery_date&status=eq.deleted&order=created_at.desc');
      setDeleted((Array.isArray(rows) ? rows : []).map(mapInstallRow));
      setDeletedLoaded(true);
    } catch {
      /* keep previous list on transient failure */
    }
  }, []);

  const reloadWithDeleted = useCallback(async () => { await Promise.all([loadOrders(), loadDeletedOrders()]); }, [loadOrders, loadDeletedOrders]);

  useEffect(() => {
    Promise.all([loadInstallers(), loadShadowers(), loadOrders()]);
    /* Jobs the backend already has but nobody imported are pulled in here, so
       Pending POs is a fallback rather than the only way in. */
    autoImportInstallOrders().then((added) => {
      if (!added) return;
      loadOrders();
      toast(added + (added === 1 ? ' new installation order' : ' new installation orders') + ' imported from the backend');
    });
    /* The roster only re-fetches while it is KNOWN to be broken, so the healthy
       case still costs exactly one query per tick. */
    const poll = setInterval(() => { if (!document.hidden) { loadOrders(); if (installersErrRef.current) loadInstallers(); } }, 60000);
    const vis = () => { if (!document.hidden) { loadOrders(); if (installersErrRef.current) loadInstallers(); } };
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearInterval(poll);
      document.removeEventListener('visibilitychange', vis);
      if (retryTid.current) { clearTimeout(retryTid.current); retryTid.current = null; }
      if (instRetryTid.current) { clearTimeout(instRetryTid.current); instRetryTid.current = null; }
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [loadInstallers, loadShadowers, loadOrders]);

  function openOrder(pi: string) { setCurrentPI(pi); setDrawerNonce((n) => n + 1); }
  function closeDrawer() { setCurrentPI(null); }

  function goView(v: ViewKey) {
    if (v === 'deleted' && !deletedLoaded) loadDeletedOrders();
    setActiveView(v); setFilterStatus('all'); setFilterDate('');
  }

  /* ── Add Order ─────────────────────────────────────────────────────── */
  function openAddOrder() { setAoOpen(true); }
  function closeAddOrder() {
    setAoOpen(false);
    setAo({ pi: '', po: '', name: '', phone: '', addr: '', bm: '', delivery: '' });
    setAoCwp(false); setAoErr(''); setAoKylasNote(false);
    setAoSkus([{ code: '', type: 'flooring', name: '' }]);
  }
  function addSkuRow() { setAoSkus((rows) => [...rows, { code: '', type: 'flooring', name: '' }]); }

  async function submitAddOrder() {
    const pi = ao.pi.trim(), poRaw = ao.po.trim(), name = ao.name.trim(), phone = ao.phone.trim(), addr = ao.addr.trim();
    const bm = ao.bm.trim() || '—', delivery = ao.delivery, customWp = aoCwp;
    setAoErr('');
    if (!pi) { setAoErr('PI Number is required.'); return; }
    if (!name) { setAoErr('Customer name is required.'); return; }
    if (!phone) { setAoErr('Customer phone is required.'); return; }
    if (!addr) { setAoErr('Address is required.'); return; }
    if (rawOrders.find((o) => o.pi === pi)) { setAoErr('An order with this PI number already exists.'); return; }
    const po = poRaw ? poRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const skus = aoSkus
      .map((row) => ({ c: (row.code || '').trim(), type: row.type || 'flooring', n: (row.name || '').trim() }))
      .filter((s) => s.c)
      .map((s) => ({ c: s.c, n: s.n || s.c, type: s.type, audit: false }));
    skus.push({ c: INSTALL_SKU, n: 'Installation', type: 'install', audit: false });
    const logEntries: Array<{ t: string; d: string; by?: string; who?: string }> = [
      { t: 'Order added manually by ' + attribution, d: new Date().toISOString() },
    ];
    setAoBusy(true);
    // Live lookup at creation time (not a locally-cached phone set) so it's
    // always accurate to the moment and never needs a manual refresh.
    const auditBy = await detectAuditBy(phone);
    if (auditBy) {
      logEntries.push({
        t: 'Site audit type auto-detected: ' + (auditBy === 'material_depot' ? 'Material Depot audit (phone match)' : 'Customer self-audit (no matching site audit found)'),
        d: new Date().toISOString(), by: 'auto', who: attribution,
      });
    }
    const service = auditBy ? { audit_by: auditBy } : null;
    const payload = {
      pi, po: po.join(','), skus, bm,
      customer_name: name, phone, addr,
      matched_audit: false,
      delivery_date: delivery || null,
      original_delivery_date: delivery || null,
      custom_wp: customWp,
      status: 'pending',
      service,
      log: logEntries,
      created_by_email: attribution,
    };
    try {
      const existing = await sbGet('install_orders?select=id&pi=eq.' + encodeURIComponent(pi) + '&status=neq.deleted&limit=1').catch(() => []);
      const existingId = Array.isArray(existing) && existing.length ? existing[0].id : null;
      let savedId: string | number | null = null;
      if (existingId) { await sbPatch('install_orders', String(existingId), payload); savedId = existingId; }
      else { const saved = await sbPost('install_orders', payload); const row = Array.isArray(saved) ? saved[0] : saved; savedId = row ? row.id : null; }
      const newOrder: InstallOrder = {
        id: savedId, pi, po, skus: skus as any, bm, name, phone, addr, matchedAudit: false, auditBy,
        deliveryDate: delivery || null, customWp, status: 'pending', subjobs: null, service: service as any, log: logEntries as any,
      };
      setOrders((prev) => [newOrder, ...prev]);
      closeAddOrder();
      toast('✓ Installation order ' + pi + ' saved');
    } catch (e: any) {
      setAoErr('Save failed: ' + (e?.message || 'unknown error'));
    }
    setAoBusy(false);
  }

  function usePORow(r: any) {
    setKylasOpen(false);
    const skusRows = (r.skus || []).filter((s: any) => s.variant_handle);
    setAo({
      pi: r.estimate_lead_id || '',
      po: poFieldFor(r),
      name: (r.customer && r.customer.name) || '',
      phone: r.customer && r.customer.contact ? String(r.customer.contact) : '',
      bm: (r.bm && r.bm.name) || '',
      addr: (r.shipping_address && r.shipping_address.address) || '',
      delivery: r.delivery_date || '',
    });
    if (skusRows.length) {
      setAoSkus(skusRows.map((sku: any) => ({ code: sku.variant_handle, type: (sku.product_name || '').toLowerCase().includes('wallpaper') ? 'wallpaper' : 'flooring', name: sku.product_name || '' })));
    } else {
      setAoSkus([{ code: '', type: 'flooring', name: '' }]);
    }
    setAoCwp(false); setAoErr(''); setAoKylasNote(true);
    setAoOpen(true);
  }

  /* ── Restore ───────────────────────────────────────────────────────── */
  async function restoreOrder(id: string | number, pi: string) {
    try {
      await sbPatch('install_orders', String(id), { status: 'pending' });
      await reloadWithDeleted();
      toast('Order ' + pi + ' restored to Pending');
    } catch (e: any) {
      toast('Restore failed — ' + (e?.message || 'unknown error'));
      throw e;
    }
  }

  const na = needActionCount(orders);
  const cCalls = orders.filter(opsCallDue).length;
  const todayStr = dstr(today);
  const cToday = orders.filter((o) => (o.subjobs || []).some((sj) => sj.date === todayStr)).length;
  const cResched = orders.filter((o) => o.status === 'reschedule' || (o.subjobs || []).some((sj) => sj.status === 'reschedule')).length;
  const cRect = orders.filter((o) => o.service && o.service.rectification_of).length;
  const cFollowUp = orders.filter((o) => followUpDue(o, todayStr)).length;
  const COUNTS: Partial<Record<ViewKey, number>> = {
    orders: orders.length, needaction: na, calls: cCalls, schedule: cToday, reschedule: cResched, followups: cFollowUp, deleted: deleted.length, rectifications: cRect,
  };
  const ALERT_VIEWS: ViewKey[] = ['needaction', 'calls', 'reschedule', 'followups'];

  const drawerOrder = currentPI ? rawOrders.find((o) => o.pi === currentPI) || null : null;

  function renderMain() {
    switch (activeView) {
      case 'orders':
        return (
          <OrdersView
            orders={orders} installers={installers}
            filterStatus={filterStatus} setFilterStatus={setFilterStatus}
            filterDate={filterDate} setFilterDate={setFilterDate}
            searchQ={searchQ} setSearchQ={setSearchQ}
            sortDelivery={sortDelivery} setSortDelivery={setSortDelivery}
            onOpenOrder={openOrder} onOpenKylas={() => setKylasOpen(true)} onOpenAddOrder={openAddOrder} onGoView={goView}
          />
        );
      case 'needaction':
        return <NeedActionView orders={orders} onOpenOrder={openOrder} />;
      case 'calls':
        return <CallsView orders={orders} onOpenOrder={openOrder} />;
      case 'schedule':
        return <ScheduleView orders={orders} installers={installers} onOpenOrder={openOrder} slotsWp={slotsWp} />;
      case 'reschedule':
        return <RescheduleView orders={orders} onOpenOrder={openOrder} slotsFl={slotsFl} slotsWp={slotsWp} />;
      case 'followups':
        return <FollowupsView orders={orders} onOpenOrder={openOrder} />;
      case 'calendar':
        return <CalendarView orders={orders} installers={installers} slotsFl={slotsFl} slotsWp={slotsWp} calSelDay={calSelDay} setCalSelDay={setCalSelDay} onOpenOrder={openOrder} />;
      case 'slots':
        return <SlotsView slotsFl={slotsFl} slotsWp={slotsWp} setSlotsFl={setSlotsFl} setSlotsWp={setSlotsWp} toast={toast} />;
      case 'installers':
        return <InstallersView installers={cityInstallers} orders={orders} onAddStaff={() => setAsOpen(true)} reload={loadInstallers} toast={toast} />;
      case 'foam':
        return <FoamView orders={orders} installers={cityInstallers} attribution={attribution} toast={toast} />;
      case 'payouts':
        return <PayoutsView orders={orders} toast={toast} />;
      case 'deleted':
        return <DeletedView deleted={deleted} onRestore={restoreOrder} />;
      case 'rectifications':
        return <RectificationsView orders={orders} onOpenOrder={openOrder} />;
      default:
        return null;
    }
  }

  return (
    <div>
      {connErr ? (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] font-semibold text-red-700">
          <span>⚠ Cannot connect to server — retrying automatically</span>
          <button className="ml-auto bg-white border border-red-200 text-red-700 px-2.5 py-1 rounded-md text-xs font-bold" onClick={() => loadOrders()}>Retry now</button>
        </div>
      ) : null}

      <div className="border-b border-gray-200 -mx-4 sm:-mx-6 px-4 sm:px-6 mb-4 overflow-x-auto">
        <div className="flex gap-0 w-max">
          {TABS.map((t) => {
            const ct = COUNTS[t.view];
            return (
              <button
                key={t.view}
                onClick={() => goView(t.view)}
                className={`px-4 py-3 text-[13px] font-semibold border-b-2 cursor-pointer bg-transparent whitespace-nowrap ${activeView === t.view ? 'border-[#EAB308] text-gray-800' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
              >
                {t.label}
                {ct ? <span className={`ml-1.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-bold ${ALERT_VIEWS.includes(t.view) ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{ct}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      {renderMain()}

      {drawerOrder ? (
        <div className="fixed inset-0 bg-black/30 z-[900] flex justify-end" onClick={(e) => { if (e.target === e.currentTarget) closeDrawer(); }}>
          <div className="bg-white h-full w-full max-w-[600px] shadow-2xl flex flex-col" key={currentPI + ':' + drawerNonce}>
            <OrderDrawer
              order={drawerOrder} allOrders={orders} installers={installers} shadowerPool={shadowerPool} city={city} slotsFl={slotsFl} slotsWp={slotsWp} attribution={attribution}
              installersErr={installersErr} onRetryInstallers={loadInstallers}
              onClose={closeDrawer} onOpenOrder={openOrder} onOpenRect={(o) => setRectOrder(o)}
              reload={loadOrders} reloadWithDeleted={reloadWithDeleted} toast={toast}
            />
          </div>
        </div>
      ) : null}

      <Toast message={toastMsg} show={toastShow} />

      <AddOrderOverlay
        open={aoOpen} ao={ao} setAo={setAo} aoSkus={aoSkus} setAoSkus={setAoSkus} aoCwp={aoCwp} setAoCwp={setAoCwp}
        aoErr={aoErr} aoKylasNote={aoKylasNote} aoBusy={aoBusy} onClose={closeAddOrder} onAddSku={addSkuRow} onSubmit={submitAddOrder}
      />
      <KylasOverlay open={kylasOpen} orders={orders} onClose={() => setKylasOpen(false)} onUse={usePORow} />
      <RectOverlay order={rectOrder} onClose={() => setRectOrder(null)} reload={loadOrders} toast={toast} attribution={attribution} />
      <AddStaffOverlay open={asOpen} onClose={() => setAsOpen(false)} reload={loadInstallers} toast={toast} city={city} />
    </div>
  );
}
