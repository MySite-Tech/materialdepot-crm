import { creditMatches } from '../../credit';
import { repOwns } from '../../outreach/handover';
import { OUTREACH_KPIS, Period, outreachKpis } from '../../outreach/kpis';
import { journeyBy, newestFirst, notesBy, outreachMeetingsBy, redirectsBy } from '../measures/activity';
import { ActivityItem, PerfCard, PerfData, PerfKpiDef, Person, TeamEngine } from '../types';
import { memberPeople, withDataPeople } from '../utils';
import { creditKey } from '@/lib/b2b/revenue';
import type { TeamMember } from '@/lib/b2b/team/types';

const PER_DAY_MEANINGLESS = new Set(['coverage', 'handover']);

const DEFS: PerfKpiDef[] = OUTREACH_KPIS.map((d) => ({
  key: d.key,
  label: d.label,
  short: d.short,
  kind: d.kind,
  unit: d.unit,
  target: d.target,
  per: d.unit === '%' ? undefined : 'month',
  daily: !PER_DAY_MEANINGLESS.has(d.key),
  rule: d.key === 'revenue' ? `${d.rule} A manager's credit on the lead's enquiry moves it to that person.` : d.rule,
  weight: d.weight,
}));

function card(data: PerfData, people: Person[], period: Period): PerfCard {
  const owners = people.map((p) => repOwns({ name: p.name, phone: p.phone }));
  const leads = data.outreach.filter((l) => owners.some((own) => own(l)));
  const credited = data.outreach.filter((l) => {
    const c = l.enqId ? data.credits?.get(creditKey(l.enqId)) : undefined;
    return c ? people.some((p) => creditMatches(c, p)) : owners.some((own) => own(l));
  });
  const k = { ...outreachKpis(leads, period, data.waitlist), revenue: outreachKpis(credited, period, data.waitlist).revenue };
  return Object.fromEntries(OUTREACH_KPIS.map((d) => [d.key, {
    value: k[d.key].value,
    unknown: d.key === 'waitlist' && k[d.key].value === null,
    sub: k[d.key].sub,
    rows: k[d.key].rows.map((r) => ({ id: r.lead.id, title: r.lead.company, note: r.note, at: r.at, counts: r.counts })),
  }]));
}

function activity(data: PerfData, people: Person[], period: Period): ActivityItem[] {
  return newestFirst([
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
