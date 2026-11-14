import { isEndConsumer } from '../../../constants/inbound';
import { CallAttempt } from '../../../types/inbound';
import { sentToOutreach } from '../../inbound';
import { InboundLead, OutreachLead } from '../../mock-data';
import { FOLLOW_UPS_REQUIRED, followUpMeetings } from '../../outreach';
import { INBOUND_POOL_STAGES } from '../../outreach/intake';
import { isMobile, sameRep } from '../../outreach/handover';
import { Period, inPeriod } from '../../outreach/kpis';
import { istDay } from '../../outreach/reminders';
import { fromKpi, newestFirst, notesBy, redirectsBy } from '../measures/activity';
import { creditedOrders, revenueValue } from '../measures/revenue';
import { ActivityItem, PerfCard, PerfData, PerfKpiDef, PerfRow, Person, TeamEngine } from '../types';
import { countValue, counted, isPerson, isPersonByPhone, isPlaceholderName, memberPeople, onTeamList, pct, personKey, teamMemberByPhone } from '../utils';
import { B2B_INBOUND_OWNER_LIST } from '@/lib/api/b2b/inbound/constants';
import { B2B_FRESH_START } from '@/lib/b2b/data/rows';
import { inboundPhones, outreachPhones } from '@/lib/b2b/leads/unified';

const DEFS: PerfKpiDef[] = [
  { key: 'calls',      kind: 'Effort', label: 'Calls',                  short: 'Calls',          unit: 'count', target: 1500, per: 'month', daily: true,  rule: 'Call attempts logged in the period by this person. A call logged by someone not on the Inbound team list (a manager, say) goes to the lead owner. Target 1,500 a month per head.', weight: 20 },
  { key: 'firstCalls', kind: 'Effort', label: 'New leads called',       short: 'First calls',    unit: 'count', target: null,               daily: true,  rule: 'Leads they own whose first ever call attempt fell in the period.' },
  { key: 'coverage',   kind: 'Effort', label: 'Coverage of new leads',  short: 'Coverage',       unit: '%',     target: 100,                daily: false, rule: 'Leads created in the period and owned by them now that have at least one logged call ÷ all such leads in Kylas (the two inbound stages).', weight: 10 },
  { key: 'adherence',  kind: 'Effort', label: 'CRM adherence',          short: 'CRM adherence',  unit: '%',     target: 100,                daily: true,  rule: 'Leads they called in the period with contact name, mobile, firm name, segment, client type, city, a status past New, a next follow-up date while open and not sent to Outreach, and a note on every call ÷ leads they called.', weight: 10 },
  { key: 'revenue',    kind: 'Output', label: 'Revenue',                short: 'Revenue',        unit: 'L',     target: 25,   per: 'month', daily: true,  rule: 'Every order placed in the period and credited to them, in four channels: they were the B2B rep on the cart, the number was on a lead they own from before the cart, or a manager credited the enquiry to them. EC orders count. The same per-order rule as the Overview, so the two always agree.', weight: 40 },
  { key: 'qualified',  kind: 'Output', label: 'Qualified for Outreach', short: 'Qualified',      unit: 'count', target: 30,   per: 'month', daily: true,  rule: `Every lead they sent to Outreach is listed. One counts once an Outreach BM took it (accepted the hand-off, or added its number as a lead after it was sent) and it converted, at Inbound or Outreach, or Outreach held ${FOLLOW_UPS_REQUIRED} follow-ups. Leads still waiting for a BM and rejections are listed with the reason.`, weight: 20 },
];

const OPEN_NEEDS_DATE: InboundLead['stage'][] = ['Follow up', 'PI Shared', 'Connected - Need nurturing'];

const filled = (v: string | undefined) => !!String(v || '').trim();

const FIELDS: [string, (l: InboundLead) => boolean][] = [
  ['contact name', (l) => filled(l.contactName)],
  ['mobile', (l) => isMobile(l.phone)],
  ['firm name', (l) => isEndConsumer(l.clientType) || filled(l.companyName)],
  ['segment', (l) => isEndConsumer(l.clientType) || !!l.segment],
  ['client type', (l) => !!l.clientType],
  ['city', (l) => !!l.location],
  ['status', (l) => l.stage !== 'New'],
  ['next follow-up', (l) => !OPEN_NEEDS_DATE.includes(l.stage) || sentToOutreach(l) || !!l.followUpDate],
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

interface Handoff {
  src?: InboundLead;
  row?: OutreachLead;
  linked: boolean;
}

function handoffs(data: PerfData, people: Person[], owns: (l: InboundLead) => boolean): Handoff[] {
  const inboundById = new Map(data.inbound.map((l) => [l.id, l]));
  const out: Handoff[] = [];
  const linkedIds = new Set<string>();
  for (const row of data.outreach) {
    const intake = row.intake;
    if (!intake || intake.from !== 'Inbound' || !intake.inboundLeadId) continue;
    linkedIds.add(intake.inboundLeadId);
    const src = inboundById.get(intake.inboundLeadId);
    if (intake.inboundOwner ? isPerson(people, intake.inboundOwner) : !!src && owns(src)) out.push({ src, row, linked: true });
  }
  const unlinked = data.outreach.filter((r) => !r.intake?.inboundLeadId);
  for (const src of data.inbound) {
    if (!sentToOutreach(src) || linkedIds.has(src.id) || !owns(src)) continue;
    const nums = new Set(inboundPhones(src));
    const row = unlinked
      .filter((r) => outreachPhones(r).some((p) => nums.has(p)))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0];
    out.push({ src, row, linked: false });
  }
  return out;
}

