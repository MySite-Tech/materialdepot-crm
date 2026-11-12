import { creditMatches } from '../../credit';
import { fmtINR } from '../../mock-data';
import { sameRep } from '../../outreach/handover';
import { Period, inPeriod } from '../../outreach/kpis';
import { PerfData, PerfValue, Person } from '../types';
import { lakhs } from '../utils';
import { CHANNEL_LABELS, REVENUE_CHANNELS, RevenueChannel, RevenueOrder, channelSplits } from '@/lib/b2b/revenue';
import type { B2BTeam } from '@/lib/b2b/team/types';

const creditedTo = (o: RevenueOrder, people: Person[]): boolean =>
  o.credit ? people.some((p) => creditMatches(o.credit!, p)) : people.some((p) => sameRep(o.person, p.name));

export interface Credited {
  orders: RevenueOrder[];
  undated: number;
}

export function creditedOrders(data: PerfData, team: B2BTeam, people: Person[], period: Period): Credited | null {
  const window = data.revenueWindow;
  if (!data.revenue || !window) return null;
  const whole = period.from <= window.from && period.to >= window.to;
  const theirs = data.revenue.filter((o) => o.team === team && creditedTo(o, people));
  return {
    orders: theirs
      .filter((o) => whole || inPeriod(o.ticket.placedAt, period))
      .sort((a, b) => String(b.ticket.placedAt || '').localeCompare(String(a.ticket.placedAt || ''))),
    undated: whole ? 0 : theirs.filter((o) => !o.ticket.placedAt).length,
  };
}

export function revenueValue(credited: Credited | null): PerfValue {
  if (!credited) return { value: null, unknown: true, rows: [], sub: 'Orders could not be read' };
  if (credited.undated) {
    return { value: null, unknown: true, rows: [], sub: `${credited.undated} order${credited.undated === 1 ? '' : 's'} came with no placement time, so a single day cannot claim ${credited.undated === 1 ? 'it' : 'them'}` };
  }
  const { orders } = credited;
  const split = channelSplits(orders);
  const channels = Object.fromEntries(REVENUE_CHANNELS.map((c) => [c, split[c].value])) as Record<RevenueChannel, number>;
  const byManager = orders.filter((o) => o.credit).length;
  const firms = new Set(orders.map((o) => o.firm)).size;
  return {
    value: lakhs(orders.reduce((s, o) => s + o.value, 0)),
    orders,
    channels,
    rows: orders.map((o) => ({
      id: o.id,
      title: o.firm || o.client || o.id,
      at: o.ticket.placedAt,
      counts: true,
      note: `${CHANNEL_LABELS[o.channel]} · ${fmtINR(o.value)} · ${o.id}${o.credit ? ` · credited by ${o.credit.by}` : ''}`,
    })),
    sub: orders.length
      ? `${orders.length} order${orders.length === 1 ? '' : 's'} · ${firms} firm${firms === 1 ? '' : 's'}${byManager ? ` · ${byManager} credited by a manager` : ''}`
      : undefined,
  };
}
