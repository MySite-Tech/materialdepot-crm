import { offDayReason, publishSlotConfig, staffCapOn } from '../shared';
import { CONFLICT_STATUSES, FOLLOWUP_ACTIVE_STATUSES } from './constants';
import { DEFAULT_AUDIT_SLOTS_FL, DEFAULT_AUDIT_SLOTS_WP, DEFAULT_CAP, FLOW, today } from './constants';
import { AuditOrder, Auditor, SlotDef } from './types';
export function mapAuditRow(r: any): AuditOrder {
  return {
    id: r.id,
    pi: r.pi || '',
    po: r.po ? String(r.po).split(',').map((s: string) => s.trim()).filter(Boolean) : [],
    skus: r.skus || [],

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

export function hasOpenFollowUp(o: AuditOrder): boolean {
  return !!(o.service && o.service.follow_up_date) && FOLLOWUP_ACTIVE_STATUSES.includes(o.status);
}

export function flowIndexOf(status: string): number {
  if (['assigned', 'onway', 'atsite'].includes(status)) return FLOW.indexOf('assigned');
  if (status === 'completed') return FLOW.length - 1;
  if (status === 'call_na' || status === 'reschedule') return FLOW.indexOf('created');
  return FLOW.indexOf(status);
}

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

  void publishSlotConfig(key, slots);
}

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
  return new Date(ds + 'T00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function capFor(auditors: Auditor[], aid: string, ds: string | null): number {
  if (!ds) return DEFAULT_CAP;
  return staffCapOn(auditors.find((x) => x.id === aid), ds, DEFAULT_CAP);
}

export function offReason(a: Auditor, ds: string | null): string {
  return offDayReason(a, ds);
}

export function dailyTotalCap(auditors: Auditor[], ds: string): number {
  return auditors.reduce((s, a) => s + capFor(auditors, a.id, ds), 0);
}

export function auditorLoad(orders: AuditOrder[], aid: string, date: string | null, excludeId?: string): number {
  if (!date) return 0;
  return orders.filter((o) => o.auditor === aid && o.date === date && o.id !== excludeId && ['assigned', 'onway', 'atsite', 'completed'].includes(o.status)).length;
}

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

export function applyAuditCategories(orders: AuditOrder[], catRows: any[]): AuditOrder[] {
  const own = new Map<string, any>();
  const fromStore = new Map<string, string[]>();
  for (const r of catRows) {
    if (!r || !r.id) continue;
    own.set(String(r.id), r.audit_ticked);
    const isPre = r.status === 'slot_reserved' || r.status === 'slot_converted';
    const cats = Array.isArray(r.audit_ticked) ? r.audit_ticked.filter(Boolean) : [];
    if (isPre && r.po && cats.length) {

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
