import { OutreachLead, fmtINR } from '../mock-data';
import { COVERAGE_SOURCES, FOLLOW_UPS_REQUIRED, WaitlistSignup, heldMeetings } from '.';
import { isMobile, sameRep, signedOffWithinTat } from './handover';
import { callTally } from '../inbound/calls';
import { istDay, outreachAdherence } from './reminders';
import { normalisePhone } from '@/lib/org/utils';
import { outreachPhones } from '@/lib/b2b/leads/unified';
import type { RevenueOrder } from '@/lib/b2b/revenue';

export type OutreachKpiKey =
  | 'calls' | 'newMeetings' | 'followUpMeetings' | 'adherence' | 'coverage'
  | 'conversions' | 'waitlist' | 'handover' | 'revenue';

export interface OutreachKpiDef {
  key: OutreachKpiKey;
  label: string;
  short: string;
  kind: 'Effort' | 'Output';
  target: number | null;
  unit: 'count' | '%' | 'L';
  rule: string;
  weight: number;
}

export const MONTHLY_RATES = new Set<OutreachKpiKey>(['coverage', 'handover']);

export const OUTREACH_KPIS: OutreachKpiDef[] = [
  { key: 'calls',            kind: 'Effort', label: 'Calls logged',          short: 'Calls',         target: null, unit: 'count', rule: 'Calls logged in the period on their leads, from the Calls card in the lead drawer: every call counts, connected or RNR, so a lead called three times counts three. No target is set yet, and it carries no weight in the score.', weight: 0 },
  { key: 'newMeetings',      kind: 'Effort', label: 'New-lead meetings',     short: 'New meetings',  target: 50,  unit: 'count', rule: 'Unique firms whose first meeting was held in the period, marked held or checked in on site, with an owner/designer name and a 10-digit mobile. A check-in counts without notes; missing notes lower CRM adherence.', weight: 10 },
  { key: 'followUpMeetings', kind: 'Effort', label: 'Follow-up meetings',    short: 'Follow-ups',    target: 30,  unit: 'count', rule: `Unique firms with a follow-up meeting held in the period, marked held or checked in on site. A firm is fully followed up after ${FOLLOW_UPS_REQUIRED} follow-ups or an order.`, weight: 10 },
  { key: 'adherence',        kind: 'Effort', label: 'CRM adherence',         short: 'CRM adherence', target: 100, unit: '%',     rule: 'Leads touched in the period with every mandatory field and log in place ÷ leads touched. Judged on the lead as it stands now. Before a meeting is held, and on a Lost lead, only the firm name, mobile and logs are asked: role, team size, segment, client type, office address and the owner\'s name are captured at the visit, as the drawer asks. Then, for a stage set in the CRM, what that stage needs, the same list its status gate checks: a next follow-up date at Follow up and PI Shared, a reason at Lost, and the first order\'s Enq ID and the KAM handover once Closed.', weight: 10 },
  { key: 'coverage',         kind: 'Effort', label: 'Inbound & EC coverage', short: 'Coverage',      target: 100, unit: '%',     rule: 'Inbound and EC-referral leads assigned in the period that have had an in-person meeting (marked held or checked in) ÷ those assigned.', weight: 10 },
  { key: 'conversions',      kind: 'Output', label: 'Converted clients',     short: 'Conversions',   target: 15,  unit: 'count', rule: 'Clients with an order placed in the period and credited to them in the per-order report, counted once each, whether or not the lead was moved to Converted. The same orders as the revenue figure.', weight: 15 },
  { key: 'waitlist',         kind: 'Output', label: 'Studio Space waitlist', short: 'Waitlist',      target: 30,  unit: 'count', rule: 'Waitlist sign-ups in the period whose mobile exactly matches a lead\'s mobile.', weight: 15 },
  { key: 'handover',         kind: 'Output', label: 'KAM handover',          short: 'KAM handover',  target: 100, unit: '%',     rule: 'Their leads with an order credited in the period that a KAM has signed off ÷ those leads.', weight: 15 },
  { key: 'revenue',          kind: 'Output', label: 'Revenue',               short: 'Revenue',       target: 5,   unit: 'L',     rule: 'Every order placed in the period and credited to them in the per-order report (the same rule as the Overview and My performance), in all four channels, including a manager\'s credit.', weight: 15 },
];

export interface Period { from: string; to: string }

export interface KpiRow {
  lead: OutreachLead;
  counts: boolean;
  note: string;
  at?: string;
}

