import type { CRMLeadRow } from '../../api/crm/leads';
import { normalisePhone } from '../../org/utils';
import { COHORTS } from '../constants';
import type { BankLead, CohortResult } from '../types';
import { istDate } from '../utils';
import { byPhone, cartCohorts } from './carts';
import { PhaseOrders, upsellCohorts } from './upsell';

export type { PhaseOrders } from './upsell';

export interface NoCartVisit {
  name?: string;
  contact?: string;
  bm?: string;
  branch?: string;
  has_deal_ticket?: boolean;
  [k: string]: unknown;
}

const VISIT_DATE_KEYS = ['last_visit_date', 'last_visit', 'visit_date', 'visited_at', 'date', 'created_at'];

const visitDate = (v: NoCartVisit, fallback: string): string => {
  for (const k of VISIT_DATE_KEYS) {
    const d = istDate(typeof v[k] === 'string' ? (v[k] as string) : '');
    if (d) return d;
  }
  return fallback;
};

export function visitCohort(visits: NoCartVisit[], carts: CRMLeadRow[], today: string): BankLead[] {
  const withCart = byPhone(carts);
  const out = new Map<string, BankLead>();
  for (const v of visits) {
    const phone = normalisePhone(v.contact);
    if (phone.length !== 10 || withCart.has(phone)) continue;
    const on = visitDate(v, today);
    const prev = out.get(phone);
    if (prev && prev.enteredOn >= on) continue;
    out.set(phone, {
      key: `visit_no_cart:${phone}`,
      cohort: 'visit_no_cart',
      phone,
      name: v.name ?? '',
      branch: v.branch ?? '',
      bm: v.bm ?? '',
      enteredOn: on,
      value: 0,
      ref: '',
      detail: `Visited an EC${on !== today ? ` on ${on}` : ''}, no cart or quote since${v.has_deal_ticket ? ' (has a deal ticket)' : ''}`,
    });
  }
  return [...out.values()];
}

const RANK = new Map(COHORTS.map((c, i) => [c.key, ({ P1: 0, P2: 1, P3: 2 })[c.priority] * 100 + i]));

export function onePerCustomer(leads: BankLead[]): BankLead[] {
  const best = new Map<string, BankLead>();
  for (const l of leads) {
    const prev = best.get(l.phone);
    if (!prev || RANK.get(l.cohort)! < RANK.get(prev.cohort)!) best.set(l.phone, l);
  }
  return [...best.values()];
}

export function buildCohorts(input: {
  carts: CRMLeadRow[];
  orders: PhaseOrders;
  visits: NoCartVisit[];
  ecVisitors: NoCartVisit[];
  today: string;
}): CohortResult {
  const ecVisitors = new Set(input.ecVisitors.map((v) => normalisePhone(v.contact)).filter((p) => p.length === 10));
  const allOrders = [...input.orders.civil, ...input.orders.carpentry, ...input.orders.decorative];
  const carts = cartCohorts([...input.carts, ...allOrders], ecVisitors, input.today);
  const upsell = upsellCohorts(input.orders, input.today);
  const visits = visitCohort(input.visits, input.carts, input.today);
  return {
    leads: onePerCustomer([...carts.leads, ...upsell, ...visits]),
    skippedActive: carts.skipped.followUp + carts.skipped.remark,
    read: {
      carts: input.carts.length,
      civil: input.orders.civil.length,
      carpentry: input.orders.carpentry.length,
      decorative: input.orders.decorative.length,
      earlier: input.orders.earlier.length,
      visits: input.visits.length,
      ecVisitors: ecVisitors.size,
      skippedFollowUp: carts.skipped.followUp,
      skippedRemark: carts.skipped.remark,
    },
  };
}
