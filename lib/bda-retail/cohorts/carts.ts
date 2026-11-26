import type { CRMLeadRow } from '../../api/crm/leads';
import { normalisePhone } from '../../org/utils';
import { ACTIVE_REMARK_DAYS, CART_WINDOW_DAYS, IDLE_DAYS } from '../constants';
import type { BankLead } from '../types';
import { istDate, plausible, rupees, shiftDays } from '../utils';

export const OPEN_CART_STATUSES = new Set(['In Cart', 'Quote Approval Pending', 'Availability Check', 'Hold Stock']);
export const DEAD_STATUSES = new Set(['Order Lost', 'Order Cancelled', 'Refunded']);

export const isOrdered = (r: CRMLeadRow): boolean =>
  !!r.orderPlacedAt || (!OPEN_CART_STATUSES.has(r.status) && !DEAD_STATUSES.has(r.status));

export const lastTouch = (r: CRMLeadRow): string => {
  const remarks = (r.remarks ?? []).map((m) => istDate(m.ts)).filter(Boolean);
  return [istDate(r.createdAt), ...remarks].sort().pop() ?? '';
};

const followUpAhead = (r: CRMLeadRow, today: string): boolean => !!r.followUpDate && istDate(r.followUpDate) >= today;

const recentRemark = (r: CRMLeadRow, today: string): boolean =>
  (r.remarks ?? []).some((m) => istDate(m.ts) >= shiftDays(today, -ACTIVE_REMARK_DAYS));

export const byPhone = (rows: CRMLeadRow[]): Map<string, CRMLeadRow[]> => {
  const m = new Map<string, CRMLeadRow[]>();
  for (const r of rows) {
    const p = normalisePhone(r.clientPhone);
    if (p.length !== 10) continue;
    const list = m.get(p);
    if (list) list.push(r);
    else m.set(p, [r]);
  }
  return m;
};

const lead = (phone: string, r: CRMLeadRow, cohort: BankLead['cohort'], enteredOn: string, value: number, detail: string): BankLead => ({
  key: `${cohort}:${phone}`,
  cohort,
  phone,
  name: r.clientName ?? '',
  branch: r.branch ?? '',
  bm: r.assignedTo ?? '',
  enteredOn,
  value,
  ref: r.id ?? '',
  detail,
});

const oddText = (odd: CRMLeadRow[]): string =>
  odd.length ? ` (plus ${odd.length} cart${odd.length > 1 ? 's' : ''} whose value looks wrong: ${odd.map((r) => rupees(r.cartValue)).join(', ')})` : '';

const itemsText = (r: CRMLeadRow): string => String(r.cartItems ?? '').split(/[,\n]/).filter(Boolean).slice(0, 3).join(', ');

export interface CartSkips {
  followUp: number;
  remark: number;
}

export function cartCohorts(rows: CRMLeadRow[], ecVisitors: Set<string>, today: string): { leads: BankLead[]; skipped: CartSkips } {
  const leads: BankLead[] = [];
  const skipped: CartSkips = { followUp: 0, remark: 0 };
  const cartFloor = shiftDays(today, -CART_WINDOW_DAYS);
  const idleBy = shiftDays(today, -IDLE_DAYS);

  for (const [phone, list] of byPhone(rows)) {
    const open = list.filter((r) => OPEN_CART_STATUSES.has(r.status) && !r.orderPlacedAt);
    if (open.length === 0) continue;
    const newestOpen = open.map((r) => istDate(r.createdAt)).sort().pop() ?? '';
    if (list.some((r) => isOrdered(r) && istDate(r.orderPlacedAt || r.createdAt) >= newestOpen)) continue;
    if (open.some((r) => recentRemark(r, today))) {
      skipped.remark += 1;
      continue;
    }
    if (open.some((r) => followUpAhead(r, today))) {
      skipped.followUp += 1;
      continue;
    }
    const top = [...open].sort((a, b) => plausible(b.cartValue) - plausible(a.cartValue))[0];
    const value = open.reduce((s, r) => s + plausible(r.cartValue), 0);
    const odd = open.filter((r) => (r.cartValue || 0) > 0 && !plausible(r.cartValue));
    const anyVisit = ecVisitors.has(phone);

    if (!anyVisit && newestOpen >= cartFloor) {
      leads.push(lead(phone, top, 'cart_no_visit', newestOpen, value,
        `${open.length} open cart${open.length > 1 ? 's' : ''}${value ? `, ${rupees(value)}` : ''}${oddText(odd)}${itemsText(top) ? ` · ${itemsText(top)}` : ''} · no EC visit in the last 3 months`));
      continue;
    }

    const idle = open.filter((r) => lastTouch(r) <= idleBy);
    if (idle.length === 0) continue;
    const quoted = idle.find((r) => r.status === 'Quote Approval Pending');
    const pick = quoted ?? idle.sort((a, b) => plausible(b.cartValue) - plausible(a.cartValue))[0];
    const enteredOn = shiftDays(lastTouch(pick), IDLE_DAYS);
    const idleDays = Math.round((Date.parse(today) - Date.parse(lastTouch(pick))) / 86_400_000);
    leads.push(lead(phone, pick, quoted ? 'pending_quote' : 'pending_cart', enteredOn, plausible(pick.cartValue),
      `${quoted ? 'Quote waiting for approval' : 'Cart with no quote'}, ${plausible(pick.cartValue) ? rupees(pick.cartValue) : `value looks wrong (${rupees(pick.cartValue || 0)})`}, idle ${idleDays} days${itemsText(pick) ? ` · ${itemsText(pick)}` : ''}`));
  }
  return { leads, skipped };
}
