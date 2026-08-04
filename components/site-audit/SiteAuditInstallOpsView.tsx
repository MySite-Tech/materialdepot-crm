'use client';

/* Install Ops — port of material-depot-site's app/src/pages/SMInstall.jsx
   (the Service Manager's installation-order operations center) into this
   CRM. Self-contained, no required props (like SiteAuditJobsView) — this is
   an ops dashboard for whoever's logged into the CRM, not a per-person
   impersonated view, so every write is attributed to a fixed label
   (SM_ATTRIBUTION) instead of a real logged-in user's name (this CRM has no
   auth/session context to draw one from — same deliberate deviation already
   made in SiteAuditStoreTeamView.tsx, which attributes writes to the
   selected store name instead of a person).

   Internal navigation is this view's OWN flat horizontal tab bar (styled
   like SiteAuditRail.tsx's outer tab bar), not the original's left rail —
   the outer Site Audit tab bar already made that call for this feature
   area. "Live Locations" from the original rail is intentionally omitted:
   it's already covered by SiteAuditLiveView.tsx (owned separately), which
   shows the same profiles-based location tracking for installers/auditors. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { sbGet, sbPatch, sbPost } from './siteAuditShared';
import OrdersView from './install-ops/OrdersView';
import { CallsView, FollowupsView, NeedActionView, RescheduleView } from './install-ops/QueueViews';
import { CalendarView, ScheduleView } from './install-ops/ScheduleCalendarViews';
import { InstallersView, SlotsView } from './install-ops/SetupViews';
import { DeletedView, RectificationsView } from './install-ops/DataViews';
import OrderDrawer from './install-ops/OrderDrawer';
import { AddOrderOverlay, AddStaffOverlay, KylasOverlay, RectOverlay, type AoSkuRow, type AoState } from './install-ops/Overlays';
import { Toast } from './install-ops/ui';
import {
  DEFAULT_SLOTS_FL, DEFAULT_SLOTS_WP, INSTALL_SKU, dstr, loadSlots, mapInstallRow, needActionCount, opsCallDue, today,
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
  { view: 'deleted', label: 'Deleted Orders' },
  { view: 'rectifications', label: 'Rectifications' },
];

export default function SiteAuditInstallOpsView() {
  const [activeView, setActiveView] = useState<ViewKey>('orders');
  const [orders, setOrders] = useState<InstallOrder[]>([]);
  const [deleted, setDeleted] = useState<InstallOrder[]>([]);
  const [deletedLoaded, setDeletedLoaded] = useState(false);
  const [installers, setInstallers] = useState<Installer[]>([]);
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

  const loadInstallers = useCallback(async () => {
    try {
      const rows = await sbGet('profiles?role=in.(installer,auditor_installer)&select=id,name,email,installer_type');
      setInstallers((Array.isArray(rows) ? rows : []).map((r: any) => ({ id: r.id, name: r.name, email: r.email, type: r.installer_type || 'flooring', zone: '', phone: '' })));
    } catch {
      /* keep previous roster on transient failure */
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
      const rows = await sbGet('install_orders?select=id,pi,po,skus,bm,customer_name,phone,addr,status,log,delivery_date&status=eq.deleted&order=created_at.desc');
      setDeleted((Array.isArray(rows) ? rows : []).map(mapInstallRow));
      setDeletedLoaded(true);
    } catch {
      /* keep previous list on transient failure */
    }
  }, []);

  const reloadWithDeleted = useCallback(async () => { await Promise.all([loadOrders(), loadDeletedOrders()]); }, [loadOrders, loadDeletedOrders]);

  useEffect(() => {
    Promise.all([loadInstallers(), loadOrders()]);
    const poll = setInterval(() => { if (!document.hidden) loadOrders(); }, 60000);
    const vis = () => { if (!document.hidden) loadOrders(); };
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearInterval(poll);
      document.removeEventListener('visibilitychange', vis);
      if (retryTid.current) { clearTimeout(retryTid.current); retryTid.current = null; }
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [loadInstallers, loadOrders]);

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
    if (orders.find((o) => o.pi === pi)) { setAoErr('An order with this PI number already exists.'); return; }
    const po = poRaw ? poRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const skus = aoSkus
      .map((row) => ({ c: (row.code || '').trim(), type: row.type || 'flooring', n: (row.name || '').trim() }))
      .filter((s) => s.c)
      .map((s) => ({ c: s.c, n: s.n || s.c, type: s.type, audit: false }));
    skus.push({ c: INSTALL_SKU, n: 'Installation', type: 'install', audit: false });
    const logEntry = { t: 'Order added manually by ' + SM_ATTRIBUTION, d: new Date().toISOString() };
    setAoBusy(true);
    const payload = {
      pi, po: po.join(','), skus, bm,
      customer_name: name, phone, addr,
      matched_audit: false,
      delivery_date: delivery || null,
      original_delivery_date: delivery || null,
      custom_wp: customWp,
      status: 'pending',
      log: [logEntry],
      created_by_email: SM_ATTRIBUTION,
    };
    try {
      const existing = await sbGet('install_orders?select=id&pi=eq.' + encodeURIComponent(pi) + '&status=neq.deleted&limit=1').catch(() => []);
      const existingId = Array.isArray(existing) && existing.length ? existing[0].id : null;
      let savedId: string | number | null = null;
      if (existingId) { await sbPatch('install_orders', String(existingId), payload); savedId = existingId; }
      else { const saved = await sbPost('install_orders', payload); const row = Array.isArray(saved) ? saved[0] : saved; savedId = row ? row.id : null; }
      const newOrder: InstallOrder = {
        id: savedId, pi, po, skus: skus as any, bm, name, phone, addr, matchedAudit: false, auditBy: null,
        deliveryDate: delivery || null, customWp, status: 'pending', subjobs: null, service: null, log: [logEntry as any],
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
      po: r.po_number || '',
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
  const cFollowUp = orders.filter((o) => o.service && o.service.follow_up_date && o.service.follow_up_date <= todayStr).length;
  const COUNTS: Partial<Record<ViewKey, number>> = {
    orders: orders.length, needaction: na, calls: cCalls, schedule: cToday, reschedule: cResched, followups: cFollowUp, deleted: deleted.length, rectifications: cRect,
  };
  const ALERT_VIEWS: ViewKey[] = ['needaction', 'calls', 'reschedule', 'followups'];

  const drawerOrder = currentPI ? orders.find((o) => o.pi === currentPI) || null : null;

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
        return <InstallersView installers={installers} orders={orders} onAddStaff={() => setAsOpen(true)} />;
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
              order={drawerOrder} installers={installers} slotsFl={slotsFl} slotsWp={slotsWp} attribution={SM_ATTRIBUTION}
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
      <RectOverlay order={rectOrder} onClose={() => setRectOrder(null)} reload={loadOrders} toast={toast} attribution={SM_ATTRIBUTION} />
      <AddStaffOverlay open={asOpen} onClose={() => setAsOpen(false)} reload={loadInstallers} toast={toast} />
    </div>
  );
}
