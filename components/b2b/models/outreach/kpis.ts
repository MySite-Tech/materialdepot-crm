import { OutreachLead, fmtINR } from '../mock-data';
import { COVERAGE_SOURCES, FOLLOW_UPS_REQUIRED, WaitlistSignup, completedMeetings, followUpMeetings } from '.';
import { isMobile, orderVerified, signedOffWithinTat } from './handover';
import { istDay, outreachAdherence } from './reminders';
import { normalisePhone } from '@/lib/org/utils';

export type OutreachKpiKey =
  | 'newMeetings' | 'followUpMeetings' | 'adherence' | 'coverage'
  | 'conversions' | 'waitlist' | 'handover' | 'revenue';

export interface OutreachKpiDef {
  key: OutreachKpiKey;
  label: string;
  short: string;
  kind: 'Effort' | 'Output';
  target: number;
  unit: 'count' | '%' | 'L';
  rule: string;
}

export const OUTREACH_KPIS: OutreachKpiDef[] = [
  { key: 'newMeetings',      kind: 'Effort', label: 'New-lead meetings',     short: 'New meetings',  target: 50,  unit: 'count', rule: 'Unique firms whose first meeting was held in the period, with notes, an owner/designer name and a 10-digit mobile.' },
  { key: 'followUpMeetings', kind: 'Effort', label: 'Follow-up meetings',    short: 'Follow-ups',    target: 30,  unit: 'count', rule: `Unique firms with a follow-up meeting held in the period. A firm is fully followed up after ${FOLLOW_UPS_REQUIRED} follow-ups or an order.` },
  { key: 'adherence',        kind: 'Effort', label: 'CRM adherence',         short: 'CRM adherence', target: 100, unit: '%',     rule: 'Leads touched in the period with every mandatory field and log in place ÷ leads touched.' },
  { key: 'coverage',         kind: 'Effort', label: 'Inbound & EC coverage', short: 'Coverage',      target: 100, unit: '%',     rule: 'Inbound and EC-referral leads assigned in the period that have had an in-person meeting ÷ those assigned.' },
  { key: 'conversions',      kind: 'Output', label: 'New conversions',       short: 'Conversions',   target: 15,  unit: 'count', rule: 'Leads moved to Converted in the period whose first order was fetched from its Enq ID.' },
  { key: 'waitlist',         kind: 'Output', label: 'Studio Space waitlist', short: 'Waitlist',      target: 30,  unit: 'count', rule: 'Waitlist sign-ups in the period whose mobile exactly matches a lead\'s mobile.' },
  { key: 'handover',         kind: 'Output', label: 'KAM handover',          short: 'KAM handover',  target: 100, unit: '%',     rule: 'Leads converted in the period that a KAM has signed off ÷ leads converted in the period.' },
  { key: 'revenue',          kind: 'Output', label: 'New revenue',           short: 'New revenue',   target: 5,   unit: 'L',     rule: 'First-order value of the period\'s verified conversions, excluding numbers that ordered in the 6 months before.' },
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

export function waitlistIndex(signups: WaitlistSignup[] | null): Map<string, WaitlistSignup> | null {
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

export function outreachKpis(leads: OutreachLead[], period: Period, waitlist: Map<string, WaitlistSignup> | null): OutreachKpis {
  const newMeetings: KpiRow[] = leads
    .map((l) => ({ l, m: completedMeetings(l.meetings)[0] }))
    .filter((x) => x.m && inPeriod(x.m.date, period))
    .map(({ l, m }) => {
      const missing = [
        !String(m.notes || '').trim() && 'notes',
        !String(l.contactPerson || '').trim() && 'owner name',
        !isMobile(l.phone) && 'valid mobile',
      ].filter(Boolean);
      return {
        lead: l, at: m.date, counts: !missing.length,
        note: missing.length ? `Missing ${missing.join(', ')}` : `Meeting ${m.n} held${m.pin ? '' : ' · no live pin'}`,
      };
    });
  const noPin = newMeetings.filter((r) => r.counts && r.note.endsWith('no live pin')).length;

  const followUps: KpiRow[] = leads
    .map((l) => ({ l, fu: followUpMeetings(l.meetings) }))
    .filter(({ fu }) => fu.some((m) => inPeriod(m.date, period)))
    .map(({ l, fu }) => ({
      lead: l, counts: true, at: fu.filter((m) => inPeriod(m.date, period)).pop()?.date,
      note: l.status === 'Closed' ? 'Order placed' : `${Math.min(fu.length, FOLLOW_UPS_REQUIRED)} of ${FOLLOW_UPS_REQUIRED} follow-ups held`,
    }));
  const fuDone = followUps.filter((r) => r.note === 'Order placed' || followUpMeetings(r.lead.meetings).length >= FOLLOW_UPS_REQUIRED).length;

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
      const met = completedMeetings(l.meetings)[0];
      return { lead: l, counts: !!met, at: l.intake?.assignedAt || l.createdAt, note: met ? `${l.source} · met ${met.date || ''}`.trim() : `${l.source} · not met yet` };
    });

  const converted = leads.filter((l) => l.status === 'Closed' && inPeriod(l.convertedAt || l.statusChangedAt, period));
  const conversions: KpiRow[] = converted.map((l) => ({
    lead: l, counts: orderVerified(l), at: l.convertedAt || l.statusChangedAt,
    note: orderVerified(l) ? `Order ${l.enqId} fetched` : String(l.enqId || '').trim() ? `Enq ID ${l.enqId} not fetched` : 'No Enq ID yet',
  }));
  const handover: KpiRow[] = converted.map((l) => ({
    lead: l, counts: l.handover?.status === 'Accepted', at: l.handover?.sentAt, note: handoverNote(l),
  }));
  const revenue: KpiRow[] = converted.filter(orderVerified).map((l) => ({
    lead: l, counts: l.newOnboarding !== false, at: l.convertedAt || l.statusChangedAt,
    note: l.newOnboarding === false ? 'Repeat client — ordered in the 6 months before'
      : `${fmtINR(Number(l.orderValue) || 0)}${l.newOnboarding === undefined ? ' · prior orders not checked' : ''}`,
  }));
  const revenueSum = revenue.filter((r) => r.counts).reduce((a, r) => a + (Number(r.lead.orderValue) || 0), 0);
  const repeat = revenue.length - counted(revenue);
  const unchecked = revenue.filter((r) => r.lead.newOnboarding === undefined).length;

  let waitlistKpi: KpiValue = { value: null, sub: 'Studio Space did not answer — count unknown', rows: [] };
  if (waitlist) {
    const byPhone = new Map<string, OutreachLead>();
    for (const l of leads) {
      const p = normalisePhone(l.phone);
      if (p.length === 10 && !byPhone.has(p)) byPhone.set(p, l);
    }
    const ordered = new Set(leads.filter((l) => l.status === 'Closed').map((l) => normalisePhone(l.phone)));
    const rows: KpiRow[] = [...byPhone.entries()]
      .map(([p, lead]) => ({ p, lead, s: waitlist.get(p) }))
      .filter((x): x is { p: string; lead: OutreachLead; s: WaitlistSignup } => !!x.s && inPeriod(x.s.createdAt, period))
      .map(({ p, lead, s }) => ({ lead, counts: true, at: s.createdAt, note: ordered.has(p) ? 'Joined · also ordered — ready to onboard' : 'Joined' }));
    const ready = rows.filter((r) => r.note !== 'Joined').length;
    waitlistKpi = { value: rows.length, rows, sub: `${ready} also placed a first order — ready for Studio Space onboarding` };
  }

  return {
    newMeetings: {
      value: counted(newMeetings), rows: newMeetings,
      sub: [newMeetings.length - counted(newMeetings) ? `${newMeetings.length - counted(newMeetings)} more held but missing notes, name or mobile` : '', noPin ? `${noPin} with no live pin` : '']
        .filter(Boolean).join(' · ') || undefined,
    },
    followUpMeetings: { value: followUps.length, rows: followUps, sub: `${fuDone} reached ${FOLLOW_UPS_REQUIRED} follow-ups or an order` },
    adherence: { value: pct(counted(adherence), adherence.length), rows: adherence, sub: adherence.length ? `${counted(adherence)} of ${adherence.length} leads touched` : 'No leads touched yet' },
    coverage: { value: pct(counted(coverage), coverage.length), rows: coverage, sub: coverage.length ? `${counted(coverage)} of ${coverage.length} met in person` : 'None assigned in this period' },
    conversions: {
      value: counted(conversions), rows: conversions,
      sub: converted.length > counted(conversions) ? `${converted.length - counted(conversions)} more awaiting a fetched Enq ID` : undefined,
    },
    waitlist: waitlistKpi,
    handover: {
      value: pct(counted(handover), handover.length), rows: handover,
      sub: handover.length
        ? `${counted(handover)} of ${handover.length} signed off · ${converted.filter((l) => l.handover?.status === 'Accepted' && signedOffWithinTat(l.handover)).length} within 48h`
        : 'Nothing converted yet',
    },
    revenue: {
      value: Math.round((revenueSum / 1_00_000) * 100) / 100, rows: revenue,
      sub: [repeat ? `${repeat} repeat client(s) excluded` : '', unchecked ? `${unchecked} not checked for a prior order` : '']
        .filter(Boolean).join(' · ') || undefined,
    },
  };
}

export function kpiTarget(def: OutreachKpiDef, heads: number, period: Period): number | null {
  if (def.unit === '%') return def.target;
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