export interface KpiValue {
  value: number | null;
  sub?: string;
  rows: KpiRow[];
}

export type OutreachKpis = Record<OutreachKpiKey, KpiValue>;

export const currentMonth = (today: string): string => today.slice(0, 7);

const pad2 = (n: number) => String(n).padStart(2, '0');

export function monthPeriod(ym: string): Period {
  const [y, m] = ym.split('-').map(Number);
  return { from: `${ym}-01`, to: `${ym}-${pad2(new Date(Date.UTC(y, m, 0)).getUTCDate())}` };
}

export const isWholeMonth = (p: Period): boolean => monthPeriod(p.from.slice(0, 7)).from === p.from && monthPeriod(p.from.slice(0, 7)).to === p.to;

export const inPeriod = (iso: string | undefined, p: Period): boolean => {
  const d = istDay(iso);
  return !!d && d >= p.from && d <= p.to;
};

const pct = (num: number, den: number): number | null => (den ? Math.round((num / den) * 100) : null);

function touchedIn(l: OutreachLead, p: Period): boolean {
  if (inPeriod(l.createdAt, p) || inPeriod(l.statusChangedAt, p)) return true;
  if ((l.meetings || []).some((m) => inPeriod(m.date, p))) return true;
  return (l.journey || []).some((e) => inPeriod(e.at, p));
}

export type WaitlistIndex = Map<string, WaitlistSignup> | null;

export function waitlistIndex(signups: WaitlistSignup[] | null): WaitlistIndex {
  if (!signups) return null;
  return new Map(signups.map((s) => [normalisePhone(s.phone), s]));
}

export const waitlistFor = (l: OutreachLead, idx: Map<string, WaitlistSignup> | null): WaitlistSignup | null | undefined => {
  if (!idx) return undefined;
  const p = normalisePhone(l.phone);
  return p.length === 10 ? idx.get(p) ?? null : null;
};

const counted = (rows: KpiRow[]) => rows.filter((r) => r.counts).length;

function handoverNote(l: OutreachLead): string {
  const h = l.handover;
  if (!h) return 'Not handed over';
  if (h.status === 'Accepted') return `Signed off by ${h.kam}${signedOffWithinTat(h) ? '' : ' after 48h'}`;
  if (h.status === 'Rejected') return `Rejected by ${h.kam}`;
  return `Waiting on ${h.kam}`;
}

const leadMatcher = (leads: OutreachLead[]) => {
  const byPhone = new Map<string, OutreachLead>();
  for (const l of leads) for (const p of outreachPhones(l)) if (!byPhone.has(p)) byPhone.set(p, l);
  return (o: RevenueOrder) => byPhone.get(o.phone);
};

const fmtLakhs = (n: number) => Math.round((n / 1_00_000) * 100) / 100;

