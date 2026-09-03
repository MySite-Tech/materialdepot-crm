'use client';

/* Audit Ops — the Service Manager's audit-side dashboard, port of
   material-depot-site's SM_Audit_Dashboard.html. Counterpart to
   SiteAuditInstallOpsView (which ports the install-side one), and the piece
   that closes the loop in this CRM: creating an audit order, booking its date
   and time, and assigning an auditor — the three steps that were previously
   only possible in the legacy app, without which the auditor's own app never
   receives a job.

   Every caller that reaches this view already knows who's looking at it (the
   CRM session's own name, resolved via SiteAuditOwnDashboard/site-audit-view/
   Role Viewer) — the `attribution` prop carries that through so activity-log
   entries show a real name instead of the generic fallback below. Live
   Locations is deliberately not a tab here: it's the shared Live view in the
   outer Site Audit rail. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CITIES, fetchBmEmailsByPhone, inCity, mapCaps, phoneKey, rosterSelect, sbGet, sbPatch, syntheticSiteAuditEmail, type CityFilter } from './siteAuditShared';
import { fetchUsers } from '@/lib/mockApi';
import { poFieldFor } from './omsService';
import { autoImportAuditOrders } from './autoImportAuditOrders';
import AuditOrderDrawer from './audit-ops/AuditOrderDrawer';
import {
  AuditorsView, CalendarView, DeletedView, FollowupsView, OrdersView, RectificationsView, RescheduleView, SlotsView, TodayView,
} from './audit-ops/Views';
import { AddAuditorOverlay, AddOrderOverlay, EMPTY_AO, KylasOverlay, RectOverlay, type AoState } from './audit-ops/Overlays';
import {
  AUDIT_CATEGORY_QUERY, AUDIT_COLS, DEFAULT_AUDIT_SLOTS_FL, DEFAULT_AUDIT_SLOTS_WP, applyAuditCategories,
  dstr, hasOpenFollowUp, loadAuditSlots, mapAuditRow, today,
  type AuditOrder, type AuditViewKey, type Auditor, type SlotDef,
} from './audit-ops/shared';
import type { ShadowerOption } from './install-ops/ShadowerSelect';

/* Fallback only for a caller that genuinely can't resolve a person (there
   currently isn't one, but this keeps the view usable if that ever changes). */
const DEFAULT_ATTRIBUTION = 'Service Manager (CRM)';

const TABS: Array<{ view: AuditViewKey; label: string }> = [
  { view: 'orders', label: 'Orders' },
  { view: 'schedule', label: "Today's schedule" },
  { view: 'reschedule', label: 'To reschedule' },
  { view: 'followups', label: 'Follow-ups' },
  { view: 'calendar', label: 'Schedule' },
  { view: 'slots', label: 'Slots & timings' },
  { view: 'auditors', label: 'Auditors & caps' },
  { view: 'deleted', label: 'Deleted Orders' },
  { view: 'rectifications', label: 'Rectifications' },
];

