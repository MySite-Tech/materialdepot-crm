/* Audit Ops (Service Manager, audit side) — data model + pure business logic,
   ported from material-depot-site's SM_Audit_Dashboard.html.

   Same porting convention as install-ops/shared.ts: the source keeps
   ORDERS/AUDITORS/CAPS as module-level mutable arrays that every helper reads
   directly; here each helper takes them as parameters so the identical maths
   runs against React state. The one genuine module-level thing kept as-is is
   CAPS, because in the source it is a device-local localStorage setting too. */

import { offDayReason, publishSlotConfig, staffCapOn } from '../siteAuditShared';
import type { Availability, StaffCaps } from '../siteAuditShared';

export const AUDIT_SKU = 'SVC-AUDIT-001';

export interface AuditSkuRow {
  sku: string;
  name: string;
  link?: string;
}

export interface AuditService {
  flooring?: AuditSkuRow[];
  wallpaper?: AuditSkuRow[];
  follow_up_date?: string | null;
  rectification_of?: string;
  rectification_raised?: boolean;
  rectification_pi?: string;
  rectification_type?: 'audit' | 'install';
  issue?: string;
}

export interface AuditLogEntry {
  t: string;
  d: string;
  by?: 'auto' | 'manual';
  who?: string;
}

export interface AuditOrder {
  id: string;
  pi: string;
  po: string[];
  skus: Array<{ c: string; n: string; audit?: boolean }>;
  auditTicked: any;
  /* What the STORE said the audit is for, carried over from the pre-booking
     row this audit was raised from (its `po` is this row's `pi`). Separate from
     `auditTicked` so the two can never be mistaken for each other: one is what
     the order itself declares, the other is what the store booked the slot for. */
  storeCategories: string[];
  bm: string;
  bmEmail: string | null;
  name: string;
  phone: string;
  addr: string;
  status: string;
  service: AuditService | null;
  slot: string | null;
  date: string | null;
  auditor: string | null;
  auditorName: string | null;
  auditorEmail: string | null;
  shadowerEmail: string | null;
  shadowerName: string | null;
  city: string;
  log: AuditLogEntry[];
}

export interface Auditor extends Availability, StaffCaps {
  id: string;
  name: string;
  email: string;
  phone: string;
  zone: string;
  activeFrom: string | null;
  city: string;
}

export const AUDIT_COLS =
  'id,pi,po,skus,bm,bm_email,customer_name,phone,addr,status,service,slot,date,auditor_id,auditor_name,auditor_email,shadower_email,shadower_name,log,created_by_email,city';

export function mapAuditRow(r: any): AuditOrder {
  return {
    id: r.id,
    pi: r.pi || '',
    po: r.po ? String(r.po).split(',').map((s: string) => s.trim()).filter(Boolean) : [],
    skus: r.skus || [],
    /* Filled in by `applyAuditCategories` after the list loads — `audit_ticked`
       is deliberately NOT in AUDIT_COLS (it also carries the job card's room
       photos, and Postgres detoasts the whole blob per row). */
    auditTicked: null,
    storeCategories: [],
    bm: r.bm || '—',
    bmEmail: r.bm_email || null,
    name: r.customer_name || '',
    phone: r.phone || '',
    addr: r.addr || '',
    status: r.status || 'pending',
    service: r.service || null,
    slot: r.slot || null,
    date: r.date || null,
    auditor: r.auditor_id || null,
    auditorName: r.auditor_name || null,
    auditorEmail: r.auditor_email || null,
    shadowerEmail: r.shadower_email || null,
    shadowerName: r.shadower_name || null,
    city: r.city || 'Bengaluru',
    log: r.log || [],
  };
}

export const STATUS: Record<string, { l: string; badge: string }> = {
  slot_reserved: { l: 'Pre-booked (Store)', badge: 'bg-sky-100 text-sky-800' },
  slot_converted: { l: 'Pre-booking Fulfilled', badge: 'bg-green-100 text-green-700' },
  pending: { l: 'Pending', badge: 'bg-gray-100 text-gray-600' },
  created: { l: 'Service Created', badge: 'bg-sky-100 text-sky-700' },
  call_na: { l: 'Call not picked', badge: 'bg-red-100 text-red-700' },
  scheduled: { l: 'Site Audit Scheduled', badge: 'bg-sky-100 text-sky-700' },
  assigned: { l: 'Site Auditor Assigned', badge: 'bg-purple-100 text-purple-700' },
  callpending: { l: 'Call Pending (Auditor)', badge: 'bg-purple-100 text-purple-700' },
  reschedule: { l: 'To Reschedule', badge: 'bg-red-100 text-red-700' },
  onway: { l: 'On The Way', badge: 'bg-amber-100 text-amber-700' },
  atsite: { l: 'At Site', badge: 'bg-amber-100 text-amber-700' },
  completed: { l: 'Site Audit Completed', badge: 'bg-green-100 text-green-700' },
};

