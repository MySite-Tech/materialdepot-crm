import { repOwns } from '../../outreach/handover';
import { MONTHLY_RATES, OUTREACH_KPIS, Period, outreachKpis } from '../../outreach/kpis';
import { journeyBy, newestFirst, notesBy, outreachCallsBy, outreachMeetingsBy, redirectsBy } from '../measures/activity';
import { creditedOrders } from '../measures/revenue';
import { ActivityItem, PerfCard, PerfData, PerfKpiDef, Person, TeamEngine } from '../types';
import { memberPeople, withDataPeople } from '../utils';
import type { TeamMember } from '@/lib/b2b/team/types';

const DEFS: PerfKpiDef[] = OUTREACH_KPIS.map((d) => ({
  key: d.key,
  label: d.label,
  short: d.short,
  kind: d.kind,
  unit: d.unit,
  target: d.target,
  per: d.unit === '%' && !MONTHLY_RATES.has(d.key) ? undefined : 'month',
  daily: !MONTHLY_RATES.has(d.key),
  rule: d.rule,
  weight: d.weight,
}));

const ownedBy = (data: PerfData, people: Person[]) => {
  const owners = people.map((p) => repOwns({ name: p.name, phone: p.phone }));
  return data.outreach.filter((l) => owners.some((own) => own(l)));
};

function card(data: PerfData, people: Person[], period: Period): PerfCard {
  const leads = ownedBy(data, people);
  const orders = creditedOrders(data, 'outreach', people, period);
  const k = outreachKpis(leads, period, data.waitlist, orders && !orders.undated ? orders.orders : null);
  return Object.fromEntries(OUTREACH_KPIS.map((d) => [d.key, {
    value: k[d.key].value,
    unknown: d.key === 'waitlist' && k[d.key].value === null,
    sub: k[d.key].sub,
    rows: k[d.key].rows.map((r) => ({ id: r.lead.id, title: r.lead.company, note: r.note, at: r.at, counts: r.counts })),
  }]));
}

function activity(data: PerfData, people: Person[], period: Period): ActivityItem[] {
  return newestFirst([
    ...outreachCallsBy(ownedBy(data, people), period),
    ...outreachMeetingsBy(data, people, period),
    ...journeyBy(data, people, period),
    ...notesBy(data.outreach, (l) => l.notes, (l) => l.company, (l) => l.id, people, period),
    ...redirectsBy(data, people, period),
  ]);
}

function people(data: PerfData, members: TeamMember[], live: boolean): Person[] {
  const base = live ? memberPeople(members, 'outreach') : [];
  const owners = base.map((p) => repOwns({ name: p.name, phone: p.phone }));
  const unowned = data.outreach.filter((l) => !owners.some((own) => own(l)));
  return withDataPeople(base, unowned.map((l) => l.bm), !live);
}

export const OUTREACH_ENGINE: TeamEngine = {
  team: 'outreach',
  label: 'Outreach',
  sources: ['outreach'],
  defs: DEFS,
  notMeasured: [],
  people,
  card,
  activity,
};
