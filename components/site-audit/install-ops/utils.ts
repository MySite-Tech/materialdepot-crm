import { SQFT_PER_ROLL, publishSlotConfig, sbGet, staffCapOn } from '../shared';
import { LS_KEY_FL, LS_KEY_WP, DEFAULT_SLOTS_FL, DEFAULT_SLOTS_WP, FLOOR_DAY_CAP, WALLPANEL_DAY_CAP, WP_DAY_SLOTS, today } from './constants';
import { Assignment, InstallCategory, InstallOrder, Installer, SlotDef, Subjob } from './types';
export async function detectAuditBy(phone: string): Promise<'material_depot' | 'customer' | null> {
  if (!phone) return null;
  try {
    const rows = await sbGet('audit_orders?select=id&phone=eq.' + encodeURIComponent(phone) + '&status=neq.deleted&limit=1');
    if (!Array.isArray(rows)) return null;
    return rows.length ? 'material_depot' : 'customer';
  } catch {
    return null;
  }
}

export function typeDayCap(t: InstallCategory | null | undefined): number {
  return t === 'wallpaper' ? WP_DAY_SLOTS : t === 'wallpanel' ? WALLPANEL_DAY_CAP : FLOOR_DAY_CAP;
}

export function installerDayCap(a: Installer | null | undefined, ds: string | null | undefined): number {
  return staffCapOn(a, ds, typeDayCap(a?.type));
}

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

export function dstr(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
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
    status: reconciledOrderStatus(r.status || 'pending', r.subjobs || null),
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

export function assigneeStatus(sj: Subjob, a: Assignment): string {
  return (a && a.status) || sj.status || '';
}

export function subjobDisplayStatus(sj: Subjob): string {
  const asgns: Assignment[] = Array.isArray(sj.assignments) ? sj.assignments : [];
  if (!asgns.length) return sj.status;
  if (sj.status === 'partial' || sj.status === 'completed') return sj.status;
  if (asgns.every((a) => a.status === 'completed')) return 'completed';
  return sj.status;
}

export function assigneeProgress(sj: Subjob): Array<{ name: string; status: string; primary: boolean; ahead: boolean }> {
  const asgns: Assignment[] = Array.isArray(sj.assignments) ? sj.assignments : [];
  const anyPrimary = asgns.some((a) => a.primary);
  return asgns.map((a, i) => {
    const st = assigneeStatus(sj, a);
    return {
      name: a.installer_name || '—',
      status: st,
      primary: a.primary === true || (!anyPrimary && i === 0),

      ahead: !!a.status && a.status !== sj.status,
    };
  }).sort((x, y) => Number(y.primary) - Number(x.primary));
}

export function installerById(installers: Installer[], id: string | null | undefined) {
  return installers.find((a) => a.id === id) || null;
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

export function installerDayLoad(
  orders: InstallOrder[], inst: Installer, ds: string, excludeSjId?: string,
): number {
  let n = 0;
  orders.forEach((o) => (o.subjobs || []).forEach((sj) => {
    if (excludeSjId && sj.id === excludeSjId) return;
    if (sj.type !== inst.type) return;
    subjobAssignList(sj).forEach((a) => {
      if (a.installer_id !== inst.id) return;
      const dates = a.mode === 'custom' ? a.dates || [] : a.date ? [a.date] : [];
      if (!dates.includes(ds)) return;
      n += sj.type === 'wallpaper' ? slotsForWp(totalRolls(sj)) : 1;
    });
  }));
  return n;
}

export function installOrderHasDate(o: InstallOrder, ds: string): boolean {
  return (o.subjobs || []).some((sj) => subjobAssignList(sj).some((a) => (a.mode === 'custom' ? a.dates || [] : a.date ? [a.date] : []).includes(ds)));
}

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

export function hasOpenFollowUp(o: InstallOrder): boolean {
  return !!(o.service && o.service.follow_up_date) && o.status !== 'completed';
}

export function followUpDue(o: InstallOrder, todayStr: string): boolean {
  return hasOpenFollowUp(o) && o.service!.follow_up_date! <= todayStr;
}

export function needActionCount(orders: InstallOrder[]): number {
  const opsDue = orders.filter(opsCallDue).length;
  const todayStr = dstr(today);
  const fuDue = orders.filter((o) => followUpDue(o, todayStr)).length;
  const resched = orders.filter((o) => o.status === 'reschedule' || (o.subjobs || []).some((sj) => sj.status === 'reschedule')).length;
  return opsDue + fuDue + resched;
}

export function syncParentStatus(subjobs: Subjob[] | null, fallback: string): string {
  if (!subjobs || !subjobs.length) return fallback;

  const sts = subjobs.map(subjobDisplayStatus);
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

export function isSplit(o: InstallOrder): boolean {
  if (!o.subjobs) return false;
  const n = (t: InstallCategory) => o.subjobs!.filter((sj) => sj.type === t).length;
  return n('flooring') > 1 || n('wallpaper') > 1 || n('wallpanel') > 1;
}

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

export function sjDeliveryDate(o: InstallOrder, sj: Subjob): string | null {
  return sj.deliveryDate !== undefined ? sj.deliveryDate ?? null : o.deliveryDate;
}

export function sjCustomWp(o: InstallOrder, sj: Subjob): boolean {
  if (sj.customWp !== undefined && sj.customWp !== null) return !!sj.customWp;
  return sj.type === 'wallpaper' ? !!o.customWp : false;
}

export function sjShortLabel(o: InstallOrder, sj: Subjob): string {
  const tag = sj.type === 'wallpaper' ? 'WP' : sj.type === 'wallpanel' ? 'WPL' : 'FL';
  const sameType = (o.subjobs || []).filter((s) => s.type === sj.type).length;
  if (sameType < 2) return tag;
  const suffix = sj.type === 'wallpaper'
    ? (sjCustomWp(o, sj) ? 'Custom' : 'Std')
    : (sj.items && sj.items[0] && sj.items[0].sku) || '';
  return suffix ? tag + ' · ' + suffix : tag;
}

export function sjEffectiveAssignments(sj: Subjob): Assignment[] {
  if (Array.isArray(sj.assignments) && sj.assignments.length) return sj.assignments;
  if (sj.installer_email || sj.installer) {
    return [{ installer_id: sj.installer || '', installer_email: sj.installer_email || '', installer_name: '', mode: 'standard', date: sj.date, dates: [], primary: true }];
  }
  return [];
}

const TRAVEL_STATUSES = ['scheduled', 'assigned', 'callpending', 'onway', 'atsite'];

function reconciledOrderStatus(stored: string, subjobs: Subjob[] | null): string {
  if (!subjobs || !subjobs.length) return stored;
  if (!TRAVEL_STATUSES.includes(stored)) return stored;
  return syncParentStatus(subjobs, stored);
}

function subjobAssignList(sj: Subjob): Array<{ installer_id?: string; date?: string | null; dates?: string[]; mode: string }> {
  if (sj.assignments && sj.assignments.length) return sj.assignments;
  return sj.installer ? [{ installer_id: sj.installer, date: sj.date, dates: [], mode: 'standard' }] : [];
}