/* Statuses the AUDITOR normally sets from their own app (shown as AUTO in the
   manual-override menu), and the forward flow the drawer's stepper walks. */
export const AUTO_STATUSES = ['onway', 'atsite', 'completed'];
export const FLOW = ['pending', 'created', 'scheduled', 'assigned', 'completed'];
export const FLOW_LABELS = ['Pending', 'Service created', 'Scheduled', 'Auditor assigned', 'Completed'];

/* Statuses that occupy a slot / can conflict with another booking. */
const BOOKED = ['scheduled', 'assigned', 'callpending', 'onway', 'atsite', 'completed', 'slot_reserved'];
const CONFLICT_STATUSES = ['scheduled', 'assigned', 'callpending', 'onway', 'atsite', 'slot_reserved'];

export const FOLLOWUP_ACTIVE_STATUSES = ['created', 'call_na', 'reschedule'];

export function hasOpenFollowUp(o: AuditOrder): boolean {
  return !!(o.service && o.service.follow_up_date) && FOLLOWUP_ACTIVE_STATUSES.includes(o.status);
}

/* Where the stepper considers an order to be, collapsing the auditor's live
   statuses onto "assigned" and the two sidetracks onto "created". */
export function flowIndexOf(status: string): number {
  if (['assigned', 'onway', 'atsite'].includes(status)) return FLOW.indexOf('assigned');
  if (status === 'completed') return FLOW.length - 1;
  if (status === 'call_na' || status === 'reschedule') return FLOW.indexOf('created');
  return FLOW.indexOf(status);
}

/* ── Slots (device-local, exactly as in the source) ───────────────────── */
export interface SlotDef { id: string; label: string }
export const DEFAULT_AUDIT_SLOTS_FL: SlotDef[] = [
  { id: 'sf1', label: '9 AM – 12 PM' },
  { id: 'sf2', label: '12 PM – 3 PM' },
  { id: 'sf3', label: '3 PM – 6 PM' },
];
export const DEFAULT_AUDIT_SLOTS_WP: SlotDef[] = [
  { id: 'sw1', label: '9 AM – 12 PM' },
  { id: 'sw2', label: '12 PM – 3 PM' },
  { id: 'sw3', label: '3 PM – 6 PM' },
];
export function loadAuditSlots(kind: 'fl' | 'wp'): SlotDef[] {
  const fallback = kind === 'fl' ? DEFAULT_AUDIT_SLOTS_FL : DEFAULT_AUDIT_SLOTS_WP;
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(kind === 'fl' ? 'md_audit_slots_fl' : 'md_audit_slots_wp');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch { /* malformed override — use defaults */ }
  return fallback;
}
export function saveAuditSlots(kind: 'fl' | 'wp', slots: SlotDef[]) {
  const key = kind === 'fl' ? 'md_audit_slots_fl' : 'md_audit_slots_wp';
  try { localStorage.setItem(key, JSON.stringify(slots)); } catch { /* best-effort */ }
  // …and share them, so people reading these ids on another device (shadowers
  // especially) see the office's labels rather than the stock ones.
  void publishSlotConfig(key, slots);
}

/* An audit slot is a HH:MM visit time (the SM books an exact time); the older
   window ids (sf1/sw2…) still appear on historical rows. */
export function slotLabel(id: string | null | undefined, slots: SlotDef[]): string {
  if (!id) return '—';
  const found = slots.find((s) => s.id === id);
  if (found) return found.label;
  if (/^\d{1,2}:\d{2}$/.test(id)) {
    const [h, m] = id.split(':').map(Number);
    const ap = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
  }
  return '—';
}

