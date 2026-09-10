'use client';

import { JourneyEntry } from '../../../data/audit-registry';
import { Shadower, joinShadowers, parseShadowers } from '../../../shared/staff/availability';
import { sbGet, sbPatch } from '../../../shared/sb-client';
import { BmOption } from '../types';
import { genAuditPDF } from '../../pdf';
import { AUTO_STATUSES, FLOW, STATUS } from '../../constants';
import { AuditOrder, AuditSkuRow, Auditor, SlotDef } from '../../types';
import { auditorById, auditorConflictOrder, auditorLoad, capFor, fmtDate, slotLabel } from '../../utils';
import { Dispatch, SetStateAction, useMemo } from 'react';

export function useAuditDrawerActions({ askNote, attribution, auditors, bmOptions, bmPick, bookDate, bookTime, conflictOverride, custAddr, custName, custPhone, draft, flowIdx, followUp, grpOn, loadJourney, o, onClose, onOpenOrder, orders, pickedAuditor, reload, reloadWithDeleted, reschedRemark, setBusy, setConflictOverride, setCustOpen, setDraft, setGrpOn, setPdfBusy, setPickedAuditor, shadowers, slots, ticked, toast }: {
  askNote: (label: string, preface?: string | undefined) => Promise<string | null>;
  attribution: string;
  auditors: Auditor[];
  bmOptions: BmOption[];
  bmPick: string;
  bookDate: string;
  bookTime: string;
  conflictOverride: boolean;
  custAddr: string;
  custName: string;
  custPhone: string;
  draft: { flooring: AuditSkuRow[]; wallpaper: AuditSkuRow[]; };
  flowIdx: number;
  followUp: string;
  grpOn: { flooring: boolean; wallpaper: boolean; };
  loadJourney: () => Promise<void>;
  o: AuditOrder;
  onClose: () => void;
  onOpenOrder: (pi: string) => void;
  orders: AuditOrder[];
  pickedAuditor: string | null;
  reload: () => Promise<void>;
  reloadWithDeleted: () => Promise<void>;
  reschedRemark: string;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setConflictOverride: Dispatch<SetStateAction<boolean>>;
  setCustOpen: Dispatch<SetStateAction<boolean>>;
  setDraft: Dispatch<SetStateAction<{ flooring: AuditSkuRow[]; wallpaper: AuditSkuRow[]; }>>;
  setGrpOn: Dispatch<SetStateAction<{ flooring: boolean; wallpaper: boolean; }>>;
  setPdfBusy: Dispatch<SetStateAction<boolean>>;
  setPickedAuditor: Dispatch<SetStateAction<string | null>>;
  shadowers: Shadower[];
  slots: SlotDef[];
  ticked: any;
  toast: (m: string) => void;
}) {

async function patch(body: Record<string, any>, msg: string, reopen = true): Promise<boolean> {
  setBusy(true);
  try {
    await sbPatch('audit_orders', o.id, body);
    await reload();
    toast(msg);
    if (reopen) onOpenOrder(o.pi); else onClose();
    return true;
  } catch (e: any) {
    toast('Failed — ' + (e?.message || 'try again'));
    return false;
  } finally {
    setBusy(false);
  }
}
const logged = (t: string) => [...o.log, { t, d: new Date().toISOString(), by: 'manual' as const, who: attribution }];

async function stepBack(target: string) {
  const tIdx = FLOW.indexOf(target);
  if (tIdx >= flowIdx) return;
  const note = await askNote('Move back to ' + STATUS[target].l);
  if (note === null) return;
  const body: Record<string, any> = {
    status: target,
    log: logged('Moved back to ' + STATUS[target].l + ' by SM — note: "' + note + '"'),
  };
  if (tIdx < FLOW.indexOf('assigned')) Object.assign(body, { auditor_id: null, auditor_name: null, auditor_email: null, shadower_email: null, shadower_name: null });
  if (tIdx < FLOW.indexOf('scheduled')) Object.assign(body, { slot: null, date: null });
  await patch(body, 'Moved back to ' + STATUS[target].l);
}

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

    try {
      const histRows = await sbGet('audit_orders?id=eq.' + o.id + '&select=audit_ticked_history');
      const hist = Array.isArray(histRows) && histRows[0] && Array.isArray(histRows[0].audit_ticked_history) ? histRows[0].audit_ticked_history : [];
      if (!hist.some((h: any) => h && h.sign && h.sign.img === fresh.sign.img)) {
        hist.push({ ...fresh, archivedAt: new Date().toISOString(), archivedReason: 'status-changed-to-' + st });
        await sbPatch('audit_orders', o.id, { audit_ticked_history: hist });
      }
    } catch { /* history is best-effort */ }
  }

  const isManualAtSite = st === 'atsite' && o.status !== 'atsite';
  const note = await askNote('Status → ' + STATUS[st].l);
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

