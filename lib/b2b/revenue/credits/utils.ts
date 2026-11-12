import type { CreditEntry, CreditEntryRow, OrderCredit, OrderCreditRow, RevenueOrder } from '../types';

export const creditKey = (enquiryId: string): string => enquiryId.trim().toUpperCase();

const entryOf = (r: CreditEntryRow): CreditEntry => ({
  name: r.name,
  phone: r.phone ?? undefined,
  team: r.team,
  reason: r.reason,
  by: r.credited_by,
  at: r.credited_at,
});

export const rowToCredit = (r: OrderCreditRow): OrderCredit => ({
  ...entryOf(r),
  enquiryId: creditKey(r.enquiry_id),
  history: (r.history ?? []).map(entryOf),
});

function recredit(o: RevenueOrder, credits: Map<string, OrderCredit> | null): RevenueOrder {
  const rule = o.rule ?? { person: o.person, team: o.team };
  const c = credits?.get(creditKey(o.id));
  if (c) return { ...o, person: c.name, team: c.team ?? rule.team, credit: c, rule };
  return o.rule ? { ...o, person: rule.person, team: rule.team, credit: undefined, rule: undefined } : o;
}

export const applyCredits = (orders: RevenueOrder[], credits: Map<string, OrderCredit> | null): RevenueOrder[] =>
  orders.map((o) => recredit(o, credits));