/* ── Dates ────────────────────────────────────────────────────────────── */
export function dstr(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
export const today = (() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; })();
if (typeof window !== 'undefined') {
  // This board stays open across a full shift — keep `today` from going stale
  // past midnight (same in-place mutation as install-ops/shared.ts).
  setInterval(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (now.getTime() !== today.getTime()) today.setTime(now.getTime());
  }, 60000);
}
export function addDays(n: number): Date {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  return d;
}
export function fmtDate(ds: string | null | undefined): string {
  if (!ds) return '—';
  return new Date(ds + 'T00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

/* ── Per-auditor, per-date caps ────────────────────────────────────────
   Caps live on the roster row itself (`profiles.daily_cap` /
   `profiles.cap_overrides`, see siteAuditShared's StaffCaps), so the SM, the
   other SM and the public Store Team kiosk all read one number. They used to
   sit in localStorage under `md_audit_caps` — device-local, which meant the
   kiosk could not see them at all and counted raw headcount instead. */
export const DEFAULT_CAP = 3;

/* Effective cap for an auditor on a date: zero before their start date and on
   a weekly off / leave day, otherwise their per-date override, then their own
   default, then DEFAULT_CAP. */
export function capFor(auditors: Auditor[], aid: string, ds: string | null): number {
  if (!ds) return DEFAULT_CAP;
  return staffCapOn(auditors.find((x) => x.id === aid), ds, DEFAULT_CAP);
}
export function offReason(a: Auditor, ds: string | null): string {
  return offDayReason(a, ds);
}
/* Auditors available on a date = those with cap >= 1; total daily throughput
   = the sum of their caps. Both are what the Store Team kiosk counts against —
   pass it a CITY-SCOPED list, or a Bengaluru store ends up counting idle
   Hyderabad auditors (which is exactly what the kiosk did until 2026-09-02). */
export function auditorsAvailable(auditors: Auditor[], ds: string): number {
  return auditors.filter((a) => capFor(auditors, a.id, ds) >= 1).length;
}
export function dailyTotalCap(auditors: Auditor[], ds: string): number {
  return auditors.reduce((s, a) => s + capFor(auditors, a.id, ds), 0);
}

/* ── Load / conflict ──────────────────────────────────────────────────── */
export function slotUsage(orders: AuditOrder[], date: string, slotId: string): number {
  return orders.filter((o) => o.date === date && o.slot === slotId && BOOKED.includes(o.status)).length;
}
export function auditorLoad(orders: AuditOrder[], aid: string, date: string | null, excludeId?: string): number {
  if (!date) return 0;
  return orders.filter((o) => o.auditor === aid && o.date === date && o.id !== excludeId && ['assigned', 'onway', 'atsite', 'completed'].includes(o.status)).length;
}

/* The 2-hour travel rule: an auditor's visits are treated as 1 hour long, and
   another booking that overlaps — or sits less than 120 minutes either side —
   is a conflict. Soft: the SM may override it with a confirmation, because two
   nearby sites can genuinely be done back to back. */
export function auditorConflictOrder(
  orders: AuditOrder[], aid: string, date: string | null, slotTime: string | null, excludeId?: string, excludeId2?: string | null,
): AuditOrder | null {
  if (!date || !slotTime || !/^\d{1,2}:\d{2}$/.test(slotTime)) return null;
  const [h, m] = slotTime.split(':').map(Number);
  const newStart = h * 60 + m, newEnd = newStart + 60;
  return orders.find((o) => {
    if (o.auditor !== aid || o.date !== date) return false;
    if (o.id === excludeId || (excludeId2 && o.id === excludeId2)) return false;
    if (!CONFLICT_STATUSES.includes(o.status)) return false;
    if (!o.slot || !/^\d{1,2}:\d{2}$/.test(o.slot)) return false;
    const [oh, om] = o.slot.split(':').map(Number);
    const oStart = oh * 60 + om, oEnd = oStart + 60;
    const gapAB = newStart - oEnd, gapBA = oStart - newEnd;
    return (gapAB < 0 && gapBA < 0) || (gapAB >= 0 && gapAB < 120) || (gapBA >= 0 && gapBA < 120);
  }) || null;
}

/* The statuses whose `audit_ticked` is nothing but the ticked-category list.
   Until the auditor starts the visit the job card does not exist, so the column
   is a handful of bytes a row and safe to pull for a whole list; from `onway`
   onwards it carries the room photos and is the query that times out over the
   full table (see the detoast note in CLAUDE.md). Every one of these statuses
   is also exactly where the SM needs to know what material the audit is for —
   before it happens, not after. */
export const PRE_CARD_STATUSES = [
  'slot_reserved', 'slot_converted', 'pending', 'created', 'call_na',
  'scheduled', 'assigned', 'callpending', 'reschedule',
];

/* The supplementary query that fills `auditTicked` for those rows. Kept apart
   from AUDIT_COLS on purpose: widening AUDIT_COLS would put the job card in
   every list select in this app. */
export const AUDIT_CATEGORY_QUERY =
  'audit_orders?select=id,pi,po,status,audit_ticked&status=in.(' + PRE_CARD_STATUSES.join(',') + ')';

/* Merge the narrow category rows into an already-mapped order list, and carry a
   store pre-booking's categories over to the audit it became.

   The carry-over matters because the two halves of one job are two rows: the
   store ticks the material when it books the slot, but the audit row is created
   later from the OMS, whose only SKU at that point is the audit service line —
   so `tickedCategories` in autoImportAuditOrders yields [] and the SM sees no
   material at all (true of every live pending audit as of 2026-08-26). The link
   is the pre-booking's `po` === the audit's `pi`, exactly as in
   `dropSupersededPreBookings` — never the name or the phone, which are free
   text on the reservation form. */
export function applyAuditCategories(orders: AuditOrder[], catRows: any[]): AuditOrder[] {
  const own = new Map<string, any>();
  const fromStore = new Map<string, string[]>();
  for (const r of catRows) {
    if (!r || !r.id) continue;
    own.set(String(r.id), r.audit_ticked);
    const isPre = r.status === 'slot_reserved' || r.status === 'slot_converted';
    const cats = Array.isArray(r.audit_ticked) ? r.audit_ticked.filter(Boolean) : [];
    if (isPre && r.po && cats.length) {
      /* `po` is a single enquiry id on a reservation, but the column is shared
         with real orders that carry a comma-separated list. */
      String(r.po).split(',').map((x) => x.trim()).filter(Boolean)
        .forEach((pi) => { if (!fromStore.has(pi)) fromStore.set(pi, cats); });
    }
  }
  if (!own.size) return orders;
  return orders.map((o) => {
    const mine = own.has(String(o.id)) ? own.get(String(o.id)) : o.auditTicked;
    const store = fromStore.get(o.pi) || [];
    if (mine === o.auditTicked && !store.length) return o;
    return { ...o, auditTicked: mine, storeCategories: store };
  });
}

/* Category pills for the orders table: the auditor's ticked categories if
   present, else the v2 job card's rooms, else the created service, and finally
   what the store booked the slot for — which is the only signal that exists on
   an audit the OMS raised with nothing but the service line on it. */
export function orderCategories(o: AuditOrder): string[] {
  const at = o.auditTicked;
  if (Array.isArray(at) && at.length) return at.filter(Boolean);
  if (at && Array.isArray(at.rooms) && at.rooms.length) {
    return [...new Set(at.rooms.map((r: any) => (r.category === 'wallpaper' || r.type === 'wallpaper' ? 'Wallpaper' : 'Flooring')))] as string[];
  }
  const out: string[] = [];
  if (o.service?.flooring?.length) out.push('Flooring');
  if (o.service?.wallpaper?.length) out.push('Wallpaper');
  if (out.length) return out;
  return o.storeCategories || [];
}

/* True when the pills above came from the store's pre-booking rather than from
   the order itself — the SM should be able to see which of the two they are
   reading, since only one of them was ticked by someone who saw the cart. */
export function categoriesAreFromStore(o: AuditOrder): boolean {
  const at = o.auditTicked;
  if (Array.isArray(at) && at.length) return false;
  if (at && Array.isArray(at.rooms) && at.rooms.length) return false;
  if (o.service?.flooring?.length || o.service?.wallpaper?.length) return false;
  return (o.storeCategories || []).length > 0;
}

export function auditorById(auditors: Auditor[], id: string | null | undefined) {
  return auditors.find((a) => a.id === id) || null;
}
export function auditorNameOf(o: AuditOrder, auditors: Auditor[]): string | null {
  if (!o.auditor) return null;
  const a = auditorById(auditors, o.auditor);
  return a ? a.name : o.auditorName || '?';
}

export function mapUrl(a: string) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a);
}

export type AuditViewKey =
  | 'orders' | 'schedule' | 'reschedule' | 'followups' | 'calendar'
  | 'slots' | 'auditors' | 'deleted' | 'rectifications';
