'use client';

/* Audit order drawer — port of drawerBody / drawerFoot / wireDrawer from
   material-depot-site's SM_Audit_Dashboard.html. This is where an audit order
   actually moves: service creation → slot booking → auditor assignment, plus
   the manual overrides, follow-ups, shadowers, journey, job card and delete.

   Every guard from the source is kept, because each one exists for a reason
   that's documented there: the cap is a hard block while the 2-hour travel
   conflict is a soft override; forcing Completed without a signed job card
   needs a confirm + reason; moving a completed audit backwards archives the
   signed card into audit_ticked_history first; and every manual action
   demands a note that lands in the activity log. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AuditRoomCard } from '../AuditRoomViews';
import RoomSkuEditor, { auditRoomSkuSaver } from '../RoomSkuEditor';
import ShadowerSelect, { type ShadowerOption } from '../install-ops/ShadowerSelect';
import { MD_JOURNEY_STAGES, journeyStage, type JourneyEntry } from '../auditRegistry';
import {
  fmtLog, initials, joinShadowers, parseShadowers, sbGet, sbPatch, type Shadower,
} from '../siteAuditShared';
import {
  AUTO_STATUSES, FLOW, FLOW_LABELS, STATUS, auditorById, auditorConflictOrder, auditorLoad, auditorNameOf,
  capFor, dstr, flowIndexOf, fmtDate, mapUrl, offReason, requireNote, slotLabel, today,
  type AuditOrder, type AuditSkuRow, type Auditor, type Caps, type SlotDef,
} from './shared';
import { genAuditPDF } from './pdf';

type BmOption = { name: string; email?: string; contact?: string };

interface Props {
  order: AuditOrder;
  orders: AuditOrder[];
  auditors: Auditor[];
  caps: Caps;
  slots: SlotDef[];
  shadowerPool: ShadowerOption[];
  bmOptions: BmOption[];
  attribution: string;
  /* True when the roster FAILED to load, as opposed to genuinely having nobody
     in it — the picker's empty state has to tell those apart. */
  auditorsErr?: boolean;
  onRetryAuditors?: () => void;
  onClose: () => void;
  reload: () => Promise<void>;
  reloadWithDeleted: () => Promise<void>;
  onOpenOrder: (pi: string) => void;
  onRaiseRect: (o: AuditOrder) => void;
  toast: (m: string) => void;
}

/* An empty auditor picker used to read "No auditors in this city" whatever the
   reason, which sends the SM to the city toggle for what is usually a failed
   fetch. Each cause now names itself, and a failed load offers a way back. */
function EmptyAuditorPool({ err, anyLoaded, onRetry }: { err: boolean; anyLoaded: boolean; onRetry?: () => void }) {
  if (err) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] font-semibold text-red-700">
        ⚠ Couldn&apos;t load the auditor list, so there&apos;s nobody to assign — this is a connection problem, not an empty roster. Retrying automatically.
        {onRetry ? <button onClick={onRetry} className="ml-2 rounded-md border border-red-300 bg-white px-2 py-0.5 text-[11.5px] font-semibold text-red-700">Retry now</button> : null}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] font-semibold text-amber-800">
      {anyLoaded
        ? '⚠ No auditors are registered in this city. Switch the city filter to assign someone from another city.'
        : '⚠ No auditors are registered yet — add them under Auditors & caps before assigning.'}
    </div>
  );
}

