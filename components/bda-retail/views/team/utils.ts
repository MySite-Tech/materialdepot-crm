import { CALL_OUTCOMES, COHORTS, PLAN_CONNECTIVITY } from '@/lib/bda-retail/constants';
import type { CallLog, CallOutcome, CohortKey, LeadView, Priority } from '@/lib/bda-retail/types';
import { isConnected, istDate, shiftDays } from '@/lib/bda-retail/utils';

export type Period = 'today' | 'yesterday' | 'week' | 'month' | 'lastMonth';

export const periodRange = (p: Period, today: string): { from: string; to: string } => {
  const monthStart = `${today.slice(0, 8)}01`;
  if (p === 'today') return { from: today, to: today };
  if (p === 'yesterday') return { from: shiftDays(today, -1), to: shiftDays(today, -1) };
  if (p === 'week') return { from: shiftDays(today, -6), to: today };
  if (p === 'month') return { from: monthStart, to: today };
  const lastEnd = shiftDays(monthStart, -1);
  return { from: `${lastEnd.slice(0, 8)}01`, to: lastEnd };
};

export interface Tally {
  dials: number;
  firstAttempts: number;
  followUpCalls: number;
  customers: number;
  connected: number;
  connectivity: number | null;
  ordered: number;
  conversion: number | null;
  days: number;
  dialsPerDay: number | null;
  outcomes: Record<CallOutcome, number>;
}

class Acc {
  dials = 0;
  first = 0;
  customers = new Set<string>();
  connected = new Set<string>();
  ordered = new Set<string>();
  days = new Set<string>();
  outcomes = Object.fromEntries(CALL_OUTCOMES.map((o) => [o.key, 0])) as Record<CallOutcome, number>;

  add(c: CallLog, first: boolean) {
    this.dials += 1;
    if (first) this.first += 1;
    this.customers.add(c.key);
    if (isConnected(c)) this.connected.add(c.key);
    if (c.outcome === 'ordered') this.ordered.add(c.key);
    this.days.add(istDate(c.at));
    this.outcomes[c.outcome] += 1;
  }

  tally(): Tally {
    const customers = this.customers.size;
    const connected = this.connected.size;
    return {
      dials: this.dials,
      firstAttempts: this.first,
      followUpCalls: this.dials - this.first,
      customers,
      connected,
      connectivity: customers ? connected / customers : null,
      ordered: this.ordered.size,
      conversion: connected ? this.ordered.size / connected : null,
      days: this.days.size,
      dialsPerDay: this.days.size ? this.dials / this.days.size : null,
      outcomes: this.outcomes,
    };
  }
}

export interface BdaRow extends Tally {
  phone: string;
  name: string;
  held: number;
  overdue: number;
  dueToday: number;
  lastCallAt: string;
}

export interface CohortRow extends Tally {
  key: CohortKey;
  label: string;
  priority: Priority;
  inBank: number;
  notCalled: number;
  planConnectivity: number;
}

export interface TeamStats {
  total: Tally;
  bdas: BdaRow[];
  cohorts: CohortRow[];
  byDay: Array<{ day: string; bdas: number } & Tally>;
  byHour: number[];
}

const ACTIVE_HOURS = 24;

const istHour = (iso: string): number => new Date(Date.parse(iso) + 330 * 60_000).getUTCHours();

export function teamStats(views: LeadView[], from: string, to: string, today: string): TeamStats {
  const total = new Acc();
  const byBda = new Map<string, { name: string; acc: Acc; lastCallAt: string }>();
  const byCohort = new Map<CohortKey, Acc>();
  const byDay = new Map<string, { acc: Acc; people: Set<string> }>();
  const byHour = Array.from({ length: ACTIVE_HOURS }, () => 0);

  for (const l of views) {
    l.calls.forEach((c, i) => {
      const day = istDate(c.at);
      const person = byBda.get(c.byPhone) ?? { name: c.by, acc: new Acc(), lastCallAt: '' };
      if (c.at > person.lastCallAt) person.lastCallAt = c.at;
      byBda.set(c.byPhone, person);
      if (day < from || day > to) return;
      total.add(c, i === 0);
      person.acc.add(c, i === 0);
      const cohort = byCohort.get(l.cohort) ?? new Acc();
      cohort.add(c, i === 0);
      byCohort.set(l.cohort, cohort);
      const d = byDay.get(day) ?? { acc: new Acc(), people: new Set<string>() };
      d.acc.add(c, i === 0);
      d.people.add(c.byPhone);
      byDay.set(day, d);
      byHour[istHour(c.at)] += 1;
    });
    if (l.claim && !byBda.has(l.claim.byPhone)) byBda.set(l.claim.byPhone, { name: l.claim.by, acc: new Acc(), lastCallAt: '' });
  }

  const bdas: BdaRow[] = [...byBda.entries()].map(([phone, p]) => {
    const mine = views.filter((l) => l.claim?.byPhone === phone);
    const open = mine.filter((l) => l.stage !== 'closed' && l.stage !== 'unreachable');
    return {
      ...p.acc.tally(),
      phone,
      name: p.name,
      held: open.length,
      overdue: open.filter((l) => l.stage === 'follow_up' && l.nextOn < today).length,
      dueToday: open.filter((l) => l.stage === 'follow_up' && l.nextOn === today).length,
      lastCallAt: p.lastCallAt,
    };
  }).sort((a, b) => b.dials - a.dials || a.name.localeCompare(b.name));

  const cohorts: CohortRow[] = COHORTS.map((c) => {
    const inBank = views.filter((l) => l.cohort === c.key);
    return {
      ...(byCohort.get(c.key) ?? new Acc()).tally(),
      key: c.key,
      label: c.label,
      priority: c.priority,
      inBank: inBank.length,
      notCalled: inBank.filter((l) => l.stage === 'new').length,
      planConnectivity: PLAN_CONNECTIVITY[c.priority],
    };
  });

  return {
    total: total.tally(),
    bdas,
    cohorts,
    byDay: [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([day, d]) => ({ day, bdas: d.people.size, ...d.acc.tally() })),
    byHour,
  };
}

export const pct = (v: number | null, digits = 0): string => (v === null ? '—' : `${(v * 100).toFixed(digits)}%`);

export const num = (v: number | null, digits = 0): string => (v === null ? '—' : v.toLocaleString('en-IN', { maximumFractionDigits: digits }));
