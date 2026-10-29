import { ClientEntity, ClientInteraction } from '../../client';
import { kamAccountStatus } from '../../kam';
import { fmtINR } from '../../mock-data';
import { Period, inPeriod } from '../../outreach/kpis';
import { istDay } from '../../outreach/reminders';
import { PerfCard, PerfData, PerfKpiDef, PerfRow, Person, TeamEngine } from '../types';
import { countValue, counted, isPerson, lakhs, memberPeople, pct, withDataPeople } from '../utils';
import type { TeamMember } from '@/lib/b2b/team/types';

const DEFS: PerfKpiDef[] = [
  { key: 'meetings',  kind: 'Effort', label: 'Account meetings',        short: 'Meetings',       unit: 'count', target: 35,  per: 'month', daily: true,  rule: 'Meetings they logged in the period, one per firm per day.' },
  { key: 'coverage',  kind: 'Effort', label: 'Meeting coverage',        short: 'Coverage',       unit: '%',     target: 50,                daily: false, rule: 'Active firms assigned to them (an order in the last 3 months, as of today) that they met in the period ÷ their active firms. Repeat meetings with one firm add nothing.' },
  { key: 'calls',     kind: 'Effort', label: 'Calls',                   short: 'Calls',          unit: 'count', target: 40,  per: 'day',   daily: true,  rule: 'Calls they logged in the period, one per firm per day. Target 40 a day, for every day of the period up to today.' },
  { key: 'adherence', kind: 'Effort', label: 'CRM adherence',           short: 'CRM adherence',  unit: '%',     target: 100,               daily: true,  rule: 'Calls and meetings they logged in the period with notes and a next follow-up date ÷ all they logged. Profile completeness is not in it yet.' },
  { key: 'revenue',   kind: 'Output', label: 'Revenue',                 short: 'Revenue',        unit: 'L',     target: 50,  per: 'month', daily: true,  rule: 'Order value of KAM-board orders they own that moved to Closed in the period, counted only when the value was fetched from the Enq ID.' },
  { key: 'ordering',  kind: 'Output', label: 'Accounts ordering',       short: 'Ordering',       unit: '%',     target: 60,                daily: false, rule: 'Firms assigned to them that placed an order in the period (a Closed KAM order, or a last order date in the period) ÷ firms assigned whose order history loaded.' },
];

const actor = (c: ClientEntity, i: ClientInteraction) => i.loggedBy || c.kam;

