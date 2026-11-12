import { ACTIVE_DAYS, ClientEntity, ClientInteraction, clientStatus } from '../../client';
import { KAM_MONTHLY_CALL_TARGET, KAM_MONTHLY_MEETING_TARGET } from '../../kam';
import { Period, inPeriod } from '../../outreach/kpis';
import { istDay } from '../../outreach/reminders';
import { fromKpi, newestFirst, redirectsBy } from '../measures/activity';
import { creditedOrders, revenueValue } from '../measures/revenue';
import { ActivityItem, PerfCard, PerfData, PerfKpiDef, PerfRow, Person, TeamEngine } from '../types';
import { countValue, counted, isPerson, memberPeople, onTeamList, pct, withDataPeople } from '../utils';
import type { TeamMember } from '@/lib/b2b/team/types';

const DEFS: PerfKpiDef[] = [
  { key: 'meetings',  kind: 'Effort', label: 'Account meetings',        short: 'Meetings',       unit: 'count', target: KAM_MONTHLY_MEETING_TARGET, per: 'month', daily: true,  rule: 'Meetings they logged in the period, one per firm per day. One logged by someone not on the KAM team list goes to the firm\'s KAM.', weight: 10 },
  { key: 'coverage',  kind: 'Effort', label: 'Meeting coverage',        short: 'Coverage',       unit: '%',     target: 50,                daily: false, rule: `Active firms assigned to them (an order in the last ${ACTIVE_DAYS} days, as of today) that they met in the period ÷ their active firms. Repeat meetings with one firm add nothing.`, weight: 10 },
  { key: 'calls',     kind: 'Effort', label: 'Calls',                   short: 'Calls',          unit: 'count', target: KAM_MONTHLY_CALL_TARGET, per: 'month', daily: true, rule: `Calls they logged in the period, one per firm per day; one logged by someone not on the KAM team list goes to the firm's KAM. Target ${KAM_MONTHLY_CALL_TARGET} a month per head.`, weight: 10 },
  { key: 'adherence', kind: 'Effort', label: 'CRM adherence',           short: 'CRM adherence',  unit: '%',     target: 100,               daily: true,  rule: 'Calls and meetings they logged in the period with notes and a next follow-up date ÷ all they logged. Profile completeness is not in it yet.', weight: 5 },
  { key: 'revenue',   kind: 'Output', label: 'Revenue',                 short: 'Revenue',        unit: 'L',     target: 50,  per: 'month', daily: true,  rule: 'Every order placed in the period and credited to them, in four channels: EC, self and referrals. An order is theirs when they were the B2B rep on the cart, the number is on a firm they hold, it is a client their firm referred, or a manager credited the enquiry to them. The same per-order rule as the Overview.', weight: 30 },
  { key: 'ordering',  kind: 'Output', label: 'Accounts ordering',       short: 'Ordering',       unit: '%',     target: 60,                daily: false, rule: 'Firms assigned to them that placed an order in the period (a Closed KAM order, or a last order date in the period) ÷ firms assigned whose order history loaded.', weight: 10 },
];

const inProgress = (i: ClientInteraction) => i.type === 'Meeting' && !!i.checkIn && !String(i.summary || '').trim();

const actor = (data: PerfData, c: ClientEntity, i: ClientInteraction) => (i.loggedBy && onTeamList(data, 'kam', i.loggedBy) ? i.loggedBy : c.kam);

function loggedRows(data: PerfData, people: Person[], period: Period, type: ClientInteraction['type']): PerfRow[] {
  const seen = new Set<string>();
  const rows: PerfRow[] = [];
  for (const c of data.clients) {
    for (const i of c.interactions || []) {
      if (i.type !== type || inProgress(i) || !inPeriod(i.date, period) || !isPerson(people, actor(data, c, i))) continue;
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

  const meetings = loggedRows(data, people, period, 'Meeting');
  const calls = loggedRows(data, people, period, 'Call');

  const metFirms = new Set(meetings.map((r) => r.id.split(':')[0]));
  const statuses = book.map((c) => ({ c, status: clientStatus(data.metricsFor(c), data.today) }));
  const unknown = statuses.filter((s) => s.status === 'Unknown').length;
  const coverage: PerfRow[] = statuses
    .filter((s) => s.status === 'Active')
    .map(({ c }) => ({ id: c.id, title: c.company, counts: metFirms.has(c.id), note: metFirms.has(c.id) ? 'Met in the period' : 'Not met in the period' }));

  const adherence: PerfRow[] = data.clients.flatMap((c) => (c.interactions || [])
    .filter((i) => !inProgress(i) && inPeriod(i.date, period) && isPerson(people, actor(data, c, i)))
    .map((i) => {
      const gaps = [!String(i.summary || '').trim() && 'notes', !i.nextFollowUpDate && 'next follow-up'].filter(Boolean);
      return { id: `${c.id}:${i.id}`, title: `${c.company} · ${i.type}`, at: i.date, counts: !gaps.length, note: gaps.length ? `Missing ${gaps.join(', ')}` : 'Complete' };
    }));

  const closed = data.kamOrders.filter((o) => o.status === 'Closed' && isPerson(people, o.kam) && inPeriod(o.statusChangedAt, period));
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
    revenue: revenueValue(creditedOrders(data, 'kam', people, period)),
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

function activity(data: PerfData, people: Person[], period: Period, c: PerfCard): ActivityItem[] {
  const enquiries: ActivityItem[] = data.clients.flatMap((f) => (f.interactions || [])
    .filter((i) => i.type === 'Enquiry' && inPeriod(i.date, period) && isPerson(people, actor(data, f, i)))
    .map((i) => ({ id: `enquiry:${f.id}:${i.id}`, at: i.date, kind: 'Enquiry' as const, title: f.company, detail: String(i.summary || '').trim() || 'No notes' })));
  return newestFirst([
    ...fromKpi(c, 'meetings', 'Meeting'),
    ...fromKpi(c, 'calls', 'Call'),
    ...enquiries,
    ...redirectsBy(data, people, period),
  ]);
}

export const KAM_ENGINE: TeamEngine = {
  team: 'kam',
  label: 'KAM',
  sources: ['clients', 'kamOrders'],
  defs: DEFS,
  notMeasured: [
    'Studio Space onboarding (no Studio Space status is stored on a firm yet)',
    'Active rate of last month\'s handovers (no handover date is stored on a firm yet)',
    'An order placed under a number the firm record does not hold (a site supervisor, the end client) is not credited to the firm\'s KAM until Django matches orders by GST',
  ],
  people,
  card,
  activity,
};