export default function AuditOrderDrawer({
  order: o, orders, auditors, caps, slots, shadowerPool, bmOptions, attribution,
  auditorsErr = false, onRetryAuditors,
  onClose, reload, reloadWithDeleted, onOpenOrder, onRaiseRect, toast,
}: Props) {
  const todayStr = dstr(today);
  const [busy, setBusy] = useState(false);
  const [ticked, setTicked] = useState<any>(null);

  /* Service-creation / edit draft. Pre-seeded from the created service, else
     from the auditor-ticked categories against the cart SKUs — same fallback
     the source uses so the SM rarely types a SKU twice. */
  const [draft, setDraft] = useState<{ flooring: AuditSkuRow[]; wallpaper: AuditSkuRow[] }>(() => {
    if (o.service) {
      return {
        flooring: (o.service.flooring || []).map((x) => ({ ...x })),
        wallpaper: (o.service.wallpaper || []).map((x) => ({ ...x })),
      };
    }
    const at: string[] = Array.isArray(o.auditTicked) ? o.auditTicked : [];
    const wantFl = at.some((x) => /floor/i.test(x)), wantWp = at.some((x) => /wall/i.test(x));
    const fl: AuditSkuRow[] = [], wp: AuditSkuRow[] = [];
    (o.skus || []).filter((s) => !s.audit).forEach((s) => {
      const row = { sku: s.c, name: '', link: '' };
      if (/^WP/i.test(s.c) && wantWp) wp.push(row);
      else if (wantFl) fl.push(row);
      else if (wantWp) wp.push(row);
    });
    return { flooring: fl, wallpaper: wp };
  });
  const [grpOn, setGrpOn] = useState({ flooring: draft.flooring.length > 0, wallpaper: draft.wallpaper.length > 0 });

  const [bookDate, setBookDate] = useState(o.date && o.date >= todayStr ? o.date : todayStr);
  const [bookTime, setBookTime] = useState(o.slot && /^\d{1,2}:\d{2}$/.test(o.slot) ? o.slot : '09:00');
  const [reschedRemark, setReschedRemark] = useState('');
  const [followUp, setFollowUp] = useState((o.service && o.service.follow_up_date) || '');
  const [pickedAuditor, setPickedAuditor] = useState<string | null>(null);
  const [conflictOverride, setConflictOverride] = useState(false);
  const [shadowers, setShadowers] = useState<Shadower[]>(() => parseShadowers(o.shadowerEmail, o.shadowerName));
  const [editSlot, setEditSlot] = useState(false);
  const [bmOpen, setBmOpen] = useState(false);
  const [bmPick, setBmPick] = useState('');
  const [custOpen, setCustOpen] = useState(false);
  const [custName, setCustName] = useState(o.name || '');
  const [custPhone, setCustPhone] = useState(o.phone || '');
  const [custAddr, setCustAddr] = useState(o.addr || '');
  const [journey, setJourney] = useState<JourneyEntry[] | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const loadJourney = useCallback(async () => {
    const rows = await sbGet('audit_orders?id=eq.' + o.id + '&select=bm_journey');
    setJourney(Array.isArray(rows) && rows[0] && Array.isArray(rows[0].bm_journey) ? rows[0].bm_journey : []);
  }, [o.id]);

  useEffect(() => { loadJourney(); }, [loadJourney]);

  /* audit_ticked is excluded from the list query (photos make it huge) — pull
     it on demand once, for the completed view's rooms + PDF. */
  useEffect(() => {
    if (o.status !== 'completed') return;
    let alive = true;
    sbGet('audit_orders?id=eq.' + o.id + '&select=audit_ticked').then((rows) => {
      if (alive && Array.isArray(rows) && rows[0]) setTicked(rows[0].audit_ticked);
    });
    return () => { alive = false; };
  }, [o.id, o.status]);

  const flowIdx = flowIndexOf(o.status);

  async function patch(body: Record<string, any>, msg: string, reopen = true) {
    setBusy(true);
    try {
      await sbPatch('audit_orders', o.id, body);
      await reload();
      toast(msg);
      if (reopen) onOpenOrder(o.pi); else onClose();
    } catch (e: any) {
      toast('Failed — ' + (e?.message || 'try again'));
    }
    setBusy(false);
  }
  const logged = (t: string) => [...o.log, { t, d: new Date().toISOString(), by: 'manual' as const, who: attribution }];

  /* ── stepper: free backward movement, with the forward data cleared ──── */
  async function stepBack(target: string) {
    const tIdx = FLOW.indexOf(target);
    if (tIdx >= flowIdx) return;
    const note = requireNote('Move back to ' + STATUS[target].l);
    if (note === null) return;
    const body: Record<string, any> = {
      status: target,
      log: logged('Moved back to ' + STATUS[target].l + ' by SM — note: "' + note + '"'),
    };
    if (tIdx < FLOW.indexOf('assigned')) Object.assign(body, { auditor_id: null, auditor_name: null, auditor_email: null, shadower_email: null, shadower_name: null });
    if (tIdx < FLOW.indexOf('scheduled')) Object.assign(body, { slot: null, date: null });
    await patch(body, 'Moved back to ' + STATUS[target].l);
  }

  /* ── manual status override, with the two job-card guards ────────────── */
  async function setStatus(st: string) {
    if (st === o.status) return;
    let forcedNoCard = false;
    let fresh: any = null;
    if ((st === 'completed' && o.status !== 'completed') || (o.status === 'completed' && st !== 'completed')) {
      try {
        const rows = await sbGet('audit_orders?id=eq.' + o.id + '&select=audit_ticked');
        fresh = Array.isArray(rows) && rows[0] ? rows[0].audit_ticked : null;
      } catch { /* fall through — treated as "no card" below */ }
    }
    const hasSigned = fresh && !Array.isArray(fresh) && fresh.sign && !fresh.draft;

    if (st === 'completed' && o.status !== 'completed' && !hasSigned) {
      const draftNote = fresh && !Array.isArray(fresh) && fresh.draft
        ? ' There is an unfinished draft with ' + ((fresh.rooms || []).length) + ' room(s) recorded — it will be left as-is, not signed.'
        : '';
      if (!window.confirm('This audit has NO signed job card yet — no photos, measurements, or customer signature/rating on file.' + draftNote + '\n\nForcing Completed now will close it out with no proof the audit happened. Only do this if you\'ve confirmed with the auditor/customer directly.\n\nContinue?')) return;
      forcedNoCard = true;
    }
    if (o.status === 'completed' && st !== 'completed' && hasSigned) {
      if (!window.confirm('This audit already has a signed job card on file (client signature + ratings).\n\nMoving it back to "' + STATUS[st].l + '" will let the auditor reopen and redo it — the existing signed record is kept safe unless they explicitly capture a new signature.\n\nContinue?')) return;
      // Archive the signed snapshot now, deduped by signature image. Best-effort:
      // never block the status change on it (the field app backfills too).
      try {
        const histRows = await sbGet('audit_orders?id=eq.' + o.id + '&select=audit_ticked_history');
        const hist = Array.isArray(histRows) && histRows[0] && Array.isArray(histRows[0].audit_ticked_history) ? histRows[0].audit_ticked_history : [];
        if (!hist.some((h: any) => h && h.sign && h.sign.img === fresh.sign.img)) {
          hist.push({ ...fresh, archivedAt: new Date().toISOString(), archivedReason: 'status-changed-to-' + st });
          await sbPatch('audit_orders', o.id, { audit_ticked_history: hist });
        }
      } catch { /* history is best-effort */ }
    }

    // Manually forcing At Site skips the auditor app's arrival confirmation,
    // which is what Analytics' Arrival On Time % matches on — flag it in the log.
    const isManualAtSite = st === 'atsite' && o.status !== 'atsite';
    const note = requireNote('Status → ' + STATUS[st].l);
    if (note === null) return;

    const tEff = st === 'reschedule' || st === 'call_na' ? FLOW.indexOf('created') : FLOW.indexOf(st);
    const overrideNote = forcedNoCard
      ? ' · ⚠ forced Completed without signed job card: "' + note + '" (SM override)'
      : ' — note: "' + note + '"';
    const atsiteNote = isManualAtSite ? ' · ⚠ no field-confirmed arrival (SM override — excluded from Arrival On Time % tracking)' : '';
    const body: Record<string, any> = {
      status: st,
      log: logged('Status set to ' + STATUS[st].l + (AUTO_STATUSES.includes(st) ? ' (manually)' : '') + overrideNote + atsiteNote),
    };
    if (tEff < flowIdx) {
      if (tEff < FLOW.indexOf('assigned')) Object.assign(body, { auditor_id: null, auditor_name: null, auditor_email: null, shadower_email: null, shadower_name: null });
      if (tEff < FLOW.indexOf('scheduled')) Object.assign(body, { slot: null, date: null });
    }
    await patch(body, isManualAtSite
      ? '⚠ Marked At Site manually — no arrival confirmed from the auditor app, so this won\'t count in Arrival On Time %'
      : 'Status: ' + STATUS[st].l);
  }

  /* ── service create / edit ───────────────────────────────────────────── */
  const rowsOf = (grp: 'flooring' | 'wallpaper') => draft[grp].filter((r) => r.sku || r.name);
  function setRow(grp: 'flooring' | 'wallpaper', i: number, f: keyof AuditSkuRow, v: string) {
    setDraft((d) => ({ ...d, [grp]: d[grp].map((r, ri) => (ri === i ? { ...r, [f]: v } : r)) }));
  }
  function addRow(grp: 'flooring' | 'wallpaper') { setDraft((d) => ({ ...d, [grp]: [...d[grp], { sku: '', name: '', link: '' }] })); }
  function delRow(grp: 'flooring' | 'wallpaper', i: number) { setDraft((d) => ({ ...d, [grp]: d[grp].filter((_, ri) => ri !== i) })); }
  function toggleGrp(grp: 'flooring' | 'wallpaper') {
    const on = !grpOn[grp];
    setGrpOn((g) => ({ ...g, [grp]: on }));
    if (on && draft[grp].length === 0) addRow(grp);
    if (!on) setDraft((d) => ({ ...d, [grp]: [] }));
  }

  async function createService() {
    const fl = rowsOf('flooring'), wp = rowsOf('wallpaper');
    const summary = (fl.length ? 'Flooring: ' + fl.map((r) => r.sku + (r.name ? ' · ' + r.name : '')).join(', ') : '')
      + (wp.length ? ' | Wallpaper: ' + wp.map((r) => r.sku + (r.name ? ' · ' + r.name : '')).join(', ') : '');
    await patch({
      status: 'created',
      service: { ...(o.service || {}), flooring: fl, wallpaper: wp },
      log: logged('Service created — ' + (summary || 'NA (no SKU fixed)')),
    }, 'Service created');
  }
  async function saveService() {
    await patch({
      service: { ...(o.service || {}), flooring: rowsOf('flooring'), wallpaper: rowsOf('wallpaper') },
      log: logged('Service details updated'),
    }, 'Service details saved');
  }

  /* ── slot booking ────────────────────────────────────────────────────── */
  async function bookSlot() {
    if (!bookDate || !bookTime) { toast('Pick a date and time'); return; }
    const wasResched = o.status === 'reschedule';
    const remark = reschedRemark.trim();
    const label = wasResched ? 'Slot rebooked — auditor cleared, reassignment needed' : 'Slot booked';
    const body: Record<string, any> = {
      status: 'scheduled', date: bookDate, slot: bookTime,
      log: logged(label + ': ' + fmtDate(bookDate) + ' · ' + slotLabel(bookTime, slots) + (remark ? ' — ' + remark : '')),
    };
    if (wasResched) Object.assign(body, { auditor_id: null, auditor_name: null, auditor_email: null });
    await patch(body, (wasResched ? 'Slot rebooked' : 'Slot booked') + ' — ' + fmtDate(bookDate));
  }
  async function saveSlotChange() {
    if (!bookDate || !bookTime) { toast('Pick a date and time'); return; }
    await patch({ date: bookDate, slot: bookTime, log: logged('Slot updated: ' + fmtDate(bookDate) + ' · ' + slotLabel(bookTime, slots)) },
      'Slot updated → ' + slotLabel(bookTime, slots) + ' on ' + fmtDate(bookDate));
  }

  /* ── follow-up ───────────────────────────────────────────────────────── */
  async function setFollowUpDate() {
    if (!followUp) { toast('Pick a date first'); return; }
    const note = requireNote('Set follow-up to ' + fmtDate(followUp));
    if (note === null) return;
    await patch({ service: { ...(o.service || {}), follow_up_date: followUp }, log: logged('Follow-up set · Call client by ' + fmtDate(followUp) + ' — note: "' + note + '"') },
      'Follow-up set for ' + fmtDate(followUp));
  }
  async function clearFollowUp() {
    const note = requireNote('Clear follow-up');
    if (note === null) return;
    const svc = { ...(o.service || {}) };
    delete svc.follow_up_date;
    await patch({ service: svc, log: logged('Follow-up cleared — note: "' + note + '"') }, 'Follow-up cleared');
  }
  /* Reschedule with no confirmed date yet: note + optional follow-up only. */
  async function saveReschedFollowUp() {
    const rem = reschedRemark.trim();
    if (!rem) { toast('A note is required to save the follow-up'); return; }
    await patch({
      service: { ...(o.service || {}), ...(followUp ? { follow_up_date: followUp } : {}) },
      log: logged('Follow-up noted' + (followUp ? ' · Call client by ' + fmtDate(followUp) : '') + ' — note: "' + rem + '"'),
    }, 'Follow-up saved');
  }

  /* ── auditor assignment ──────────────────────────────────────────────── */
  /* A store pre-booking for this same customer/slot is excluded from the
     conflict set, so assigning the reserved auditor to the real order can't
     warn against itself. */
  const linkedPre = useMemo(() => {
    const nm = o.name ? o.name.trim().toLowerCase() : null;
    return orders.find((r) => r.id !== o.id && r.status === 'slot_reserved' && r.slot === o.slot && r.date === o.date
      && ((r.po && r.po.length && r.po[0] === o.pi) || (nm && r.name && r.name.trim().toLowerCase() === nm))) || null;
  }, [orders, o.id, o.pi, o.name, o.slot, o.date]);

  const auditorRows = auditors.map((a) => {
    const cap = capFor(caps, auditors, a.id, o.date);
    const load = auditorLoad(orders, a.id, o.date, o.id);
    const cx = auditorConflictOrder(orders, a.id, o.date, o.slot, o.id, linkedPre?.id);
    const capBlocked = (cap < 1 && load === 0) || (cap > 0 && load >= cap);
    const overCap = cap < 1 && load > 0;
    const conflict = !!cx && !capBlocked;
    return { a, cap, load, cx, full: capBlocked, overCap, conflict };
  });

  function pickAuditor(row: (typeof auditorRows)[number]) {
    if (row.full) return;
    if (row.cx) {
      if (!window.confirm(`${row.a.name} has a booking at ${slotLabel(row.cx.slot, slots)} — within 2 hours of this slot (${slotLabel(o.slot, slots)}). Assign anyway? Only do this if the two sites are close by.`)) return;
      setConflictOverride(true);
    } else {
      setConflictOverride(false);
    }
    setPickedAuditor(row.a.id);
  }

  async function assignAuditor() {
    const a = auditorById(auditors, pickedAuditor);
    if (!a) { toast('Pick an auditor first'); return; }
    const note = requireNote('Assign auditor: ' + a.name);
    if (note === null) return;
    const prev = parseShadowers(o.shadowerEmail, o.shadowerName);
    const joined = joinShadowers(shadowers);
    const prevSet = new Set(prev.map((s) => s.email)), nextSet = new Set(shadowers.map((s) => s.email));
    const added = shadowers.filter((s) => !prevSet.has(s.email)), removed = prev.filter((s) => !nextSet.has(s.email));
    const now = new Date().toISOString();
    const log = [...o.log];
    if (added.length) log.push({ t: 'Shadower(s) assigned: ' + added.map((s) => s.name).join(', ') + ' (observing this audit)', d: now, by: 'manual', who: attribution });
    if (removed.length) log.push({ t: 'Shadower(s) removed: ' + removed.map((s) => s.name).join(', '), d: now, by: 'manual', who: attribution });
    log.push({
      t: 'Auditor assigned: ' + a.name + (conflictOverride ? ' · ⚠ assigned despite 2-hour scheduling conflict (SM override)' : '') + ' · SMS sent to customer with auditor details' + ' — note: "' + note + '"',
      d: now, by: 'manual', who: attribution,
    });
    await patch({
      status: 'assigned', auditor_id: a.id, auditor_name: a.name, auditor_email: a.email,
      shadower_email: joined.email, shadower_name: joined.name, log,
    }, 'Assigned ' + a.name + (conflictOverride ? ' (conflict override)' : '') + ' · customer notified');
  }

  async function saveShadowers() {
    const prev = parseShadowers(o.shadowerEmail, o.shadowerName);
    const prevKey = prev.map((s) => s.email).sort().join(','), nextKey = shadowers.map((s) => s.email).sort().join(',');
    if (prevKey === nextKey) { toast('No change to shadowers'); return; }
    const joined = joinShadowers(shadowers);
    const prevSet = new Set(prev.map((s) => s.email)), nextSet = new Set(shadowers.map((s) => s.email));
    const added = shadowers.filter((s) => !prevSet.has(s.email)), removed = prev.filter((s) => !nextSet.has(s.email));
    const now = new Date().toISOString();
    const log = [...o.log];
    if (added.length) log.push({ t: 'Shadower(s) assigned: ' + added.map((s) => s.name).join(', ') + ' (observing this audit)', d: now, by: 'manual', who: attribution });
    if (removed.length) log.push({ t: 'Shadower(s) removed: ' + removed.map((s) => s.name).join(', '), d: now, by: 'manual', who: attribution });
    await patch({ shadower_email: joined.email, shadower_name: joined.name, log }, shadowers.length ? 'Shadowers saved (' + shadowers.length + ')' : 'Shadowers cleared');
  }

  /* ── customer detail correction (OMS auto-fetch is sometimes wrong) ────── */
  async function saveCustomer() {
    const nm = custName.trim(), ph = custPhone.trim(), ad = custAddr.trim();
    if (!nm || !ph || !ad) { toast('Name, phone and address are all required'); return; }
    const changed: string[] = [];
    if (nm !== (o.name || '')) changed.push('name');
    if (ph !== (o.phone || '')) changed.push('phone');
    if (ad !== (o.addr || '')) changed.push('address');
    if (!changed.length) { toast('No changes to save'); return; }
    await patch({
      name: nm, phone: ph, addr: ad,
      log: logged('Customer details corrected — ' + changed.join(', ') + ' updated'),
    }, 'Customer details updated');
    setCustOpen(false);
  }

  /* ── BM link ─────────────────────────────────────────────────────────── */
  async function saveBm() {
    const match = bmOptions.find((b) => (b.email || b.name) === bmPick);
    if (!match) { toast('Select a BM first'); return; }
    await patch({
      bm: match.name, ...(match.email ? { bm_email: match.email } : {}),
      log: logged('BM assigned: ' + match.name),
    }, 'BM updated');
  }

  /* ── pre-booking (store) actions ─────────────────────────────────────── */
  async function cancelReservation() {
    if (!window.confirm('Cancel this slot reservation? It will be removed from the calendar.')) return;
    setBusy(true);
    try {
      await sbPatch('audit_orders', o.id, { status: 'deleted' });
      await reloadWithDeleted();
      toast('Slot reservation cancelled');
      onClose();
    } catch (e: any) { toast('Failed — ' + (e?.message || 'try again')); }
    setBusy(false);
  }
  async function markPreBookingFulfilled() {
    if (!window.confirm('Mark this pre-booking as fulfilled?\nUse this once the Kylas service order has been created for this customer — the pre-booking will stop occupying the slot so it won\'t be double-counted.')) return;
    await patch({ status: 'slot_converted', log: logged('Service created — pre-booking fulfilled') }, 'Pre-booking marked as service created', false);
  }

  async function delOrder() {
    if (!window.confirm('Move order ' + o.pi + ' to Deleted Orders?\nIt will be stored and can be recovered from the Deleted Orders section.')) return;
    setBusy(true);
    try {
      await sbPatch('audit_orders', o.id, { status: 'deleted' });
      await reloadWithDeleted();
      toast('Order ' + o.pi + ' moved to Deleted Orders');
      onClose();
    } catch (e: any) { toast('Delete failed — ' + (e?.message || 'try again')); }
    setBusy(false);
  }

  async function downloadPdf() {
    setPdfBusy(true);
    try {
      // Always fetch fresh — audit_ticked carries the photos and may not be loaded.
      const rows = await sbGet('audit_orders?id=eq.' + o.id + '&select=audit_ticked');
      const t = Array.isArray(rows) && rows[0] ? rows[0].audit_ticked : ticked;
      if (!t) { toast('No job card data found for this order'); setPdfBusy(false); return; }
      await genAuditPDF({ pi: o.pi, customer_name: o.name, phone: o.phone, addr: o.addr, bm: o.bm, date: o.date }, t);
    } catch (e: any) {
      toast('PDF failed: ' + (e?.message || 'unknown error'));
    }
    setPdfBusy(false);
  }

  /* ── journey ─────────────────────────────────────────────────────────── */
  async function addJourney(entry: Omit<JourneyEntry, 'id' | 'ts' | 'by'>) {
    const rows = await sbGet('audit_orders?id=eq.' + o.id + '&select=bm_journey');
    const fresh: JourneyEntry[] = Array.isArray(rows) && rows[0] && Array.isArray(rows[0].bm_journey) ? rows[0].bm_journey : [];
    fresh.push({
      ...entry,
      id: 'j_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      ts: new Date().toISOString(),
      by: { name: attribution, role: 'sm' },
    });
    await sbPatch('audit_orders', o.id, { bm_journey: fresh });
    await loadJourney();
    toast('Journey entry added');
  }

  const rooms = ticked && !Array.isArray(ticked) && Array.isArray(ticked.rooms) ? ticked.rooms : [];
  const isPreBooking = o.status === 'slot_reserved' || o.status === 'slot_converted';
  const auditorName = auditorNameOf(o, auditors);

  return (
    <>
      <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
        <div>
          <h2 className="text-base font-bold text-gray-900">{o.name || (o.status === 'slot_reserved' ? 'Pre-booked Slot' : '—')}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-gray-500">
            {o.pi} · {isPreBooking ? 'Store ' + ((o.log && o.log[0] && o.log[0].who) || o.bm) : 'BM ' + o.bm}
            <Chip st={o.status} />
          </div>
        </div>
        <button className="h-7 w-7 shrink-0 rounded-md bg-gray-100 text-gray-500" onClick={onClose}>✕</button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {isPreBooking ? (
          <Section title="Pre-booking details">
            <Note tone="blue">📅 Slot pre-booked from <b>{(o.log && o.log[0] && o.log[0].who) || o.bm}</b> store. When the Kylas enquiry arrives, create the service order and schedule it for this date and time.</Note>
            <KV k="Date" v={fmtDate(o.date)} />
            <KV k="Time" v={slotLabel(o.slot, slots)} />
            <KV k="Customer" v={o.name || '—'} />
            <KV k="Phone" v={o.phone || '—'} />
            <KV k="Address" v={o.addr ? <a className="text-blue-600" href={mapUrl(o.addr)} target="_blank" rel="noopener noreferrer">{o.addr}</a> : '—'} />
            <KV k="Categories" v={(Array.isArray(o.auditTicked) ? o.auditTicked : []).join(', ') || '—'} />
            <KV k="Auditor reserved" v={auditorName || '—'} />
          </Section>
        ) : (
          <>
            {/* stepper — tap an earlier step to move the order back */}
            <div className="mb-4">
              <div className="flex gap-1">
                {FLOW.map((s, i) => (
                  <button
                    key={s}
                    onClick={() => stepBack(s)}
                    disabled={i >= flowIdx || busy}
                    className={`flex-1 rounded-md px-1 py-1.5 text-center ${i < flowIdx ? 'bg-green-50 text-green-700' : i === flowIdx ? 'bg-[#1F3A5F] text-white' : 'bg-gray-50 text-gray-400'}`}
                  >
                    <div className="text-[13px] font-extrabold">{i < flowIdx ? '✓' : i + 1}</div>
                    <div className="text-[9.5px] font-semibold leading-tight">{FLOW_LABELS[i]}</div>
                  </button>
                ))}
              </div>
              <div className="mt-1 text-[11px] text-gray-400">Tap any earlier step to move the order back if you misclicked.</div>
            </div>

            <Section title="Order">
              <KV k="PI ID" v={o.pi} />
              <KV k="PO numbers" v={o.po.join(', ') || '—'} />
              <KV k="SKUs in cart" v={<div className="flex flex-wrap gap-1">{o.skus.map((s, i) => <span key={i} className={`rounded-md px-2 py-0.5 text-[10.5px] font-bold ${s.audit ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-[#1F3A5F]'}`}>{s.c}{s.n && s.n !== s.c ? ' · ' + s.n : ''}</span>)}</div>} />
              <KV k="Audit ticked for" v={(Array.isArray(o.auditTicked) ? o.auditTicked.join(', ') : '') || '—'} />
              <KV k="BM" v={
                <span className="flex flex-wrap items-center gap-1.5">
                  {o.bm}
                  {!o.bmEmail && bmOptions.length ? <span className="text-[11px] font-bold text-amber-700">⚠ not linked to a BM account</span> : null}
                  {bmOptions.length ? <button className="rounded-md border border-gray-200 px-2 py-0.5 text-[11px] font-semibold" onClick={() => setBmOpen((v) => !v)}>Change</button> : null}
                </span>
              } />
              {bmOpen ? (
                <div className="mt-2">
                  <select value={bmPick} onChange={(e) => setBmPick(e.target.value)} className="mb-1.5 w-full rounded-md border border-gray-200 px-2 py-2 text-[13px]">
                    <option value="">— Select a BM —</option>
                    {bmOptions.map((b) => <option key={b.email || b.name} value={b.email || b.name}>{b.name}</option>)}
                  </select>
                  <button disabled={busy} onClick={saveBm} className="rounded-md bg-[#1F3A5F] px-3 py-1.5 text-[12px] font-semibold text-white">Save</button>
                </div>
              ) : null}
            </Section>

            <Section title="Customer">
              <KV k="Name" v={
                <span className="flex flex-wrap items-center gap-1.5">
                  {o.name || '—'}
                  <button className="rounded-md border border-gray-200 px-2 py-0.5 text-[11px] font-semibold" onClick={() => setCustOpen((v) => !v)}>
                    {custOpen ? 'Cancel' : 'Fix details'}
                  </button>
                </span>
              } />
              <KV k="Phone" v={<a className="text-blue-600" href={'tel:' + o.phone.replace(/\s/g, '')}>{o.phone || '—'}</a>} />
              <KV k="Address" v={o.addr ? <a className="text-blue-600" href={mapUrl(o.addr)} target="_blank" rel="noopener noreferrer">{o.addr}</a> : '—'} />
              {custOpen ? (
                <div className="mt-2 flex flex-col gap-1.5">
                  <Note tone="blue">Correct any field the OMS auto-fetch got wrong (e.g. name coming through as &quot;client&quot;) — this is logged to the activity timeline.</Note>
                  <input value={custName} onChange={(e) => setCustName(e.target.value)} placeholder="Customer name" className="w-full rounded-md border border-gray-200 px-2 py-2 text-[13px]" />
                  <input value={custPhone} onChange={(e) => setCustPhone(e.target.value)} placeholder="Phone" className="w-full rounded-md border border-gray-200 px-2 py-2 text-[13px]" />
                  <textarea value={custAddr} onChange={(e) => setCustAddr(e.target.value)} placeholder="Address" className="w-full rounded-md border border-gray-200 px-2 py-2 text-[13px] resize-y" />
                  <button disabled={busy} onClick={saveCustomer} className="self-start rounded-md bg-[#1F3A5F] px-3 py-1.5 text-[12px] font-semibold text-white">Save</button>
                </div>
              ) : null}
            </Section>

            {o.service && o.status !== 'pending' ? (
              <Section title="Service details" subtitle="— edit if needed">
                <Note tone="blue">Update SKU codes, names or links. Click Save to commit.</Note>
                <SkuGroup grp="flooring" label="Wooden Flooring" draft={draft} grpOn={grpOn} onToggle={toggleGrp} onField={setRow} onAdd={addRow} onDel={delRow} />
                <SkuGroup grp="wallpaper" label="Wallpaper" draft={draft} grpOn={grpOn} onToggle={toggleGrp} onField={setRow} onAdd={addRow} onDel={delRow} />
                <button disabled={busy} onClick={saveService} className="mt-2 rounded-md bg-[#1F3A5F] px-3 py-1.5 text-xs font-semibold text-white">Save changes</button>
              </Section>
            ) : null}

            <Section title="Set status" subtitle="— manual override">
              <Note tone="blue">Some statuses update automatically from the auditor (<b>On the way</b>, <b>At site</b>, <b>Completed</b>). You can also set any status manually here — e.g. <b>Call not picked</b>.</Note>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.keys(STATUS).filter((k) => k !== 'slot_reserved' && k !== 'slot_converted').map((k) => (
                  <button
                    key={k} disabled={busy} onClick={() => setStatus(k)}
                    className={`rounded-md border px-2.5 py-1.5 text-[12px] font-semibold ${o.status === k ? 'border-[#1F3A5F] bg-[#1F3A5F] text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-blue-400'}`}
                  >
                    {STATUS[k].l}
                    {AUTO_STATUSES.includes(k) ? <span className="ml-1 rounded bg-blue-100 px-1 py-0.5 text-[9px] font-extrabold text-blue-700">AUTO</span> : null}
                  </button>
                ))}
              </div>
            </Section>

            {o.status === 'pending' ? (
              <Section title="Service creation">
                <Note tone="blue">Customer, phone, address and BM are pulled from the order automatically. Add the SKU code, name and an optional link for each category being audited.</Note>
                <SkuGroup grp="flooring" label="Wooden Flooring" draft={draft} grpOn={grpOn} onToggle={toggleGrp} onField={setRow} onAdd={addRow} onDel={delRow} />
                <SkuGroup grp="wallpaper" label="Wallpaper" draft={draft} grpOn={grpOn} onToggle={toggleGrp} onField={setRow} onAdd={addRow} onDel={delRow} />
                {!draft.flooring.length && !draft.wallpaper.length ? <Note tone="amber">No SKU fixed yet — the service will be created as NA.</Note> : null}
              </Section>
            ) : null}

            {['created', 'call_na'].includes(o.status) ? (
              <>
                <Section title="Follow-up date" subtitle="— optional">
                  <Note tone="blue">Can&apos;t get a confirmed date from the client yet? Set a follow-up reminder instead of leaving this blank.</Note>
                  {o.service?.follow_up_date ? (
                    <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                      <div className="text-[12px] font-bold text-gray-700">📅 {o.service.follow_up_date === todayStr ? 'Follow-up is today — book the slot now!' : o.service.follow_up_date < todayStr ? 'Follow-up overdue' : 'Follow-up reminder set'}</div>
                      <div className="text-[13.5px] font-bold text-gray-900">{fmtDate(o.service.follow_up_date)}</div>
                    </div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input type="date" value={followUp} min={todayStr} onChange={(e) => setFollowUp(e.target.value)} className="min-w-[160px] flex-1 rounded-md border border-gray-200 px-2.5 py-2 text-[13.5px]" />
                    <button disabled={busy} onClick={setFollowUpDate} className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white">{o.service?.follow_up_date ? 'Update' : 'Set follow-up'}</button>
                    {o.service?.follow_up_date ? <button disabled={busy} onClick={clearFollowUp} className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700">Clear</button> : null}
                  </div>
                </Section>
                <Section title="Acknowledgement call & time">
                  <Note tone="blue">Call the customer to confirm a date and exact visit time. Assigning SMSes the auditor&apos;s details to the customer.</Note>
                  {o.status === 'call_na' ? <Note tone="red">Marked &quot;Call not picked&quot;. Retry, then book when reached.</Note> : null}
                  <DateTime date={bookDate} time={bookTime} min={todayStr} onDate={setBookDate} onTime={setBookTime} />
                </Section>
              </>
            ) : null}

            {o.status === 'scheduled' ? (
              <Section title="Assign auditor">
                <KV k="Booked for" v={`${fmtDate(o.date)} · ${slotLabel(o.slot, slots)}`} />
                <button className="mt-1 rounded-md border border-gray-200 px-2.5 py-1 text-[11.5px] font-semibold" onClick={() => setEditSlot((v) => !v)}>{editSlot ? 'Cancel' : 'Edit date / time'}</button>
                {editSlot ? (
                  <div className="mt-2">
                    <DateTime date={bookDate} time={bookTime} min={todayStr} onDate={setBookDate} onTime={setBookTime} />
                    <button disabled={busy} onClick={saveSlotChange} className="rounded-md bg-[#1F3A5F] px-3 py-1.5 text-xs font-semibold text-white">Save time change</button>
                  </div>
                ) : null}
                <Note tone="amber">Auditors with a time conflict (a booking within 2 hours) are flagged — you can still assign them if the two sites are close by, with a confirmation. Cap-full auditors cannot be selected.</Note>
                <div className="mt-2">
                  {auditorRows.length ? auditorRows.map((row) => (
                    <button
                      key={row.a.id}
                      disabled={row.full}
                      onClick={() => pickAuditor(row)}
                      className={`mb-1.5 flex w-full items-center gap-2.5 rounded-lg border p-2.5 text-left ${
                        pickedAuditor === row.a.id ? 'border-[#1F3A5F] bg-blue-50' : row.full ? 'border-gray-100 bg-gray-50 opacity-60' : row.conflict ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'
                      }`}
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#1F3A5F] text-[11px] font-bold text-white">{initials(row.a.name)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-bold text-gray-900">{row.a.name}</span>
                        <span className="block text-[11px] text-gray-500">
                          {offReason(row.a, o.date) || (row.cx ? 'conflict: ' + slotLabel(row.cx.slot, slots) : row.a.zone || 'available')}
                        </span>
                      </span>
                      <span className={`shrink-0 text-[11.5px] font-bold ${row.full ? 'text-red-600' : row.conflict || row.overCap ? 'text-amber-700' : 'text-green-700'}`}>
                        {row.conflict ? '⚠ 2h conflict' : row.overCap ? `${row.load}/${row.cap} · over cap` : `${row.load}/${row.cap}${row.full ? ' · full' : ''}`}
                      </span>
                    </button>
                  )) : <EmptyAuditorPool err={auditorsErr} anyLoaded={!!auditors.length} onRetry={onRetryAuditors} />}
                </div>
                <ShadowerSelect options={shadowerPool} value={shadowers} onChange={setShadowers} label="Shadowed by (optional) — anyone observing this audit" />
              </Section>
            ) : null}

            {['assigned', 'onway', 'atsite'].includes(o.status) ? (
              <Section title="Assignment">
                <KV k="Auditor" v={auditorName || '—'} />
                <KV k="Time" v={`${fmtDate(o.date)} · ${slotLabel(o.slot, slots)}`} />
                <KV k="Live status" v={<Chip st={o.status} />} />
                {o.shadowerName ? <KV k="Shadowed by" v={parseShadowers(o.shadowerEmail, o.shadowerName).map((s) => s.name).join(', ')} /> : null}
                <Note tone="blue">The auditor&apos;s live steps appear here automatically.</Note>
                <ShadowerSelect options={shadowerPool} value={shadowers} onChange={setShadowers} label="Shadowed by (optional) — anyone observing this audit" />
                <button disabled={busy} onClick={saveShadowers} className="mt-2 rounded-md bg-[#1F3A5F] px-3 py-1.5 text-xs font-semibold text-white">Save shadowers</button>
                <div className="mt-3">
                  <button className="rounded-md border border-gray-200 px-2.5 py-1.5 text-[12px] font-semibold" onClick={() => setEditSlot((v) => !v)}>{editSlot ? 'Cancel' : 'Edit date / time'}</button>
                  {editSlot ? (
                    <div className="mt-2">
                      <DateTime date={bookDate} time={bookTime} min={todayStr} onDate={setBookDate} onTime={setBookTime} />
                      <button disabled={busy} onClick={saveSlotChange} className="rounded-md bg-[#1F3A5F] px-3 py-1.5 text-xs font-semibold text-white">Save change</button>
                    </div>
                  ) : null}
                </div>
              </Section>
            ) : null}

            {o.status === 'reschedule' ? (
              <Section title="Reschedule">
                <Note tone="red">Customer declined the auditor&apos;s pre-visit call. If a new date is confirmed, rebook the slot. If not, save a follow-up date and call back later.</Note>
                <DateTime date={bookDate} time={bookTime} min={todayStr} onDate={setBookDate} onTime={setBookTime} />
                <div className="mb-2">
                  <label className="mb-1 block text-[11px] font-semibold text-gray-500">Follow-up date <span className="font-normal text-gray-400">(when to call the client for a new date)</span></label>
                  <input type="date" value={followUp} min={todayStr} onChange={(e) => setFollowUp(e.target.value)} className="rounded-md border border-gray-200 px-2.5 py-2 text-[13.5px]" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-gray-500">Remarks</label>
                  <textarea value={reschedRemark} onChange={(e) => setReschedRemark(e.target.value)} placeholder="Reason for reschedule, customer notes…" className="min-h-[70px] w-full rounded-md border border-gray-200 px-2.5 py-2 text-[13px]" />
                </div>
              </Section>
            ) : null}

            {o.status === 'completed' ? (
              <Section title="Completed">
                <KV k="Auditor" v={auditorName || (ticked && ticked.auditor) || '—'} />
                <KV k="Completed" v={`${fmtDate(o.date)} · ${slotLabel(o.slot, slots)}`} />
                {rooms.length ? <KV k="Rooms" v={String(rooms.length)} /> : null}
                {rooms.length && ticked.sign ? <KV k="Signed by" v={ticked.sign.name || '—'} /> : null}
                {rooms.length
                  ? <Note tone="green">Signed job card on record.</Note>
                  : <Note tone="amber">Job card data loads from the server on download.</Note>}
                <button disabled={pdfBusy} onClick={downloadPdf} className="mt-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-60">{pdfBusy ? 'Building PDF…' : '📥 Download Job Card PDF'}</button>
                {rooms.length ? (
                  <div className="mt-3">
                    <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-gray-400">Rooms audited</div>
                    <Note tone="blue">The SKU printed on the job card comes from what the auditor entered on site. Missing or wrong? Fix it here — the card and the PDF update together.</Note>
                    {rooms.map((r: any, i: number) => (
                      <div key={i}>
                        <AuditRoomCard room={r} index={i} />
                        <RoomSkuEditor room={r} save={auditRoomSkuSaver(String(o.id), i, attribution)} toast={toast} onSaved={(t) => { setTicked(t); reload(); }} />
                      </div>
                    ))}
                  </div>
                ) : null}
              </Section>
            ) : null}

            {o.service?.rectification_raised ? (
              <Note tone="amber">↩ Rectification raised — new order <b>{o.service.rectification_pi || ''}</b> ({o.service.rectification_type === 'install' ? 'Re-installation' : 'Re-audit'}). See the Rectifications tab.</Note>
            ) : null}
          </>
        )}

        <Section title="Activity">
          <div className="ml-1.5 flex flex-col gap-3 border-l-2 border-gray-200 pl-4">
            {o.log.slice().reverse().map((l, i) => (
              <div key={i} className="relative">
                <div className={`absolute -left-[21px] top-1 h-2 w-2 rounded-full ${l.by === 'auto' ? 'bg-blue-600' : l.by === 'manual' ? 'bg-amber-500' : 'bg-blue-400'}`} />
                <div className="text-[13px] font-bold text-gray-900">{l.who ? <span className="font-extrabold text-[#1F3A5F]">{l.who}</span> : null}{l.who ? ' · ' : ''}{l.t}</div>
                <div className="text-[11.5px] text-gray-400">{fmtLog(l.d)}{l.by === 'auto' ? ' · auditor' : l.by === 'manual' ? ' · SM' : ''}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Customer Journey">
          <JourneyBlock entries={journey} onAdd={addJourney} />
        </Section>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-gray-200 bg-white px-5 py-3.5">
        {o.status === 'slot_reserved' ? (
          <>
            <button disabled={busy} onClick={cancelReservation} className="rounded-md border border-red-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-red-600">Cancel Reservation</button>
            <button disabled={busy} onClick={markPreBookingFulfilled} className="rounded-md bg-green-600 px-3.5 py-2 text-[13px] font-semibold text-white">✓ Service Created</button>
            <button onClick={onClose} className="rounded-md border border-gray-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-gray-700">Close</button>
          </>
        ) : o.status === 'slot_converted' ? (
          <button onClick={onClose} className="rounded-md border border-gray-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-gray-700">Close</button>
        ) : (
          <>
            <button disabled={busy} onClick={delOrder} className="rounded-md border border-red-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-red-600">🗑 Delete</button>
            <button onClick={onClose} className="rounded-md border border-gray-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-gray-700">Close</button>
            {o.status === 'pending' ? (
              <button disabled={busy} onClick={createService} className="rounded-md bg-[#1F3A5F] px-3.5 py-2 text-[13px] font-semibold text-white">Create service</button>
            ) : null}
            {['created', 'call_na'].includes(o.status) ? (
              <button disabled={busy || !bookDate || !bookTime} onClick={bookSlot} className="rounded-md bg-[#1F3A5F] px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-50">Book slot</button>
            ) : null}
            {o.status === 'scheduled' ? (
              <button disabled={busy || !pickedAuditor} onClick={assignAuditor} className="rounded-md bg-[#1F3A5F] px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-50">Assign auditor</button>
            ) : null}
            {o.status === 'reschedule' ? (
              <>
                <button disabled={busy} onClick={saveReschedFollowUp} className="rounded-md border border-gray-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-gray-700">Save follow-up</button>
                <button disabled={busy || !bookDate || !bookTime} onClick={bookSlot} className="rounded-md bg-[#1F3A5F] px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-50">Rebook slot</button>
              </>
            ) : null}
            {o.status === 'atsite' ? (
              <button disabled={busy} onClick={() => setStatus('completed')} className="rounded-md bg-green-600 px-3.5 py-2 text-[13px] font-semibold text-white">Mark Completed</button>
            ) : null}
            {o.status === 'completed' ? (
              o.service?.rectification_raised
                ? <span className="flex-1 rounded-md bg-amber-100 px-3.5 py-2 text-center text-[13px] font-semibold text-amber-700">↩ Rectified</span>
                : <button onClick={() => onRaiseRect(o)} className="rounded-md bg-amber-600 px-3.5 py-2 text-[13px] font-semibold text-white">↩ Raise Rectification</button>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

/* ── journey block ────────────────────────────────────────────────────── */
function JourneyBlock({ entries, onAdd }: { entries: JourneyEntry[] | null; onAdd: (e: Omit<JourneyEntry, 'id' | 'ts' | 'by'>) => Promise<void> }) {
  const [stage, setStage] = useState(MD_JOURNEY_STAGES[0].k);
  const [round, setRound] = useState('');
  const [decision, setDecision] = useState('');
  const [refId, setRefId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const cfg = journeyStage(stage);
  const priorChanges = (entries || []).filter((e) => e.decision === 'changes_requested').length;

  async function submit() {
    setBusy(true);
    try {
      await onAdd({
        stage,
        round: cfg.hasRound ? parseInt(round || String(priorChanges + 1), 10) || null : null,
        decision: (cfg.hasDecision ? (decision || null) : null) as JourneyEntry['decision'],
        refId: cfg.hasRef ? refId.trim() : '',
        note: note.trim(),
      });
      setNote(''); setRefId(''); setDecision(''); setRound('');
    } catch { /* the caller toasts */ }
    setBusy(false);
  }

  return (
    <>
      {entries === null ? <div className="text-[12.5px] text-gray-400">Loading…</div>
        : !entries.length ? <div className="text-[12.5px] text-gray-400">No journey entries logged yet.</div>
          : entries.slice().sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()).map((e) => {
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
        <button disabled={busy} onClick={submit} className="rounded-md bg-green-700 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-60">{busy ? 'Saving…' : '+ Add entry'}</button>
      </div>
    </>
  );
}

/* ── small shared bits ────────────────────────────────────────────────── */
export function Chip({ st }: { st: string }) {
  const s = STATUS[st] || { l: st, badge: 'bg-gray-100 text-gray-600' };
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${s.badge}`}>{s.l}</span>;
}
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 border-b border-gray-100 pb-5 last:border-b-0">
      <h3 className="mb-2.5 text-[11px] font-extrabold uppercase tracking-wider text-gray-700">
        {title}{subtitle ? <span className="font-medium normal-case tracking-normal text-gray-400"> {subtitle}</span> : null}
      </h3>
      {children}
    </div>
  );
}
function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex gap-3 py-1 text-[13px]"><span className="w-32 shrink-0 text-gray-400">{k}</span><span className="min-w-0 text-gray-900">{v}</span></div>;
}
function Note({ tone, children }: { tone: 'blue' | 'red' | 'amber' | 'green'; children: React.ReactNode }) {
  const cls = tone === 'red' ? 'border-red-400 bg-red-50 text-red-700'
    : tone === 'amber' ? 'border-amber-500 bg-amber-50 text-amber-800'
      : tone === 'green' ? 'border-green-500 bg-green-50 text-green-700'
        : 'border-blue-400 bg-blue-50 text-[#1F3A5F]';
  return <div className={`my-2 rounded-md border-l-4 px-3 py-2.5 text-[12px] ${cls}`}>{children}</div>;
}
function DateTime({ date, time, min, onDate, onTime }: { date: string; time: string; min: string; onDate: (v: string) => void; onTime: (v: string) => void }) {
  return (
    <div className="mb-2 grid grid-cols-2 gap-2">
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-gray-500">Audit date</label>
        <input type="date" value={date} min={min} onChange={(e) => onDate(e.target.value)} className="w-full rounded-md border border-gray-200 px-2.5 py-2 text-[13.5px]" />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-gray-500">Visit time</label>
        <input type="time" value={time} onChange={(e) => onTime(e.target.value)} className="w-full rounded-md border border-gray-200 px-2.5 py-2 text-[13.5px] font-bold text-[#1F3A5F]" />
      </div>
    </div>
  );
}

function SkuGroup({
  grp, label, draft, grpOn, onToggle, onField, onAdd, onDel,
}: {
  grp: 'flooring' | 'wallpaper'; label: string;
  draft: { flooring: AuditSkuRow[]; wallpaper: AuditSkuRow[] };
  grpOn: { flooring: boolean; wallpaper: boolean };
  onToggle: (g: 'flooring' | 'wallpaper') => void;
  onField: (g: 'flooring' | 'wallpaper', i: number, f: keyof AuditSkuRow, v: string) => void;
  onAdd: (g: 'flooring' | 'wallpaper') => void;
  onDel: (g: 'flooring' | 'wallpaper', i: number) => void;
}) {
  const on = grpOn[grp];
  return (
    <div className="mb-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[13px] font-extrabold text-[#1F3A5F]">{label}</span>
        <div className={`relative ml-auto h-5 w-9 cursor-pointer rounded-full transition-colors ${on ? 'bg-green-600' : 'bg-gray-300'}`} onClick={() => onToggle(grp)}>
          <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
        </div>
      </div>
      {on ? (
        <div>
          {draft[grp].map((r, i) => (
            <div key={i} className="relative mb-2.5 rounded-lg bg-gray-50 px-3 py-2.5 pr-9">
              <button className="absolute right-2 top-2 h-6 w-6 rounded-md bg-red-100 font-extrabold text-red-600" onClick={() => onDel(grp, i)}>×</button>
              <input placeholder="SKU Code" value={r.sku || ''} onChange={(e) => onField(grp, i, 'sku', e.target.value)} className="mb-1.5 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-[13px]" />
              <input placeholder="SKU Name" value={r.name || ''} onChange={(e) => onField(grp, i, 'name', e.target.value)} className="mb-1.5 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-[13px]" />
              <input placeholder="SKU Link (optional)" value={r.link || ''} onChange={(e) => onField(grp, i, 'link', e.target.value)} className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-[13px]" />
            </div>
          ))}
          <button className="w-full rounded-md border border-dashed border-blue-500 bg-white py-1.5 text-[12.5px] font-semibold text-blue-600" onClick={() => onAdd(grp)}>+ Add {label.toLowerCase()} SKU</button>
        </div>
      ) : null}
    </div>
  );
}
