import { INBOUND_WINDOW_START } from '../../../components/b2b/constants/inbound';
import { addDays } from '../../../components/b2b/utils/inbound';
import { DEALS_BEFORE_WINDOW_DAYS, DEALS_MAX_LOOKBACK_DAYS, OPEN_CART_STATUSES, OPEN_PI_STATUSES } from './constants';
import type { LeadDeals, OpenDeal, OpenDealKind } from './types';

export const dealPhone = (p: string | null | undefined): string => String(p || '').replace(/\D/g, '').slice(-10);

export const openDealKind = (status: string): OpenDealKind | null =>
  OPEN_CART_STATUSES.includes(status) ? 'cart' : OPEN_PI_STATUSES.includes(status) ? 'pi' : null;

export function openDealsSince(today: string): string {
  const fromWindow = addDays(INBOUND_WINDOW_START, -DEALS_BEFORE_WINDOW_DAYS);
  const floor = addDays(today, -DEALS_MAX_LOOKBACK_DAYS);
  return fromWindow > floor ? fromWindow : floor;
}

const newestFirst = (a: OpenDeal, b: OpenDeal) => b.createdOn.localeCompare(a.createdOn) || b.value - a.value;

export function dealsByPhone(deals: OpenDeal[]): Map<string, OpenDeal[]> {
  const out = new Map<string, OpenDeal[]>();
  for (const d of deals) out.set(d.phone, [...(out.get(d.phone) ?? []), d]);
  return out;
}

export function leadDeals(phones: string[], byPhone: Map<string, OpenDeal[]>): LeadDeals {
  const seen = new Map<string, OpenDeal>();
  for (const p of phones) for (const d of byPhone.get(dealPhone(p)) ?? []) seen.set(d.enqId, d);
  const all = [...seen.values()].sort(newestFirst);
  return { carts: all.filter((d) => d.kind === 'cart'), pis: all.filter((d) => d.kind === 'pi') };
}
