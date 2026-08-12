/* Pure business-logic helpers ported verbatim (algorithms unchanged) from
   material-depot-site's app/src/pages/SMInstall.jsx. The source keeps
   ORDERS/INSTALLERS/SLOTS_FL/SLOTS_WP as module-level mutable arrays that
   every helper reads directly; here every helper takes the arrays as
   parameters instead, so the same math works against React state without
   reintroducing module-level mutable globals. */

import { SQFT_PER_ROLL, publishSlotConfig } from '../siteAuditShared';
import type { Assignment, InstallCategory, InstallOrder, Installer, SlotDef, Subjob } from './types';

export { SQFT_PER_ROLL };

export const INSTALL_SKU = 'SVC-INSTALL-001';
export const CUSTOM_WP_SKU = 'WP-CUST';
export const FLOOR_DAY_CAP = 1;
export const WP_DAY_SLOTS = 3;
export const WALLPANEL_DAY_CAP = 1;   // wall-panel jobs/installer/day — mirrors flooring's full-day cadence

export const DEFAULT_SLOTS_FL: SlotDef[] = [
  { id: 'sf1', label: '9 AM – 12 PM' },
  { id: 'sf2', label: '12 PM – 3 PM' },
  { id: 'sf3', label: '3 PM – 6 PM' },
];
export const DEFAULT_SLOTS_WP: SlotDef[] = [
  { id: 'sw1', label: '8:00 AM – 11:00 AM' },
  { id: 'sw2', label: '11:00 AM – 2:00 PM' },
  { id: 'sw3', label: '2:00 PM – 5:00 PM' },
];

const LS_KEY_FL = 'md_install_slots_fl';
const LS_KEY_WP = 'md_install_slots_wp';

export function loadSlots(kind: 'fl' | 'wp'): SlotDef[] {
  const fallback = kind === 'fl' ? DEFAULT_SLOTS_FL : DEFAULT_SLOTS_WP;
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(kind === 'fl' ? LS_KEY_FL : LS_KEY_WP);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {
    /* malformed local override — fall back to defaults */
  }
  return fallback;
}
export function saveSlots(kind: 'fl' | 'wp', slots: SlotDef[]) {
  const key = kind === 'fl' ? LS_KEY_FL : LS_KEY_WP;
  try {
    localStorage.setItem(key, JSON.stringify(slots));
  } catch {
    /* best-effort local persistence */
  }
  // …and share them, so people reading these ids on another device (shadowers
  // especially) see the office's labels rather than the stock ones.
  void publishSlotConfig(key, slots);
}

