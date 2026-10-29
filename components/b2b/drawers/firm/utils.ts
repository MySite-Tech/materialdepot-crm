import { ORDER_TABS } from './constants';
import { ClientEntity, contactNumbers, gstNumbers, normalizeContactNumber, normalizeGst } from '../../models/client';
import { ClientOrderRow } from '@/lib/b2b';

export type OrderTab = typeof ORDER_TABS[number]['key'];

export function firmHolding(clients: ClientEntity[], selfId: string, key: { phone?: string; gst?: string }): ClientEntity | undefined {
  const phone = key.phone ? normalizeContactNumber(key.phone) : '';
  const gst = key.gst ? normalizeGst(key.gst) : '';
  return clients.find((c) => c.id !== selfId
    && ((!!phone && contactNumbers(c.contacts).includes(phone)) || (!!gst && gstNumbers(c.gsts).includes(gst))));
}

export function orderTab(r: ClientOrderRow): OrderTab {
  return r.ordered ? 'placed' : r.open ? 'open' : 'lost';
}

export function fmtPhone(n: string): string {
  const d = normalizeContactNumber(n);
  return d.length === 10 ? `${d.slice(0, 5)} ${d.slice(5)}` : n;
}

export function fmtGst(g: string): string {
  const n = normalizeGst(g);
  return n.length === 15 ? `${n.slice(0, 2)} ${n.slice(2, 12)} ${n.slice(12)}` : n;
}

export function fmtDate(iso: string | undefined): string {
  if (!iso) return '';
  const ms = Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(ms)) return String(iso);
  return new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
