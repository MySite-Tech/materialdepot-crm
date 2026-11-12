import { b2bBackendDelete, b2bBackendGet, b2bBackendPost } from '../../data/backend';
import type { B2BTeam } from '../../team/types';
import type { OrderCredit, OrderCreditRow } from '../types';
import { creditKey, rowToCredit } from './utils';

export { applyCredits, creditKey } from './utils';

export const fetchOrderCredits = (): Promise<OrderCredit[]> =>
  b2bBackendGet<{ credits: OrderCreditRow[] }>('/order-credits').then((b) => b.credits.map(rowToCredit));

export interface CreditInput {
  enquiryId: string;
  name: string;
  phone?: string;
  team: B2BTeam | null;
  reason: string;
}

export const saveOrderCredit = (c: CreditInput): Promise<OrderCredit> =>
  b2bBackendPost<{ credit: OrderCreditRow }>('/order-credits', {
    enquiry_id: creditKey(c.enquiryId), name: c.name, phone: c.phone ?? null, team: c.team, reason: c.reason,
  }).then((b) => rowToCredit(b.credit));

export const clearOrderCredit = (enquiryId: string): Promise<void> =>
  b2bBackendDelete(`/order-credits/${encodeURIComponent(creditKey(enquiryId))}`).then(() => undefined);