function loggedRows(clients: ClientEntity[], people: Person[], period: Period, type: ClientInteraction['type']): PerfRow[] {
  const seen = new Set<string>();
  const rows: PerfRow[] = [];
  for (const c of clients) {
    for (const i of c.interactions || []) {
      if (i.type !== type || !inPeriod(i.date, period) || !isPerson(people, actor(c, i))) continue;
      const k = `${c.id}|${istDay(i.date)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      rows.push({ id: `${c.id}:${i.id}`, title: c.company, at: i.date, counts: true, note: String(i.summary || '').trim() || 'No notes' });
    }
  }
  return rows;
}

function card(data: PerfData, people: Person[], period: Period): PerfCard {
  const book = data.clients.filter((c) => isPerson(people, c.kam));

  const meetings = loggedRows(data.clients, people, period, 'Meeting');
  const calls = loggedRows(data.clients, people, period, 'Call');

  const metFirms = new Set(meetings.map((r) => r.id.split(':')[0]));
  const statuses = book.map((c) => ({ c, status: kamAccountStatus(data.metricsFor(c), data.today) }));
  const unknown = statuses.filter((s) => s.status === 'Unknown').length;
  const coverage: PerfRow[] = statuses
    .filter((s) => s.status === 'Active')
    .map(({ c }) => ({ id: c.id, title: c.company, counts: metFirms.has(c.id), note: metFirms.has(c.id) ? 'Met in the period' : 'Not met in the period' }));

  const adherence: PerfRow[] = data.clients.flatMap((c) => (c.interactions || [])
    .filter((i) => inPeriod(i.date, period) && isPerson(people, actor(c, i)))
    .map((i) => {
      const gaps = [!String(i.summary || '').trim() && 'notes', !i.nextFollowUpDate && 'next follow-up'].filter(Boolean);
      return { id: `${c.id}:${i.id}`, title: `${c.company} · ${i.type}`, at: i.date, counts: !gaps.length, note: gaps.length ? `Missing ${gaps.join(', ')}` : 'Complete' };
    }));

  const closed = data.kamOrders.filter((o) => o.status === 'Closed' && isPerson(people, o.kam) && inPeriod(o.statusChangedAt, period));
  const revenue: PerfRow[] = closed.map((o) => {
    const fetched = o.orderValueSource === 'deal' && Number(o.orderValue) > 0;
    return {
      id: o.id, title: o.company, at: o.statusChangedAt, counts: fetched,
      note: fetched ? `${fmtINR(Number(o.orderValue))} · ${o.enqId || ''}`.trim() : o.enqId ? `Enq ID ${o.enqId} not fetched — typed value not counted` : 'No Enq ID yet',
    };
  });
  const revenueSum = closed.filter((o, i) => revenue[i].counts).reduce((a, o) => a + Number(o.orderValue), 0);

  const orderedFirms = new Set(closed.map((o) => o.clientId).filter(Boolean) as string[]);
  const ordering: PerfRow[] = statuses
    .map(({ c, status }) => {
      const last = String(data.metricsFor(c).lastOrderPlaced || '').slice(0, 10);
      const viaBoard = orderedFirms.has(c.id);
      const viaHistory = !!last && last >= period.from && last <= period.to;
      if (status === 'Unknown' && !viaBoard) return null;
      return { id: c.id, title: c.company, counts: viaBoard || viaHistory, at: viaHistory ? last : undefined, note: viaBoard || viaHistory ? `Ordered${viaHistory ? ` · last order ${last}` : ' · KAM board order'}` : 'No order in the period' };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const unknownNote = unknown ? `${unknown} firm${unknown === 1 ? '' : 's'} with order history unknown left out` : '';
  return {
    meetings: countValue(meetings, meetings.length ? `${metFirms.size} firms met` : undefined),
    coverage: {
      value: pct(counted(coverage), coverage.length), unknown: !coverage.length && unknown > 0, rows: coverage,
      sub: [coverage.length ? `${counted(coverage)} of ${coverage.length} active firms met` : 'No active firms in the book', unknownNote].filter(Boolean).join(' · '),
    },
    calls: countValue(calls, calls.length ? `${new Set(calls.map((r) => r.title)).size} firms called` : undefined),
    adherence: { value: pct(counted(adherence), adherence.length), rows: adherence, sub: adherence.length ? `${counted(adherence)} of ${adherence.length} logged with notes and a follow-up` : 'Nothing logged in the period' },
    revenue: {
      value: lakhs(revenueSum), rows: revenue,
      sub: revenue.length > counted(revenue) ? `${revenue.length - counted(revenue)} closed with no fetched order value` : undefined,
    },
    ordering: {
      value: pct(counted(ordering), ordering.length), unknown: !ordering.length && unknown > 0, rows: ordering,
      sub: [ordering.length ? `${counted(ordering)} of ${ordering.length} firms ordered` : 'No firms assigned', unknownNote].filter(Boolean).join(' · '),
    },
  };
}

function people(data: PerfData, members: TeamMember[], live: boolean): Person[] {
  const names = [...data.clients.map((c) => c.kam), ...data.kamOrders.map((o) => o.kam)];
  return withDataPeople(live ? memberPeople(members, 'kam') : [], names, !live);
}

export const KAM_ENGINE: TeamEngine = {
  team: 'kam',
  label: 'KAM',
  sources: ['clients', 'kamOrders'],
  defs: DEFS,
  notMeasured: [
    'Studio Space onboarding (no Studio Space status is stored on a firm yet)',
    'Active rate of last month\'s handovers (no handover date is stored on a firm yet)',
    'Orders placed at an EC or by the firm itself count toward Ordering only through the last order date, and not toward Revenue, until Django matches orders by GST',
  ],
  people,
  card,
};
