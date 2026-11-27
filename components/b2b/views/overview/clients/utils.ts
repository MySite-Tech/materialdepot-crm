import type { ChurnedClient, FlowClient, FlowMonth } from '../../../../../lib/b2b/revenue/clients/types';
import { FLOW_ROWS, FROM_LABEL, SIDE_LABEL } from './constants';
import type { FlowCell, ListRow } from './types';

export const CHURN_ROW = 'churned';

export const shortMonth = (key: string): string =>
  new Date(`${key}-01T00:00:00Z`).toLocaleString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' });

function cellOf(rows: readonly { side: FlowClient['side']; value: number }[]): FlowCell {
  const bySide = { studio: 0, ec: 0 };
  let value = 0;
  for (const r of rows) {
    bySide[r.side] += 1;
    value += r.value;
  }
  return { count: rows.length, value, bySide };
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
        : `${FROM_LABEL[c.from]} · ${c.firstOrder ? `first order ${shortMonth(c.firstOrder.slice(0, 7))}` : 'no order history'}`,
      value: c.value,
      orders: c.orders,
    }));
  return rows.sort((a, b) => b.value - a.value);
}
