import type { CRMLeadRow } from '../../api/crm/leads';
import { UPSELL_LAG_DAYS, UPSELL_WINDOW_DAYS } from '../constants';
import type { BankLead, CohortKey, Phase } from '../types';
import { istDate, plausible, rupees, shiftDays } from '../utils';
import { byPhone, DEAD_STATUSES } from './carts';

export type PhaseOrders = Record<Phase, CRMLeadRow[]> & { earlier: CRMLeadRow[] };

type UpsellKey = Extract<CohortKey, 'upsell_carpentry' | 'upsell_civil' | 'upsell_decorative'>;

const PITCH: Record<UpsellKey, string> = {
  upsell_carpentry: 'pitch wallpapers, wooden flooring, wall panels',
  upsell_civil: 'pitch plywood and laminates',
  upsell_decorative: 'ask where civil and carpentry were bought',
};

const placed = (r: CRMLeadRow): string => istDate(r.orderPlacedAt || r.createdAt);

const live = (rows: CRMLeadRow[]): CRMLeadRow[] => rows.filter((r) => !DEAD_STATUSES.has(r.status));

const latest = (rows: CRMLeadRow[] | undefined): CRMLeadRow | null =>
  rows?.length ? [...rows].sort((a, b) => placed(b).localeCompare(placed(a)))[0] : null;

export function upsellCohorts(orders: PhaseOrders, today: string): BankLead[] {
  const due = shiftDays(today, -UPSELL_LAG_DAYS);
  const floor = shiftDays(due, -UPSELL_WINDOW_DAYS);
  const civil = byPhone(live(orders.civil));
  const carpentry = byPhone(live(orders.carpentry));
  const decorative = byPhone(live(orders.decorative));
  const earlier = byPhone(live(orders.earlier));
  const out: BankLead[] = [];

  const add = (cohort: UpsellKey, phone: string, r: CRMLeadRow, phaseLabel: string) => {
    const on = placed(r);
    out.push({
      key: `${cohort}:${phone}`,
      cohort,
      phone,
      name: r.clientName ?? '',
      branch: r.bookedBranch || r.branch || '',
      bm: r.assignedTo ?? '',
      enteredOn: shiftDays(on, UPSELL_LAG_DAYS),
      value: plausible(r.cartValue),
      ref: r.id ?? '',
      detail: `${phaseLabel} order ${rupees(r.cartValue || 0)} on ${on}, nothing later in the next phase · ${PITCH[cohort]}`,
    });
  };

  const inWindow = (r: CRMLeadRow | null): r is CRMLeadRow => !!r && placed(r) >= floor && placed(r) <= due;

  for (const [phone, rows] of carpentry) {
    const last = latest(rows);
    if (!inWindow(last)) continue;
    if ((decorative.get(phone) ?? []).some((d) => placed(d) >= placed(last))) continue;
    add('upsell_carpentry', phone, last, 'Carpentry');
  }

  for (const [phone, rows] of civil) {
    const last = latest(rows);
    if (!inWindow(last)) continue;
    if ((carpentry.get(phone) ?? []).some((c) => placed(c) >= placed(last))) continue;
    add('upsell_civil', phone, last, 'Civil');
  }

  for (const [phone, rows] of decorative) {
    const last = latest(rows);
    if (!inWindow(last)) continue;
    if (civil.has(phone) || carpentry.has(phone) || earlier.has(phone)) continue;
    add('upsell_decorative', phone, last, 'Decorative');
  }

  return out;
}
