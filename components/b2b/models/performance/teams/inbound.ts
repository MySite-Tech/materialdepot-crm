import { InboundLead, fmtINR } from '../../mock-data';
import { FOLLOW_UPS_REQUIRED, followUpMeetings } from '../../outreach';
import { isMobile, sameRep } from '../../outreach/handover';
import { Period, inPeriod } from '../../outreach/kpis';
import { istDay } from '../../outreach/reminders';
import { PerfCard, PerfData, PerfKpiDef, PerfRow, Person, TeamEngine } from '../types';
import { countValue, counted, isPerson, isPlaceholderName, lakhs, memberPeople, pct, personKey } from '../utils';
import { B2B_INBOUND_OWNER_LIST } from '@/lib/api/b2b/inbound/constants';
import { B2B_FRESH_START } from '@/lib/b2b/data/rows';

const DEFS: PerfKpiDef[] = [
  { key: 'calls',      kind: 'Effort', label: 'Calls',                  short: 'Calls',          unit: 'count', target: 90,   per: 'day',   daily: true,  rule: 'Call attempts logged in the period by this person (the caller, not the lead owner). Target 90 a day, for every day of the period up to today.' },
  { key: 'firstCalls', kind: 'Effort', label: 'New leads called',       short: 'First calls',    unit: 'count', target: null,               daily: true,  rule: 'Leads they own whose first ever call attempt fell in the period.' },
  { key: 'coverage',   kind: 'Effort', label: 'Coverage of new leads',  short: 'Coverage',       unit: '%',     target: 100,                daily: false, rule: 'Leads created in the period and owned by them now that have at least one logged call ÷ all such leads in Kylas (the two inbound stages).' },
  { key: 'adherence',  kind: 'Effort', label: 'CRM adherence',          short: 'CRM adherence',  unit: '%',     target: 100,                daily: true,  rule: 'Leads they called in the period with contact name, mobile, firm name, segment, client type, city, a status past New, a next follow-up date while open, and a note on every call ÷ leads they called.' },
  { key: 'revenue',    kind: 'Output', label: 'Revenue',                short: 'Revenue',        unit: 'L',     target: 25,   per: 'month', daily: true,  rule: 'Order value of leads they own that moved to Closed in the period, counted only when the value was fetched from the Enq ID. EC orders placed for their lead count.' },
  { key: 'qualified',  kind: 'Output', label: 'Qualified for Outreach', short: 'Qualified',      unit: 'count', target: 30,   per: 'month', daily: true,  rule: `Their leads an Outreach BM accepted in the period, credited once the lead converted or Outreach held ${FOLLOW_UPS_REQUIRED} follow-ups. Rejections are listed with the reason.` },
];

const OPEN_NEEDS_DATE: InboundLead['stage'][] = ['Follow up', 'PI Shared', 'Connected - Need nurturing'];

const filled = (v: string | undefined) => !!String(v || '').trim();

const FIELDS: [string, (l: InboundLead) => boolean][] = [
  ['contact name', (l) => filled(l.contactName)],
  ['mobile', (l) => isMobile(l.phone)],
  ['firm name', (l) => filled(l.companyName)],
  ['segment', (l) => !!l.segment],
  ['client type', (l) => !!l.clientType],
  ['city', (l) => !!l.location],
  ['status', (l) => l.stage !== 'New'],
  ['next follow-up', (l) => !OPEN_NEEDS_DATE.includes(l.stage) || !!l.followUpDate],
];

const title = (l: InboundLead) => String(l.companyName || l.company || l.contactName || l.phone || l.id);

const ownsLead = (people: Person[]) => (l: InboundLead): boolean =>
  people.some((p) => (p.kylasUserId != null && l.ownerId != null ? l.ownerId === p.kylasUserId : sameRep(l.owner, p.name)));

function assignedTotal(data: PerfData, people: Person[]): number | null {
  if (!data.assigned) return null;
  let sum = 0;
  let linked = 0;
  for (const p of people) {
    if (p.kylasUserId == null) continue;
    const n = data.assigned[p.key];
    if (n == null) return null;
    sum += n;
    linked += 1;
  }
  return linked ? sum : null;
}