export default function SiteAuditOpsView({ city = 'all', attribution = DEFAULT_ATTRIBUTION }: { city?: CityFilter; attribution?: string } = {}) {
  const ATTRIBUTION = attribution;
  const [view, setView] = useState<AuditViewKey>('orders');
  const [rawOrders, setRawOrders] = useState<AuditOrder[]>([]);
  const [rawDeleted, setRawDeleted] = useState<AuditOrder[]>([]);
  const [deletedLoaded, setDeletedLoaded] = useState(false);
  const [rawAuditors, setRawAuditors] = useState<Auditor[]>([]);
  const [shadowerPool, setShadowerPool] = useState<ShadowerOption[]>([]);
  const [bmOptions, setBmOptions] = useState<Array<{ name: string; email?: string; contact?: string }>>([]);
  const [connErr, setConnErr] = useState(false);
  const retryTid = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [slotsFl, setSlotsFl] = useState<SlotDef[]>(DEFAULT_AUDIT_SLOTS_FL);
  const [slotsWp, setSlotsWp] = useState<SlotDef[]>(DEFAULT_AUDIT_SLOTS_WP);
  useEffect(() => { setSlotsFl(loadAuditSlots('fl')); setSlotsWp(loadAuditSlots('wp')); }, []);
  const slots = useMemo(() => [...slotsFl, ...slotsWp], [slotsFl, slotsWp]);

  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDate, setFilterDate] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [calSelDay, setCalSelDay] = useState(dstr(today));
  const [currentPI, setCurrentPI] = useState<string | null>(null);
  const [drawerNonce, setDrawerNonce] = useState(0);

  const [toastMsg, setToastMsg] = useState('');
  const [toastShow, setToastShow] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((m: string) => {
    setToastMsg(m); setToastShow(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastShow(false), 2600);
  }, []);

  const [aoOpen, setAoOpen] = useState(false);
  const [ao, setAo] = useState<AoState>(EMPTY_AO);
  const [aoSkuText, setAoSkuText] = useState('');
  const [aoTicks, setAoTicks] = useState<Record<string, boolean>>({});
  const [aoNote, setAoNote] = useState(false);
  const [kylasOpen, setKylasOpen] = useState(false);
  const [rectOrder, setRectOrder] = useState<AuditOrder | null>(null);
  const [addAuditorOpen, setAddAuditorOpen] = useState(false);
  /* Distinguishes "the roster failed to load" from "nobody is registered" — the
     picker's empty state has to say which, see loadAuditors. */
  const [auditorsErr, setAuditorsErr] = useState(false);
  const audRetryTid = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* Mirrored into a ref so the mount-once poll effect can read the CURRENT value
     without listing it as a dep (which would tear down and rebuild the interval
     on every flip). */
  const auditorsErrRef = useRef(false);
  auditorsErrRef.current = auditorsErr;

  /* City scope — every list, counter and capacity check runs on the scoped
     slice; the drawer resolves its order from the unscoped list so an open
     order never vanishes if the toggle changes mid-edit. */
  const orders = useMemo(() => inCity(rawOrders, city), [rawOrders, city]);
  const deleted = useMemo(() => inCity(rawDeleted, city), [rawDeleted, city]);
  const auditors = useMemo(() => inCity(rawAuditors, city), [rawAuditors, city]);

  /* The roster is fetched once when this view mounts, but the assignment picker
     reads it on every drawer open — so one failed fetch used to leave the picker
     permanently empty, showing "No auditors in this city" for what is actually a
     connection problem and giving the SM no way to assign anyone. (Same defect
     shipped in material-depot-site's SM_Audit_Dashboard, note 113 there.)

     `Array.isArray(rows) ? rows : []` was the sharp edge: sbGet resolves a
     PostgREST ERROR OBJECT for any 4xx/5xx, so a server error was mapped to
     "zero auditors registered" and wiped a roster that had been working. A
     non-array is now a failed load, the last good roster survives it, and the
     8s retry `loadOrders` already uses applies here too. */
  const loadAuditors = useCallback(async () => {
    try {
      const rows = await sbGet('profiles?role=in.(site_auditor,auditor_installer)&select=' + await rosterSelect('id,name,email,active_from,city,weekly_off,leave_dates'));
      if (!Array.isArray(rows)) throw new Error('auditor roster unavailable');
      setRawAuditors(rows.map((r: any) => ({
        id: r.id, name: r.name, email: r.email, phone: '', zone: '',
        activeFrom: r.active_from || null,
        city: r.city || 'Bengaluru',
        weeklyOff: r.weekly_off == null ? null : r.weekly_off,
        leaveDates: Array.isArray(r.leave_dates) ? r.leave_dates.slice() : [],
        ...mapCaps(r),
      })));
      setAuditorsErr(false);
      if (audRetryTid.current) { clearTimeout(audRetryTid.current); audRetryTid.current = null; }
    } catch {
      /* keep the previous roster on a transient failure */
      setAuditorsErr(true);
      if (!audRetryTid.current) audRetryTid.current = setTimeout(() => { audRetryTid.current = null; loadAuditors(); }, 8000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Shadower pool = everyone registered except store staff (their kiosk has no
     login, so no personal shadow schedule). Kept separate from `auditors` so
     it can never touch cap/conflict logic. */
  const loadShadowers = useCallback(async () => {
    try {
      const rows = await sbGet('profiles?role=neq.store_staff&select=name,email,role&order=name');
      setShadowerPool((Array.isArray(rows) ? rows : []).map((r: any) => ({ name: r.name, email: r.email, role: r.role })));
    } catch { /* pool is optional */ }
  }, []);

  /* BM list comes from the CRM's own user table (backend UserOrganisation) —
     the same source the BM dashboard resolves identity from.

     `email` is filled in from the BM's field-app profile, matched on phone: the
     roster has no email at all, and every writer here guards its `bm_email` on
     `match.email`, so without this step the Add Order overlay and the drawer's
     BM assign wrote a NAME and nothing else — the row then reached the BM's
     dashboard only by name match, which is what left 196 rows unlinked. */
  const loadBms = useCallback(async () => {
    try {
      const [users, bmEmails] = await Promise.all([fetchUsers(), fetchBmEmailsByPhone()]);
      setBmOptions((users || []).filter((u: any) => u.name).map((u: any) => ({
        name: u.name,
        contact: u.phone,
        /* The account's address when they have one, otherwise the synthetic
           address that encodes their number — attribution compares the phone,
           so picking someone with no field-app account still links the order. */
        email: phoneKey(u.phone)
          ? (bmEmails.get(phoneKey(u.phone)) || syntheticSiteAuditEmail(u.phone))
          : undefined,
      })));
    } catch { /* free-text BM entry still works */ }
  }, []);

  /* Last good narrow category read — see loadOrders. */
  const catRowsRef = useRef<any[]>([]);

  const loadOrders = useCallback(async () => {
    try {
      const rows = await sbGet('audit_orders?select=' + AUDIT_COLS + '&status=neq.deleted&order=created_at.desc');
      if (!Array.isArray(rows)) {
        setConnErr(true);
        if (!retryTid.current) retryTid.current = setTimeout(() => { retryTid.current = null; loadOrders(); }, 8000);
        return;
      }
      setConnErr(false);
      if (retryTid.current) { clearTimeout(retryTid.current); retryTid.current = null; }
      /* The ticked categories come from a second, deliberately narrow query: they
         can't ride in AUDIT_COLS because `audit_ticked` also holds the job card's
         room photos, but for the pre-card statuses it is a few bytes a row — and
         it is the only place "what material is this audit for" is recorded.

         The last good result is kept in a ref and applied to THIS render pass, so
         a 30s poll never repaints the table with the pills missing while the
         second query is in flight. The fetch itself is fire-and-forget and fails
         quietly: no category pill is worth delaying or blanking the orders table
         for, and the previous answer stays on screen if it drops. */
      setRawOrders(applyAuditCategories(rows.map(mapAuditRow), catRowsRef.current));
      sbGet(AUDIT_CATEGORY_QUERY)
        .then((catRows) => {
          if (!Array.isArray(catRows)) return;
          catRowsRef.current = catRows;
          setRawOrders((prev) => applyAuditCategories(prev, catRows));
        })
        .catch(() => { /* keep the previous categories */ });
    } catch {
      setConnErr(true);
      if (!retryTid.current) retryTid.current = setTimeout(() => { retryTid.current = null; loadOrders(); }, 8000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDeleted = useCallback(async () => {
    try {
      const rows = await sbGet('audit_orders?select=' + AUDIT_COLS + '&status=eq.deleted&order=created_at.desc');
      setRawDeleted((Array.isArray(rows) ? rows : []).map(mapAuditRow));
      setDeletedLoaded(true);
    } catch { /* keep the previous list */ }
  }, []);
  const reloadWithDeleted = useCallback(async () => { await Promise.all([loadOrders(), loadDeleted()]); }, [loadOrders, loadDeleted]);

  useEffect(() => {
    Promise.all([loadAuditors(), loadShadowers(), loadBms(), loadOrders()]);
    /* Jobs the backend already has but nobody imported are pulled in here, so
       Pending POs is a fallback rather than the only way in. */
    autoImportAuditOrders().then((added) => {
      if (!added) return;
      loadOrders();
      toast(added + (added === 1 ? ' new audit order' : ' new audit orders') + ' imported from the backend');
    });
    /* The roster only re-fetches while it is KNOWN to be broken, so the healthy
       case still costs exactly one query per tick. */
    const poll = setInterval(() => { if (!document.hidden && !currentPI) { loadOrders(); if (auditorsErrRef.current) loadAuditors(); } }, 30000);
    const vis = () => { if (!document.hidden && !currentPI) { loadOrders(); if (auditorsErrRef.current) loadAuditors(); } };
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearInterval(poll);
      document.removeEventListener('visibilitychange', vis);
      if (retryTid.current) { clearTimeout(retryTid.current); retryTid.current = null; }
      if (audRetryTid.current) { clearTimeout(audRetryTid.current); audRetryTid.current = null; }
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadAuditors, loadShadowers, loadBms, loadOrders]);

  function openOrder(pi: string) { setCurrentPI(pi); setDrawerNonce((n) => n + 1); }
  function goView(v: AuditViewKey) {
    if (v === 'deleted' && !deletedLoaded) loadDeleted();
    setView(v); setFilterStatus('all'); setFilterDate('');
  }

  async function restoreOrder(o: AuditOrder) {
    try {
      await sbPatch('audit_orders', o.id, { status: 'pending' });
      await reloadWithDeleted();
      toast('Order ' + o.pi + ' restored to Pending');
    } catch (e: any) {
      toast('Restore failed — ' + (e?.message || 'try again'));
    }
  }

  function usePORow(r: any) {
    setKylasOpen(false);
    setAo({
      pi: r.estimate_lead_id || '',
      po: poFieldFor(r),
      name: (r.customer && r.customer.name) || '',
      phone: r.customer && r.customer.contact ? String(r.customer.contact) : '',
      addr: (r.shipping_address && r.shipping_address.address) || '',
      bm: '',
      city: city !== 'all' ? String(city) : CITIES[0],
    });
    setAoSkuText((r.skus || []).map((s: any) => s.variant_handle).filter(Boolean).join(', '));
    setAoTicks({});
    setAoNote(true);
    setAoOpen(true);
  }

  const todayStr = dstr(today);
  const COUNTS: Partial<Record<AuditViewKey, number>> = {
    orders: orders.filter((o) => !['slot_reserved', 'slot_converted'].includes(o.status)).length,
    schedule: orders.filter((o) => o.date === todayStr && !['slot_reserved', 'slot_converted'].includes(o.status)).length,
    reschedule: orders.filter((o) => o.status === 'reschedule').length,
    followups: orders.filter((o) => hasOpenFollowUp(o) && o.service!.follow_up_date! <= todayStr).length,
    deleted: deleted.length,
    rectifications: orders.filter((o) => o.service && o.service.rectification_of).length,
  };
  const ALERT_VIEWS: AuditViewKey[] = ['reschedule', 'followups'];

  const drawerOrder = currentPI ? rawOrders.find((o) => o.pi === currentPI) || null : null;

  function renderMain() {
    switch (view) {
      case 'orders':
        return (
          <OrdersView
            orders={orders} auditors={auditors}
            filterStatus={filterStatus} setFilterStatus={setFilterStatus}
            filterDate={filterDate} setFilterDate={setFilterDate}
            searchQ={searchQ} setSearchQ={setSearchQ}
            onOpenOrder={openOrder}
            onAddOrder={() => { setAo({ ...EMPTY_AO, city: city !== 'all' ? String(city) : CITIES[0] }); setAoSkuText(''); setAoTicks({}); setAoNote(false); setAoOpen(true); }}
            onOpenKylas={() => setKylasOpen(true)}
          />
        );
      case 'schedule':
        return <TodayView orders={orders} auditors={auditors} slots={slots} onOpenOrder={openOrder} />;
      case 'reschedule':
        return <RescheduleView orders={orders} auditors={auditors} slots={slots} onOpenOrder={openOrder} />;
      case 'followups':
        return <FollowupsView orders={orders} onOpenOrder={openOrder} />;
      case 'calendar':
        return <CalendarView orders={orders} auditors={auditors} slots={slots} calSelDay={calSelDay} setCalSelDay={setCalSelDay} onOpenOrder={openOrder} />;
      case 'slots':
        return <SlotsView slotsFl={slotsFl} slotsWp={slotsWp} setSlotsFl={setSlotsFl} setSlotsWp={setSlotsWp} toast={toast} />;
      case 'auditors':
        return <AuditorsView auditors={auditors} onAddStaff={() => setAddAuditorOpen(true)} reload={loadAuditors} toast={toast} />;
      case 'deleted':
        return <DeletedView deleted={deleted} auditors={auditors} onRestore={restoreOrder} />;
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
          <button className="ml-auto rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-bold text-red-700" onClick={() => loadOrders()}>Retry now</button>
        </div>
      ) : null}

      <div className="-mx-4 mb-4 overflow-x-auto border-b border-gray-200 px-4 sm:-mx-6 sm:px-6">
        <div className="flex w-max gap-0">
          {TABS.map((t) => {
            const ct = COUNTS[t.view];
            return (
              <button
                key={t.view}
                onClick={() => goView(t.view)}
                className={`cursor-pointer whitespace-nowrap border-b-2 bg-transparent px-4 py-3 text-[13px] font-semibold ${view === t.view ? 'border-[#EAB308] text-gray-800' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
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
        <div className="fixed inset-0 z-[900] flex justify-end bg-black/30" onClick={(e) => { if (e.target === e.currentTarget) setCurrentPI(null); }}>
          <div className="flex h-full w-full max-w-[600px] flex-col bg-white shadow-2xl" key={currentPI + ':' + drawerNonce}>
            <AuditOrderDrawer
              order={drawerOrder} orders={orders} auditors={auditors} slots={slots}
              shadowerPool={shadowerPool} bmOptions={bmOptions} attribution={ATTRIBUTION}
              auditorsErr={auditorsErr} onRetryAuditors={loadAuditors}
              onClose={() => setCurrentPI(null)} reload={loadOrders} reloadWithDeleted={reloadWithDeleted}
              onOpenOrder={openOrder} onRaiseRect={(o) => setRectOrder(o)} toast={toast}
            />
          </div>
        </div>
      ) : null}

      <AddOrderOverlay
        open={aoOpen} ao={ao} setAo={setAo} skuText={aoSkuText} setSkuText={setAoSkuText}
        ticks={aoTicks} setTicks={setAoTicks} bmOptions={bmOptions} orders={rawOrders}
        attribution={ATTRIBUTION} note={aoNote}
        onClose={() => setAoOpen(false)} onSaved={loadOrders} toast={toast}
      />
      <KylasOverlay open={kylasOpen} orders={rawOrders} onClose={() => setKylasOpen(false)} onUse={usePORow} />
      <RectOverlay order={rectOrder} attribution={ATTRIBUTION} onClose={() => setRectOrder(null)} onSaved={loadOrders} toast={toast} />
      <AddAuditorOverlay open={addAuditorOpen} onClose={() => setAddAuditorOpen(false)} reload={loadAuditors} toast={toast} scopeCity={city} />

      {toastShow ? (
        <div className="fixed bottom-6 left-1/2 z-[960] -translate-x-1/2 rounded-full bg-[#16294a] px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-lg">{toastMsg}</div>
      ) : null}
    </div>
  );
}