export function outreachKpis(
  leads: OutreachLead[],
  period: Period,
  waitlist: Map<string, WaitlistSignup> | null,
  orders: RevenueOrder[] | null,
): OutreachKpis {
  const callRows: KpiRow[] = leads
    .map((l) => ({ l, theirs: (l.callAttempts || []).filter((a) => inPeriod(a.at, period)) }))
    .filter(({ theirs }) => theirs.length)
    .map(({ l, theirs }) => {
      const t = callTally(theirs);
      const last = theirs[theirs.length - 1];
      const callers = [...new Set(theirs.map((a) => a.by).filter((b): b is string => !!b && !sameRep(b, l.bm)))];
      return {
        lead: l, counts: true, at: last.at,
        note: [`${t.total} call${t.total === 1 ? '' : 's'}`, t.connected && `${t.connected} connected`, t.rnr && `${t.rnr} RNR`, callers.length && `by ${callers.join(', ')}`].filter(Boolean).join(' · '),
      };
    });
  const callTotals = callTally(leads.flatMap((l) => (l.callAttempts || []).filter((a) => inPeriod(a.at, period))));

  const held: KpiRow[] = leads
    .map((l) => ({ l, m: heldMeetings(l.meetings)[0] }))
    .filter((x) => x.m && inPeriod(x.m.date, period))
    .map(({ l, m }) => {
      const missing = [
        !String(l.contactPerson || '').trim() && 'owner name',
        !isMobile(l.phone) && 'valid mobile',
      ].filter(Boolean);
      const how = m.status === 'Completed' ? 'held' : 'checked in';
      const extras = [!String(m.notes || '').trim() && 'no notes yet', !m.pin && 'no live pin'].filter(Boolean).join(' · ');
      return {
        lead: l, at: m.date, counts: !missing.length,
        note: missing.length ? `Missing ${missing.join(', ')}` : `Meeting ${m.n} ${how}${extras ? ` · ${extras}` : ''}`,
      };
    });
  const fromCheckIn = (rows: KpiRow[]) => rows.filter((r) => r.counts && r.note.includes(' checked in')).length;
  const noNotes = held.filter((r) => r.counts && r.note.includes('no notes yet')).length;
  const newMeetings = held;

  const followUps: KpiRow[] = leads
    .map((l) => ({ l, fu: heldMeetings(l.meetings).slice(1) }))
    .filter(({ fu }) => fu.some((m) => inPeriod(m.date, period)))
    .map(({ l, fu }) => {
      const last = fu.filter((m) => inPeriod(m.date, period)).pop()!;
      return {
        lead: l, counts: true, at: last.date,
        note: `${l.status === 'Closed' ? 'Order placed' : `${Math.min(fu.length, FOLLOW_UPS_REQUIRED)} of ${FOLLOW_UPS_REQUIRED} follow-ups held`}${last.status === 'Completed' ? '' : ' · checked in'}`,
      };
    });
  const fuDone = followUps.filter((r) => r.note.startsWith('Order placed') || heldMeetings(r.lead.meetings).length - 1 >= FOLLOW_UPS_REQUIRED).length;
  const checkInSub = (n: number) => (n ? `${n} counted from a check-in, not yet marked held` : '');

  const adherence: KpiRow[] = leads
    .filter((l) => touchedIn(l, period) && !l.intake?.rejectedAt)
    .map((l) => {
      const gaps = outreachAdherence(l);
      return { lead: l, counts: !gaps.length, note: gaps.length ? `Missing ${gaps.join(', ')}` : 'Complete' };
    });

  const coverage: KpiRow[] = leads
    .filter((l) => l.source && COVERAGE_SOURCES.includes(l.source) && !l.intake?.rejectedAt
      && inPeriod(l.intake?.assignedAt || l.createdAt, period))
    .map((l) => {
      const met = heldMeetings(l.meetings)[0];
      const note = met ? `${l.source} · ${met.status === 'Completed' ? 'met' : 'checked in'} ${met.date || ''}`.trim() : `${l.source} · not met yet`;
      return { lead: l, counts: !!met, at: l.intake?.assignedAt || l.createdAt, note };
    });

  const placed = (orders ?? []).filter((o) => inPeriod(o.ticket.placedAt, period));
  const leadOf = leadMatcher(leads);
  const ordersByLead = new Map<OutreachLead, RevenueOrder[]>();
  const unmatched: RevenueOrder[] = [];
  for (const o of placed) {
    const l = leadOf(o);
    if (l) ordersByLead.set(l, [...(ordersByLead.get(l) ?? []), o]);
    else unmatched.push(o);
  }
  const otherClients = new Set(unmatched.map((o) => o.phone || o.firm || o.id)).size;
  const sorted = (os: RevenueOrder[]) => [...os].sort((a, b) => String(a.ticket.placedAt || '').localeCompare(String(b.ticket.placedAt || '')));
  const orderRows: KpiRow[] = [...ordersByLead].map(([l, os]) => {
    const first = sorted(os)[0];
    const total = os.reduce((a, o) => a + o.value, 0);
    return {
      lead: l, counts: true, at: first.ticket.placedAt,
      note: `${os.length === 1 ? `Order ${first.id}` : `${os.length} orders, first ${first.id}`} · ${fmtINR(total)}${l.status === 'Closed' ? '' : ' · lead not moved to Converted yet'}`,
    };
  });
  const notMarked = [...ordersByLead.keys()].filter((l) => l.status !== 'Closed').length;
  const handover: KpiRow[] = [...ordersByLead.keys()].map((l) => ({
    lead: l, counts: l.handover?.status === 'Accepted', at: l.handover?.sentAt, note: handoverNote(l),
  }));
  const revenueSum = placed.reduce((a, o) => a + o.value, 0);
  const elsewhere = unmatched.length ? `${unmatched.length} credited order${unmatched.length === 1 ? '' : 's'} on numbers not on these leads` : '';
  const unknown = (what: string): KpiValue => ({ value: null, rows: [], sub: `Orders could not be read — ${what} unknown` });

  let waitlistKpi: KpiValue = { value: null, sub: 'Studio Space did not answer — count unknown', rows: [] };
  if (waitlist) {
    const byPhone = new Map<string, OutreachLead>();
    for (const l of leads) {
      const p = normalisePhone(l.phone);
      if (p.length === 10 && !byPhone.has(p)) byPhone.set(p, l);
    }
    const ordered = new Set(leads.filter((l) => l.status === 'Closed' || ordersByLead.has(l)).map((l) => normalisePhone(l.phone)));
    const rows: KpiRow[] = [...byPhone.entries()]
      .map(([p, lead]) => ({ p, lead, s: waitlist.get(p) }))
      .filter((x): x is { p: string; lead: OutreachLead; s: WaitlistSignup } => !!x.s && inPeriod(x.s.createdAt, period))
      .map(({ p, lead, s }) => ({ lead, counts: true, at: s.createdAt, note: ordered.has(p) ? 'Joined · also ordered — ready to onboard' : 'Joined' }));
    const ready = rows.filter((r) => r.note !== 'Joined').length;
    waitlistKpi = { value: rows.length, rows, sub: `${ready} also placed a first order — ready for Studio Space onboarding` };
  }

  return {
    calls: {
      value: callTotals.total, rows: callRows,
      sub: callTotals.total ? `${callTotals.connected} connected · ${callTotals.rnr} RNR · ${callRows.length} lead${callRows.length === 1 ? '' : 's'}` : 'No calls logged in this period',
    },
    newMeetings: {
      value: counted(newMeetings), rows: newMeetings,
      sub: [held.length - counted(held) ? `${held.length - counted(held)} more held but missing the owner's name or a mobile` : '', checkInSub(fromCheckIn(held)), noNotes ? `${noNotes} with no notes yet` : '']
        .filter(Boolean).join(' · ') || undefined,
    },
    followUpMeetings: {
      value: counted(followUps), rows: followUps,
      sub: [`${fuDone} reached ${FOLLOW_UPS_REQUIRED} follow-ups or an order`, checkInSub(fromCheckIn(followUps))].filter(Boolean).join(' · '),
    },
    adherence: { value: pct(counted(adherence), adherence.length), rows: adherence, sub: adherence.length ? `${counted(adherence)} of ${adherence.length} leads touched` : 'No leads touched yet' },
    coverage: { value: pct(counted(coverage), coverage.length), rows: coverage, sub: coverage.length ? `${counted(coverage)} of ${coverage.length} met in person` : 'None assigned in this period' },
    conversions: orders === null ? unknown('conversions') : {
      value: ordersByLead.size + otherClients, rows: orderRows,
      sub: [notMarked ? `${notMarked} not moved to Converted yet` : '', elsewhere].filter(Boolean).join(' · ') || undefined,
    },
    waitlist: waitlistKpi,
    handover: orders === null ? unknown('handover') : {
      value: pct(counted(handover), handover.length), rows: handover,
      sub: handover.length
        ? `${counted(handover)} of ${handover.length} signed off · ${[...ordersByLead.keys()].filter((l) => l.handover?.status === 'Accepted' && signedOffWithinTat(l.handover)).length} within 48h`
        : 'No orders on these leads yet',
    },
    revenue: orders === null ? unknown('revenue') : {
      value: fmtLakhs(revenueSum), rows: orderRows,
      sub: [placed.length ? `${placed.length} order${placed.length === 1 ? '' : 's'}` : '', elsewhere].filter(Boolean).join(' · ') || undefined,
    },
  };
}

export function kpiTarget(def: OutreachKpiDef, heads: number, period: Period): number | null {
  if (def.target === null) return null;
  if (def.unit === '%') return MONTHLY_RATES.has(def.key) && !isWholeMonth(period) ? null : def.target;
  return isWholeMonth(period) ? def.target * Math.max(1, heads) : null;
}

export function newOnboardingFrom(
  deals: { id: string; status: string; createdAt?: string; closureDate?: string }[],
  enqId: string,
  isOrder: (status: string) => boolean,
): boolean | undefined {
  const want = enqId.trim().toUpperCase();
  const hit = deals.find((d) => String(d.id).toUpperCase() === want);
  if (!hit) return undefined;
  const at = Date.parse(String(hit.closureDate || hit.createdAt || ''));
  if (Number.isNaN(at)) return undefined;
  const from = at - 183 * 86_400_000;
  return !deals.some((d) => {
    if (d === hit || !isOrder(d.status)) return false;
    const t = Date.parse(String(d.closureDate || d.createdAt || ''));
    return !Number.isNaN(t) && t >= from && t < at;
  });
}