function card(data: PerfData, people: Person[], period: Period): PerfCard {
  const owns = ownsLead(people);
  const mine = data.inbound.filter(owns);
  const byThem = (by: string | undefined) => isPerson(people, by);

  const calls: PerfRow[] = data.inbound.flatMap((l) => (l.callAttempts || [])
    .filter((a) => inPeriod(a.at, period) && byThem(a.by))
    .map((a) => ({ id: `${l.id}:${a.n}:${a.at}`, title: title(l), at: a.at, counts: true, note: `${a.outcome}${filled(a.note) ? '' : ' · no note'}` })));
  const connected = calls.filter((r) => r.note.startsWith('Connected')).length;

  const firstCalls: PerfRow[] = mine
    .map((l) => ({ l, first: (l.callAttempts || [])[0] }))
    .filter(({ first }) => first && inPeriod(first.at, period))
    .map(({ l, first }) => ({ id: l.id, title: title(l), at: first.at, counts: true, note: `${first.outcome} on attempt 1` }));

  const created = mine.filter((l) => inPeriod(l.leadCreatedAt, period) && istDay(l.leadCreatedAt) >= B2B_FRESH_START);
  const coverageRows: PerfRow[] = created.map((l) => {
    const first = (l.callAttempts || [])[0];
    const sameDay = first && istDay(first.at) === istDay(l.leadCreatedAt);
    return { id: l.id, title: title(l), at: l.leadCreatedAt, counts: !!first, note: !first ? 'Never called' : sameDay ? 'Called the day it came in' : `First call ${istDay(first.at)}` };
  });
  const assigned = assignedTotal(data, people);
  const den = assigned === null ? null : Math.max(assigned, coverageRows.length);
  const sameDay = coverageRows.filter((r) => r.note.startsWith('Called the day')).length;

  const handled = data.inbound
    .map((l) => ({ l, theirs: (l.callAttempts || []).filter((a) => inPeriod(a.at, period) && byThem(a.by)) }))
    .filter(({ theirs }) => theirs.length);
  const adherence: PerfRow[] = handled.map(({ l, theirs }) => {
    const gaps = FIELDS.filter(([, ok]) => !ok(l)).map(([label]) => label);
    if (theirs.some((a) => !filled(a.note))) gaps.push('call note');
    return { id: l.id, title: title(l), at: theirs[theirs.length - 1].at, counts: !gaps.length, note: gaps.length ? `Missing ${gaps.join(', ')}` : 'Complete' };
  });

  const closed = mine.filter((l) => l.stage === 'Closed' && inPeriod(l.statusChangedAt, period));
  const revenue: PerfRow[] = closed.map((l) => {
    const fetched = l.orderValueSource === 'deal' && Number(l.orderValue) > 0;
    return {
      id: l.id, title: title(l), at: l.statusChangedAt, counts: fetched,
      note: fetched ? `${fmtINR(Number(l.orderValue))} · ${l.enqId || ''}`.trim() : filled(l.enqId) ? `Enq ID ${l.enqId} not fetched — typed value not counted` : 'No Enq ID yet',
    };
  });
  const revenueSum = closed.filter((l, i) => revenue[i].counts).reduce((a, l) => a + Number(l.orderValue), 0);

  const inboundById = new Map(data.inbound.map((l) => [l.id, l]));
  const qualified: PerfRow[] = [];
  for (const l of data.outreach) {
    const intake = l.intake;
    if (!intake) continue;
    const src = inboundById.get(intake.inboundLeadId);
    const theirs = intake.inboundOwner ? isPerson(people, intake.inboundOwner) : !!src && owns(src);
    if (!theirs) continue;
    if (intake.acceptedAt && inPeriod(intake.acceptedAt, period)) {
      const fu = followUpMeetings(l.meetings).length;
      const credited = l.status === 'Closed' || fu >= FOLLOW_UPS_REQUIRED;
      qualified.push({
        id: l.id, title: l.company, at: intake.acceptedAt, counts: credited,
        note: l.status === 'Closed' ? `Accepted by ${l.bm} · converted` : credited ? `Accepted by ${l.bm} · ${fu} follow-ups held` : `Accepted by ${l.bm} · ${fu} of ${FOLLOW_UPS_REQUIRED} follow-ups, not credited yet`,
      });
    } else if (intake.rejectedAt && inPeriod(intake.rejectedAt, period)) {
      qualified.push({ id: l.id, title: l.company, at: intake.rejectedAt, counts: false, note: `Rejected by ${l.bm}${intake.rejectReason ? `: ${intake.rejectReason}` : ''}` });
    } else if (!intake.acceptedAt && !intake.rejectedAt && inPeriod(intake.assignedAt, period)) {
      qualified.push({ id: l.id, title: l.company, at: intake.assignedAt, counts: false, note: `Waiting on ${l.bm || 'a BM'} to sign off` });
    }
  }
  const accepted = qualified.filter((r) => r.note.startsWith('Accepted')).length;
  const rejected = qualified.filter((r) => r.note.startsWith('Rejected')).length;

  return {
    calls: countValue(calls, calls.length ? `${connected} connected · ${calls.length - connected} RNR` : undefined),
    firstCalls: countValue(firstCalls),
    coverage: {
      value: den === null ? null : pct(counted(coverageRows), den),
      unknown: den === null,
      rows: coverageRows,
      sub: den === null
        ? (data.assigned ? 'Kylas did not answer, or no Kylas user is linked — new-lead count unknown' : 'Needs the Kylas new-lead count for the period')
        : `${counted(coverageRows)} of ${den} new leads called · ${sameDay} the same day${den > coverageRows.length ? ` · ${den - coverageRows.length} never opened in the CRM` : ''}`,
    },
    adherence: { value: pct(counted(adherence), adherence.length), rows: adherence, sub: adherence.length ? `${counted(adherence)} of ${adherence.length} leads called` : 'No calls in the period' },
    revenue: {
      value: lakhs(revenueSum), rows: revenue,
      sub: revenue.length > counted(revenue) ? `${revenue.length - counted(revenue)} closed with no fetched order value` : undefined,
    },
    qualified: countValue(qualified, qualified.length ? `${accepted} accepted · ${counted(qualified)} credited · ${rejected} rejected` : undefined),
  };
}

function people(data: PerfData, members: Parameters<TeamEngine['people']>[1], live: boolean): Person[] {
  const out: Person[] = live
    ? memberPeople(members, 'inbound')
    : B2B_INBOUND_OWNER_LIST.map((o) => ({ key: personKey(o.name), name: o.name, kylasUserId: o.id, onTeam: true }));
  for (const l of data.inbound) {
    const name = String(l.owner || '').trim();
    if (!name && l.ownerId == null) continue;
    const known = out.some((p) => (p.kylasUserId != null && l.ownerId != null ? p.kylasUserId === l.ownerId : sameRep(l.owner, p.name)));
    if (!known && name && !isPlaceholderName(name)) out.push({ key: personKey(name), name, kylasUserId: l.ownerId ?? null, onTeam: false });
  }
  return out;
}

export const INBOUND_ENGINE: TeamEngine = {
  team: 'inbound',
  label: 'Inbound',
  sources: ['inbound', 'outreach'],
  defs: DEFS,
  notMeasured: ['Dead-lead automation (5 calls in 7 days) is not built, so it is not scored'],
  people,
  card,
};