export function slotsForWp(rolls: number): number {
  const r = Number(rolls) || 0;
  return r <= 3 ? 1 : r <= 6 ? 2 : 3;
}
export function totalRolls(sj: Subjob): number {
  return (sj.items || []).reduce((s, it) => s + Math.ceil((parseFloat(it.sqft as any) || 0) / SQFT_PER_ROLL), 0);
}
export function dateRange(from: string, to: string): string[] {
  if (!from || !to || from > to) return from ? [from] : [];
  const out: string[] = [];
  let d = new Date(from + 'T00:00');
  const end = new Date(to + 'T00:00');
  while (d <= end) {
    out.push(dstr(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/* Local-date helpers (dstr/today/addDays), matching material-depot-site's
   lib/dates.js and the pattern already used in SiteAuditStoreTeamView.tsx /
   SiteInstallerApp.tsx elsewhere in this CRM. */
export function dstr(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
export const today = (() => {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
})();
// This SM dashboard realistically stays open across a full shift (60s poll
// in SiteAuditInstallOpsView.tsx) — without this, `today` would freeze at
// whatever date the tab was opened on and silently go stale past midnight,
// throwing off opsCallDue/minDate/the calendar strip/installer load lookups.
// Mutating the same Date object in place (not reassigning) means every
// existing `today` reference — and anything built from it via addDays, which
// re-reads `today` on each call — picks up the change automatically.
if (typeof window !== 'undefined') {
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
  const d = new Date(ds + 'T00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export const STATUS: Record<string, { l: string; badge: string }> = {
  pending: { l: 'Pending', badge: 'bg-gray-100 text-gray-600' },
  deliv_ontime: { l: 'Delivery on time', badge: 'bg-green-100 text-green-700' },
  deliv_delayed: { l: 'Delivery Delayed', badge: 'bg-red-100 text-red-700' },
  created: { l: 'Service Created', badge: 'bg-purple-100 text-purple-700' },
  call_na: { l: 'Call not picked', badge: 'bg-red-100 text-red-700' },
  scheduled: { l: 'Site Installation Scheduled', badge: 'bg-sky-100 text-sky-700' },
  assigned: { l: 'Site Installer Assigned', badge: 'bg-amber-100 text-amber-700' },
  callpending: { l: 'Call Pending (Installer)', badge: 'bg-amber-100 text-amber-700' },
  reschedule: { l: 'To Reschedule', badge: 'bg-red-100 text-red-700' },
  onway: { l: 'On The Way', badge: 'bg-blue-100 text-blue-700' },
  atsite: { l: 'At Site', badge: 'bg-indigo-100 text-indigo-700' },
  partial: { l: 'Partially Completed', badge: 'bg-teal-100 text-teal-700' },
  completed: { l: 'Site Installation Completed', badge: 'bg-green-100 text-green-700' },
};
export const AUTO_STATUSES = ['onway', 'atsite', 'completed'];

export function mapUrl(a: string) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a);
}

export function mapInstallRow(r: any): InstallOrder {
  return {
    city: r.city || 'Bengaluru',
    id: r.id,
    pi: r.pi || '',
    po: r.po ? String(r.po).split(',').map((s: string) => s.trim()).filter(Boolean) : [],
    skus: r.skus || [],
    bm: r.bm || '—',
    name: r.customer_name || '',
    phone: r.phone || '',
    addr: r.addr || '',
    matchedAudit: r.matched_audit || false,
    auditBy: (r.service && r.service.audit_by) || null,
    deliveryDate: r.delivery_date || null,
    customWp: r.custom_wp || false,
    status: r.status || 'pending',
    subjobs: r.subjobs || null,
    service: r.service || null,
    log: r.log || [],
  };
}

export function slotLabel(id: string | null | undefined, slotsFl: SlotDef[], slotsWp: SlotDef[]): string {
  if (!id) return '—';
  const found = [...slotsFl, ...slotsWp].find((s) => s.id === id);
  if (found) return found.label;
  if (/^\d{1,2}:\d{2}$/.test(id)) {
    const [h, m] = id.split(':').map(Number);
    const ap = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
  }
  return '—';
}

export function installerById(installers: Installer[], id: string | null | undefined) {
  return installers.find((a) => a.id === id) || null;
}

function subjobAssignList(sj: Subjob): Array<{ installer_id?: string; date?: string | null; dates?: string[]; mode: string }> {
  if (sj.assignments && sj.assignments.length) return sj.assignments;
  return sj.installer ? [{ installer_id: sj.installer, date: sj.date, dates: [], mode: 'standard' }] : [];
}

export function opsCallDue(o: InstallOrder): boolean {
  if (!['pending', 'deliv_delayed', 'call_na'].includes(o.status)) return false;
  if (!o.deliveryDate) return false;
  const dd = new Date(o.deliveryDate + 'T00:00');
  const daysToDelivery = Math.round((dd.getTime() - today.getTime()) / 86400000);
  return o.customWp ? daysToDelivery <= 3 : daysToDelivery <= 1;
}

export function flLoad(orders: InstallOrder[], id: string, date: string): number {
  let n = 0;
  orders.forEach((o) => (o.subjobs || []).forEach((sj) => {
    if (sj.type !== 'flooring') return;
    subjobAssignList(sj).forEach((a) => {
      if (a.installer_id !== id) return;
      const dates = a.mode === 'custom' ? a.dates || [] : a.date ? [a.date] : [];
      if (dates.includes(date)) n++;
    });
  }));
  return n;
}
/* Wall panels follow flooring's full-day cadence — 1 job per installer per day. */
export function wpnlLoad(orders: InstallOrder[], id: string, date: string): number {
  let n = 0;
  orders.forEach((o) => (o.subjobs || []).forEach((sj) => {
    if (sj.type !== 'wallpanel') return;
    subjobAssignList(sj).forEach((a) => {
      if (a.installer_id !== id) return;
      const dates = a.mode === 'custom' ? a.dates || [] : a.date ? [a.date] : [];
      if (dates.includes(date)) n++;
    });
  }));
  return n;
}
export function wpSlotLoad(orders: InstallOrder[], id: string, date: string): number {
  let n = 0;
  orders.forEach((o) => (o.subjobs || []).forEach((sj) => {
    if (sj.type !== 'wallpaper') return;
    subjobAssignList(sj).forEach((a) => {
      if (a.installer_id !== id) return;
      const dates = a.mode === 'custom' ? a.dates || [] : a.date ? [a.date] : [];
      if (dates.includes(date)) n += slotsForWp(totalRolls(sj));
    });
  }));
  return n;
}
export function installOrderHasDate(o: InstallOrder, ds: string): boolean {
  return (o.subjobs || []).some((sj) => subjobAssignList(sj).some((a) => (a.mode === 'custom' ? a.dates || [] : a.date ? [a.date] : []).includes(ds)));
}

/* All (order, subjob) pairs that have an installer assignment landing on
   date `ds` — used by both the "Today's installs" table and the Calendar
   day columns/detail panel. */
export function sjsForDay(orders: InstallOrder[], installers: Installer[], ds: string): Array<{ o: InstallOrder; sj: Subjob }> {
  const res: Array<{ o: InstallOrder; sj: Subjob }> = [];
  orders.forEach((o) => (o.subjobs || []).forEach((sj) => {
    const asgns: Assignment[] = sj.assignments && sj.assignments.length
      ? sj.assignments
      : sj.installer
        ? [{ installer_id: sj.installer, installer_name: (installerById(installers, sj.installer) || { name: '?' } as Installer).name, date: sj.date, mode: 'standard', primary: true, dates: [] }]
        : [];
    if (asgns.some((a) => { const dates = a.mode === 'custom' ? a.dates || [] : a.date ? [a.date] : []; return dates.includes(ds); })) res.push({ o, sj });
  }));
  return res;
}
export function needActionCount(orders: InstallOrder[]): number {
  const opsDue = orders.filter(opsCallDue).length;
  const todayStr = dstr(today);
  const fuDue = orders.filter((o) => o.service && o.service.follow_up_date && o.service.follow_up_date <= todayStr).length;
  const resched = orders.filter((o) => o.status === 'reschedule' || (o.subjobs || []).some((sj) => sj.status === 'reschedule')).length;
  return opsDue + fuDue + resched;
}

/* Pure version of the source's syncParent(o) — returns the rolled-up parent
   status instead of mutating `o.status` in place. */
export function syncParentStatus(subjobs: Subjob[] | null, fallback: string): string {
  if (!subjobs || !subjobs.length) return fallback;
  const sts = subjobs.map((s) => s.status);
  if (sts.every((s) => s === 'completed')) return 'completed';
  if (sts.some((s) => s === 'completed') && sts.some((s) => s !== 'completed')) return 'partial';
  if (sts.some((s) => ['onway', 'atsite'].includes(s))) return sts.find((s) => ['onway', 'atsite'].includes(s))!;
  if (sts.some((s) => s === 'reschedule')) return 'reschedule';
  if (sts.every((s) => s === 'assigned')) return 'assigned';
  if (sts.some((s) => s === 'assigned')) return 'assigned';
  if (sts.some((s) => s === 'scheduled')) return 'scheduled';
  if (sts.every((s) => s === 'created')) return 'created';
  return fallback;
}

export function initials(n?: string | null) {
  return (n || '').split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase();
}

export function fmtLogLocal(d?: string | null): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) {
    const m = String(d).match(/\d{1,2}:\d{2}\s*(?:[AP]M)?/i);
    return m ? m[0] + ' (date unknown)' : '—';
  }
  const ts = dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) + ' · ' + ts;
}

export function emptySkuRow(grp: InstallCategory) {
  return grp === 'wallpaper' ? { sku: '', name: '', sqft: '' } : { sku: '', name: '', sqft: '', link: '' };
}
export function skuQtyField(grp: InstallCategory) {
  if (grp === 'wallpaper') return { label: 'Area to be wallpapered (sq.ft)', ph: 'e.g. 120' };
  if (grp === 'wallpanel') return { label: 'Area of wall panel installation (sq.ft)', ph: 'e.g. 150' };
  return { label: 'Area of installation (sq.ft)', ph: 'e.g. 180' };
}
export function rollHintText(sqft: string | number | undefined) {
  const n = parseFloat(String(sqft ?? '')) || 0;
  if (!n) return SQFT_PER_ROLL + ' sq.ft = 1 roll, rounded up';
  const r = Math.ceil(n / SQFT_PER_ROLL);
  return '= ' + r + ' roll' + (r === 1 ? '' : 's') + ' · ' + SQFT_PER_ROLL + ' sq.ft = 1 roll';
}

/* ── Per-SKU sub-job split / merge ─────────────────────────────────────────
   A category's sub-job can be split so some of its SKUs move into their own
   sub-job with an independent installer, date, delivery and job card (e.g. a
   standard + a customized wallpaper delivered on different days). All of the
   existing per-sub-job machinery already handles N same-type sub-jobs
   generically, so splitting needs no new tracking concepts. */

/* True once a CATEGORY has been split into 2+ sub-jobs. Distinct from a plain
   mixed (1 flooring + 1 wallpaper) order — the flat SKU editor can't map back
   onto 2+ same-type sub-jobs, so it hides itself when this is true. */
export function isSplit(o: InstallOrder): boolean {
  if (!o.subjobs) return false;
  const n = (t: InstallCategory) => o.subjobs!.filter((sj) => sj.type === t).length;
  return n('flooring') > 1 || n('wallpaper') > 1 || n('wallpanel') > 1;
}

/* Mint a stable, collision-free sub-job id: the base (sj_fl/sj_wp/sj_wpl)
   counts as suffix 0, new ids are max-existing-suffix + 1, so an id is never
   re-issued even after a merge-then-resplit (a length-based id would). Never
   keyed on SKU code — codes can repeat. */
export function mintSubjobId(o: InstallOrder, baseType: InstallCategory): string {
  const base = baseType === 'wallpaper' ? 'sj_wp' : baseType === 'wallpanel' ? 'sj_wpl' : 'sj_fl';
  const re = new RegExp('^' + base + '(?:_(\\d+))?$');
  let mx = -1;
  (o.subjobs || []).forEach((sj) => {
    const m = re.exec(sj.id || '');
    if (m) mx = Math.max(mx, m[1] ? parseInt(m[1], 10) : 0);
  });
  return base + '_' + (mx + 1);
}

/* Fallback accessors — a sub-job's own field wins once an SM has diverged it
   (split orders), otherwise the order-level field applies, so nothing needs a
   backfill migration. */
export function sjDeliveryDate(o: InstallOrder, sj: Subjob): string | null {
  return sj.deliveryDate !== undefined ? sj.deliveryDate ?? null : o.deliveryDate;
}
export function sjCustomWp(o: InstallOrder, sj: Subjob): boolean {
  if (sj.customWp !== undefined && sj.customWp !== null) return !!sj.customWp;
  return sj.type === 'wallpaper' ? !!o.customWp : false;
}

/* Short per-sub-job label distinguishing 2+ same-type sub-jobs in list and
   calendar UIs: plain FL/WP/WPL when the category isn't split, plus
   Custom/Std (or the first SKU) when it is. */
export function sjShortLabel(o: InstallOrder, sj: Subjob): string {
  const tag = sj.type === 'wallpaper' ? 'WP' : sj.type === 'wallpanel' ? 'WPL' : 'FL';
  const sameType = (o.subjobs || []).filter((s) => s.type === sj.type).length;
  if (sameType < 2) return tag;
  const suffix = sj.type === 'wallpaper'
    ? (sjCustomWp(o, sj) ? 'Custom' : 'Std')
    : (sj.items && sj.items[0] && sj.items[0].sku) || '';
  return suffix ? tag + ' · ' + suffix : tag;
}

/* Assignment list of a sub-job, with a legacy single-installer sub-job
   normalised into the same shape. */
export function sjEffectiveAssignments(sj: Subjob): Assignment[] {
  if (Array.isArray(sj.assignments) && sj.assignments.length) return sj.assignments;
  if (sj.installer_email || sj.installer) {
    return [{ installer_id: sj.installer || '', installer_email: sj.installer_email || '', installer_name: '', mode: 'standard', date: sj.date, dates: [], primary: true }];
  }
  return [];
}