const convertedNote = (src: InboundLead | undefined, row: OutreachLead): string | null =>
  row.status === 'Closed' ? 'converted' : src?.stage === 'Closed' ? 'order placed at Inbound' : null;

function creditNote(src: InboundLead | undefined, row: OutreachLead): { counts: boolean; note: string } {
  const won = convertedNote(src, row);
  if (won) return { counts: true, note: won };
  const fu = followUpMeetings(row.meetings).length;
  return fu >= FOLLOW_UPS_REQUIRED
    ? { counts: true, note: `${fu} follow-ups held` }
    : { counts: false, note: `${fu} of ${FOLLOW_UPS_REQUIRED} follow-ups, not credited yet` };
}

function qualifiedRow({ src, row, linked }: Handoff): PerfRow {
  const sentAt = src?.outreachReferral?.at;
  if (row && linked) {
    const intake = row.intake!;
    if (intake.acceptedAt) {
      const c = creditNote(src, row);
      return { id: row.id, title: row.company, at: intake.acceptedAt, counts: c.counts, note: `Accepted by ${row.bm} · ${c.note}` };
    }
    if (intake.rejectedAt) return { id: row.id, title: row.company, at: intake.rejectedAt, counts: false, note: `Rejected by ${row.bm}${intake.rejectReason ? `: ${intake.rejectReason}` : ''}` };
    return { id: row.id, title: row.company, at: intake.assignedAt, counts: false, note: `Waiting on ${row.bm || 'a BM'} to sign off` };
  }
  const lead = src!;
  if (row && istDay(row.createdAt) >= istDay(sentAt)) {
    const c = creditNote(lead, row);
    return { id: lead.id, title: title(lead), at: row.createdAt, counts: c.counts, note: `Added by ${row.bm || 'Outreach'} as a separate Outreach lead on ${istDay(row.createdAt)}, not through the hand-off · ${c.note}` };
  }
  if (row) return { id: lead.id, title: title(lead), at: sentAt, counts: false, note: `Outreach already had this number (${row.bm || 'no BM'}, since ${istDay(row.createdAt)})` };
  return { id: lead.id, title: title(lead), at: sentAt, counts: false, note: INBOUND_POOL_STAGES.includes(lead.stage) ? 'Sent, waiting for an Outreach manager to assign it' : `Sent, then marked ${lead.stage} at Inbound` };
}

function card(data: PerfData, people: Person[], period: Period): PerfCard {
  const owns = ownsLead(people);
  const mine = data.inbound.filter(owns);
  const byThem = (l: InboundLead, a: CallAttempt) => {
    if (a.byPhone && teamMemberByPhone(data, 'inbound', a.byPhone)) return isPersonByPhone(people, a.byPhone);
    return a.by && onTeamList(data, 'inbound', a.by) ? isPerson(people, a.by) : owns(l);
  };

  const calls: PerfRow[] = data.inbound.flatMap((l) => (l.callAttempts || [])
    .filter((a) => inPeriod(a.at, period) && byThem(l, a))
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
    .map((l) => ({ l, theirs: (l.callAttempts || []).filter((a) => inPeriod(a.at, period) && byThem(l, a)) }))
    .filter(({ theirs }) => theirs.length);
  const adherence: PerfRow[] = handled.map(({ l, theirs }) => {
    const gaps = FIELDS.filter(([, ok]) => !ok(l)).map(([label]) => label);
    if (theirs.some((a) => !filled(a.note))) gaps.push('call note');
    return { id: l.id, title: title(l), at: theirs[theirs.length - 1].at, counts: !gaps.length, note: gaps.length ? `Missing ${gaps.join(', ')}` : 'Complete' };
  });

  const qualified = handoffs(data, people, owns).map((h) => qualifiedRow(h)).filter((r) => r.at && inPeriod(r.at, period));
  const accepted = qualified.filter((r) => r.note.startsWith('Accepted') || r.note.startsWith('Added by')).length;
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
    revenue: revenueValue(creditedOrders(data, 'inbound', people, period)),
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
    if (known || !name || isPlaceholderName(name)) continue;
    const byName = personKey(name);
    const key = out.some((p) => p.key === byName) && l.ownerId != null ? `kylas:${l.ownerId}` : byName;
    if (!out.some((p) => p.key === key)) out.push({ key, name, kylasUserId: l.ownerId ?? null, onTeam: false });
  }
  return out;
}

function activity(data: PerfData, people: Person[], period: Period, c: PerfCard): ActivityItem[] {
  const sent: ActivityItem[] = handoffs(data, people, ownsLead(people))
    .map((h) => ({ h, at: h.src?.outreachReferral?.at || h.row?.intake?.assignedAt }))
    .filter(({ at }) => at && inPeriod(at, period))
    .map(({ h, at }) => ({ id: `sent:${h.src?.id || h.row!.id}`, at: at!, kind: 'Sent to Outreach' as const, title: h.row?.company || title(h.src!), detail: qualifiedRow(h).note }));
  return newestFirst([
    ...fromKpi(c, 'calls', 'Call'),
    ...notesBy(data.inbound, (l) => l.notes, title, (l) => l.id, people, period),
    ...sent,
    ...redirectsBy(data, people, period),
  ]);
}

export const INBOUND_ENGINE: TeamEngine = {
  team: 'inbound',
  label: 'Inbound',
  sources: ['inbound', 'outreach'],
  defs: DEFS,
  notMeasured: ['Dead-lead automation (5 calls in 7 days) is not built, so it is not scored'],
  people,
  card,
  activity,
};
