import type { ChurnedClient, FlowClient, FlowMonth } from '../../../../../lib/b2b/revenue/clients/types';
import { monthsBefore } from '../../../../../lib/b2b/revenue/clients';
import { CHURN_GAP } from '../../../../../lib/b2b/revenue/constants';
import { FLOW_ROWS, FROM_LABEL, SIDE_LABEL } from './constants';
import { FIRM_KIND_LABEL } from '../../../../../lib/b2b/client-import/constants';
import type { FirmKind, ReviewFirm } from '../../../../../lib/b2b/client-import/types';
import type { FlowCell, ListRow, UnregisteredCell } from './types';

export const CHURN_ROW = 'churned';

export const UNREGISTERED_ROW = 'unregistered';

export const churnSpendMonth = (key: string): string =>
  new Date(`${monthsBefore(key, CHURN_GAP)}-01T00:00:00Z`).toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' });

export const shortMonth = (key: string): string =>
  new Date(`${key}-01T00:00:00Z`).toLocaleString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' });

function cellOf(rows: readonly { side: FlowClient['side']; value: number; gapUnknown?: boolean }[]): FlowCell {
  const bySide = { studio: 0, ec: 0 };
  let value = 0;
  let gapUnknown = 0;
  for (const r of rows) {
    bySide[r.side] += 1;
    value += r.value;
    if (r.gapUnknown) gapUnknown += 1;
  }
  return { count: rows.length, value, bySide, gapUnknown };
}

export function rowClients(m: FlowMonth, row: string): FlowClient[] | ChurnedClient[] {
  if (row === CHURN_ROW) return m.churned;
  const def = FLOW_ROWS.find((r) => r.key === row);
  return def ? m.clients.filter(def.pick) : [];
}

export const cell = (m: FlowMonth, row: string): FlowCell => cellOf(rowClients(m, row));

export function listRows(m: FlowMonth, row: string): ListRow[] {
  const rows: ListRow[] = row === CHURN_ROW
    ? m.churned.map((c) => ({ key: c.key, name: c.name, now: 'No order since', before: `${SIDE_LABEL[c.side]} in ${shortMonth(c.lastMonth)}`, value: c.value, orders: null }))
    : (rowClients(m, row) as FlowClient[]).map((c) => ({
      key: c.key,
      name: c.name,
      now: SIDE_LABEL[c.side],
      before: c.lastBefore
        ? `${FROM_LABEL[c.from]} · last order ${shortMonth(c.lastBefore)}`
        : `${FROM_LABEL[c.from]} · ${c.firstOrder ? `first order ${shortMonth(c.firstOrder.slice(0, 7))}` : 'no order history'}${c.gapUnknown ? ', gap unknown' : ''}`,
      value: c.value,
      orders: c.orders,
    }));
  return rows.sort((a, b) => b.value - a.value);
}

const BUSINESS_KINDS = new Set<FirmKind>(['company', 'partnership', 'other']);

export function unregisteredIn(m: FlowMonth, firms: ReviewFirm[]): ReviewFirm[] {
  const booked = new Set(m.phones);
  return firms.filter((f) => f.months?.[m.key] && !f.contacts.some((c) => booked.has(c.number)));
}

export function unregisteredCell(m: FlowMonth, firms: ReviewFirm[]): UnregisteredCell {
  const rows = unregisteredIn(m, firms);
  let value = 0;
  let business = 0;
  for (const f of rows) {
    value += f.months[m.key].value;
    if (BUSINESS_KINDS.has(f.kind)) business += 1;
  }
  return { count: rows.length, value, business, proprietor: rows.length - business };
}

export function unregisteredRows(m: FlowMonth, firms: ReviewFirm[]): ListRow[] {
  return unregisteredIn(m, firms)
    .map((f) => ({
      key: f.key,
      name: f.name,
      now: FIRM_KIND_LABEL[f.kind],
      before: `first order ${shortMonth(f.firstOrder.slice(0, 7))}${f.stores[0] ? ` · ${f.stores[0].name}` : ''}`,
      value: f.months[m.key].value,
      orders: f.months[m.key].orders,
    }))
    .sort((a, b) => b.value - a.value);
}
