import { OutreachLead } from '../mock-data';
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
  kind: 'Effort' | 'Output';
  target: number;
  unit: 'count' | '%' | 'L';
  rule: string;
}

export const OUTREACH_KPIS: OutreachKpiDef[] = [
  { key: 'newMeetings',      kind: 'Effort', label: 'New-lead meetings',   target: 50,  unit: 'count', rule: 'Unique firms whose first meeting was held this month, with notes, an owner/designer name and a 10-digit mobile.' },
  { key: 'followUpMeetings', kind: 'Effort', label: 'Follow-up meetings',  target: 30,  unit: 'count', rule: `Unique firms with a follow-up meeting held this month. A firm is fully followed up after ${FOLLOW_UPS_REQUIRED} follow-ups or an order.` },
  { key: 'adherence',        kind: 'Effort', label: 'CRM adherence',       target: 100, unit: '%',     rule: 'Leads touched this month with every mandatory field and log in place ÷ leads touched.' },
  { key: 'coverage',         kind: 'Effort', label: 'Inbound & EC coverage', target: 100, unit: '%',   rule: 'Inbound and EC-referral leads assigned this month that have had an in-person meeting ÷ those assigned.' },
  { key: 'conversions',      kind: 'Output', label: 'New conversions',     target: 15,  unit: 'count', rule: 'Leads moved to Converted this month whose first order was fetched from its Enq ID.' },
  { key: 'waitlist',         kind: 'Output', label: 'Studio Space waitlist', target: 30, unit: 'count', rule: 'Waitlist sign-ups this month whose mobile exactly matches a lead\'s mobile.' },
  { key: 'handover',         kind: 'Output', label: 'KAM handover',        target: 100, unit: '%',     rule: 'Leads converted this month that a KAM has signed off ÷ leads converted this month.' },
  { key: 'revenue',          kind: 'Output', label: 'New revenue',         target: 5,   unit: 'L',     rule: 'First-order value of this month\'s verified conversions, excluding numbers that ordered in the 6 months before.' },
];

export interface KpiValue {
  value: number | null;
  sub?: string;
}

export type OutreachKpis = Record<OutreachKpiKey, KpiValue>;

export const currentMonth = (today: string): string => today.slice(0, 7);

export const inMonth = (iso: string | undefined, month: string): boolean => istDay(iso).slice(0, 7) === month;

const pct = (num: number, den: number): number | null => (den ? Math.round((num / den) * 100) : null);

function touchedIn(l: OutreachLead, month: string): boolean {
  if (inMonth(l.createdAt, month) || inMonth(l.statusChangedAt, month)) return true;
  if ((l.meetings || []).some((m) => inMonth(m.date, month))) return true;
  return (l.journey || []).some((e) => inMonth(e.at, month));
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

export function outreachKpis(leads: OutreachLead[], month: string, waitlist: Map<string, WaitlistSignup> | null): OutreachKpis {
  const first = leads.map((l) => ({ l, m: completedMeetings(l.meetings)[0] })).filter((x) => x.m && inMonth(x.m.date, month));
  const genuine = first.filter(({ l, m }) => !!String(m.notes || '').trim() && !!String(l.contactPerson || '').trim() && isMobile(l.phone));
  const noPin = genuine.filter(({ m }) => !m.pin).length;

  const fuLeads = leads.filter((l) => followUpMeetings(l.meetings).some((m) => inMonth(m.date, month)));
  const fuDone = fuLeads.filter((l) => followUpMeetings(l.meetings).length >= FOLLOW_UPS_REQUIRED || l.status === 'Closed').length;

  const touched = leads.filter((l) => touchedIn(l, month) && !l.intake?.rejectedAt);
  const adherent = touched.filter((l) => outreachAdherence(l).length === 0).length;

  const toCover = leads.filter((l) => l.source && COVERAGE_SOURCES.includes(l.source) && !l.intake?.rejectedAt
    && inMonth(l.intake?.assignedAt || l.createdAt, month));
  const covered = toCover.filter((l) => completedMeetings(l.meetings).length > 0).length;

  const converted = leads.filter((l) => l.status === 'Closed' && inMonth(l.convertedAt || l.statusChangedAt, month));
  const verified = converted.filter(orderVerified);
  const accepted = converted.filter((l) => l.handover?.status === 'Accepted');
  const pendingHandover = converted.filter((l) => l.handover?.status === 'Pending').length;
  const repeat = verified.filter((l) => l.newOnboarding === false);
  const unchecked = verified.filter((l) => l.newOnboarding === undefined).length;
  const revenue = verified.filter((l) => l.newOnboarding !== false).reduce((a, l) => a + (Number(l.orderValue) || 0), 0);

  let waitlistKpi: KpiValue = { value: null, sub: 'Studio Space did not answer — count unknown' };
  if (waitlist) {
    const phones = new Set(leads.map((l) => normalisePhone(l.phone)).filter((p) => p.length === 10));
    const joined = [...phones].map((p) => waitlist.get(p)).filter((s): s is WaitlistSignup => !!s && inMonth(s.createdAt, month));
    const orderedPhones = new Set(leads.filter((l) => l.status === 'Closed').map((l) => normalisePhone(l.phone)));
    const ready = joined.filter((s) => orderedPhones.has(normalisePhone(s.phone))).length;
    waitlistKpi = { value: joined.length, sub: `${ready} also placed a first order — ready for Studio Space onboarding` };
  }

  return {
    newMeetings: {
      value: genuine.length,
      sub: [first.length - genuine.length ? `${first.length - genuine.length} more held but missing notes, name or mobile` : '', noPin ? `${noPin} with no live pin` : '']
        .filter(Boolean).join(' · ') || undefined,
    },
    followUpMeetings: { value: fuLeads.length, sub: `${fuDone} reached ${FOLLOW_UPS_REQUIRED} follow-ups or an order` },
    adherence: { value: pct(adherent, touched.length), sub: touched.length ? `${adherent} of ${touched.length} leads touched` : 'No leads touched yet' },
    coverage: { value: pct(covered, toCover.length), sub: toCover.length ? `${covered} of ${toCover.length} met in person` : 'None assigned this month' },
    conversions: { value: verified.length, sub: converted.length > verified.length ? `${converted.length - verified.length} more awaiting a fetched Enq ID` : undefined },
    waitlist: waitlistKpi,
    handover: {
      value: pct(accepted.length, converted.length),
      sub: converted.length
        ? `${accepted.length} of ${converted.length} signed off · ${accepted.filter((l) => signedOffWithinTat(l.handover)).length} within 48h${pendingHandover ? ` · ${pendingHandover} pending` : ''}`
        : 'Nothing converted yet',
    },
    revenue: {
      value: Math.round((revenue / 1_00_000) * 100) / 100,
      sub: [repeat.length ? `${repeat.length} repeat client(s) excluded` : '', unchecked ? `${unchecked} not checked for a prior order` : '']
        .filter(Boolean).join(' · ') || undefined,
    },
  };
}

export function kpiTarget(def: OutreachKpiDef, heads: number): number {
  return def.unit === '%' ? def.target : def.target * Math.max(1, heads);
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