async function setFollowUpDate() {
  if (!followUp) { toast('Pick a date first'); return; }
  const note = await askNote('Set follow-up to ' + fmtDate(followUp));
  if (note === null) return;
  await patch({ service: { ...(o.service || {}), follow_up_date: followUp }, log: logged('Follow-up set · Call client by ' + fmtDate(followUp) + ' — note: "' + note + '"') },
    'Follow-up set for ' + fmtDate(followUp));
}
async function clearFollowUp() {
  const note = await askNote('Clear follow-up');
  if (note === null) return;
  const svc = { ...(o.service || {}) };
  delete svc.follow_up_date;
  await patch({ service: svc, log: logged('Follow-up cleared — note: "' + note + '"') }, 'Follow-up cleared');
}

async function saveReschedFollowUp() {
  const rem = reschedRemark.trim();
  if (!rem) { toast('A note is required to save the follow-up'); return; }
  await patch({
    service: { ...(o.service || {}), ...(followUp ? { follow_up_date: followUp } : {}) },
    log: logged('Follow-up noted' + (followUp ? ' · Call client by ' + fmtDate(followUp) : '') + ' — note: "' + rem + '"'),
  }, 'Follow-up saved');
}

const linkedPre = useMemo(() => {
  const nm = o.name ? o.name.trim().toLowerCase() : null;
  return orders.find((r) => r.id !== o.id && r.status === 'slot_reserved' && r.slot === o.slot && r.date === o.date
    && ((r.po && r.po.length && r.po[0] === o.pi) || (nm && r.name && r.name.trim().toLowerCase() === nm))) || null;
}, [orders, o.id, o.pi, o.name, o.slot, o.date]);

const auditorRows = auditors.map((a) => {
  const cap = capFor(auditors, a.id, o.date);
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
  const note = await askNote('Assign auditor: ' + a.name);
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

async function saveCustomer() {
  const nm = custName.trim(), ph = custPhone.trim(), ad = custAddr.trim();
  if (!nm || !ph || !ad) { toast('Name, phone and address are all required'); return; }
  const changed: string[] = [];
  if (nm !== (o.name || '')) changed.push('name');
  if (ph !== (o.phone || '')) changed.push('phone');
  if (ad !== (o.addr || '')) changed.push('address');
  if (!changed.length) { toast('No changes to save'); return; }

  const saved = await patch({
    customer_name: nm, phone: ph, addr: ad,
    log: logged('Customer details corrected — ' + changed.join(', ') + ' updated'),
  }, 'Customer details updated');
  if (saved) setCustOpen(false);
}

async function saveBm() {
  const match = bmOptions.find((b) => (b.email || b.name) === bmPick);
  if (!match) { toast('Select a BM first'); return; }
  await patch({
    bm: match.name, ...(match.email ? { bm_email: match.email } : {}),
    log: logged('BM assigned: ' + match.name),
  }, 'BM updated');
}

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

    const rows = await sbGet('audit_orders?id=eq.' + o.id + '&select=audit_ticked');
    const t = Array.isArray(rows) && rows[0] ? rows[0].audit_ticked : ticked;
    if (!t) { toast('No job card data found for this order'); setPdfBusy(false); return; }
    await genAuditPDF({ pi: o.pi, customer_name: o.name, phone: o.phone, addr: o.addr, bm: o.bm, date: o.date }, t);
  } catch (e: any) {
    toast('PDF failed: ' + (e?.message || 'unknown error'));
  }
  setPdfBusy(false);
}

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

  return { addJourney, addRow, assignAuditor, auditorRows, bookSlot, cancelReservation, clearFollowUp, createService, delOrder, delRow, downloadPdf, markPreBookingFulfilled, pickAuditor, saveBm, saveCustomer, saveReschedFollowUp, saveService, saveShadowers, saveSlotChange, setFollowUpDate, setRow, setStatus, stepBack, toggleGrp };
}
