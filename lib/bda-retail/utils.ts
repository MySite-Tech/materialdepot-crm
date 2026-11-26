import { AUTO_REFRESH_HOURS, BDA_RETAIL_ACCESS, BDA_ROLE, CALL_OUTCOMES, COHORT_BY_KEY, COHORTS, MAX_PLAUSIBLE_VALUE, MAX_UNANSWERED, PLAN_PRIORITIES } from './constants';
import { normalisePhone } from '../org/utils';
import type { BankState, CallLog, CallOutcome, CohortKey, LeadStage, LeadView, Priority } from './types';

export const accessName = (name?: string | null): string => String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

const ACCESS = new Set(BDA_RETAIL_ACCESS.map(accessName));

export const isBdaAdmin = (u?: { name?: string | null } | null): boolean => ACCESS.has(accessName(u?.name));

export const isBda = (u?: { role?: string | null } | null): boolean => u?.role === BDA_ROLE;

export const canUseBdaRetail = (u?: { name?: string | null; role?: string | null } | null): boolean => isBdaAdmin(u) || isBda(u);

export const cohortsFor = (priorities: Priority[]): CohortKey[] =>
  COHORTS.filter((c) => priorities.includes(c.priority)).map((c) => c.key);

export const istToday = (): string => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

export const shiftDays = (date: string, days: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const istDate = (iso?: string | null): string => {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : new Date(t + 330 * 60_000).toISOString().slice(0, 10);
};

export const planPriorities = (month: string, plan: BankState['plan']): Priority[] =>
  plan[month] ?? PLAN_PRIORITIES.find((p) => month >= p.from)?.priorities ?? ['P1'];

const outcome = (k: CallOutcome) => CALL_OUTCOMES.find((o) => o.key === k);

export const isConnected = (c: CallLog): boolean => !!outcome(c.outcome)?.connected;

const stageOf = (calls: CallLog[]): { stage: LeadStage; nextOn: string } => {
  if (calls.length === 0) return { stage: 'new', nextOn: '' };
  const last = calls[calls.length - 1];
  if (outcome(last.outcome)?.closes) return { stage: 'closed', nextOn: '' };
  if (last.followUpOn) return { stage: 'follow_up', nextOn: last.followUpOn };
  const unanswered = calls.length - calls.filter(isConnected).length;
  return unanswered >= MAX_UNANSWERED && !calls.some(isConnected)
    ? { stage: 'unreachable', nextOn: '' }
    : { stage: 'attempting', nextOn: '' };
};

export const leadViews = (state: BankState): LeadView[] => {
  const callsByKey = new Map<string, CallLog[]>();
  for (const c of state.calls) {
    const list = callsByKey.get(c.key);
    if (list) list.push(c);
    else callsByKey.set(c.key, [c]);
  }
  return state.leads.map((l) => {
    const calls = (callsByKey.get(l.key) ?? []).sort((a, b) => a.at.localeCompare(b.at));
    return {
      ...l,
      priority: COHORT_BY_KEY[l.cohort].priority,
      month: l.enteredOn.slice(0, 7),
      calls,
      ...stageOf(calls),
    };
  });
};

const PRIORITY_RANK: Record<Priority, number> = { P1: 0, P2: 1, P3: 2 };

export const lifo = (a: LeadView, b: LeadView): number =>
  PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  || b.enteredOn.localeCompare(a.enteredOn)
  || b.value - a.value
  || a.key.localeCompare(b.key);

export const isMine = (l: LeadView, phone: string): boolean => !!l.claim && normalisePhone(l.claim.byPhone) === normalisePhone(phone);

export const queueFor = (views: LeadView[], phone: string, active: Priority[], today: string): {
  due: LeadView[];
  fresh: LeadView[];
  retry: LeadView[];
} => {
  const on = new Set(active);
  const due = views
    .filter((l) => isMine(l, phone) && l.stage === 'follow_up' && l.nextOn <= today)
    .sort((a, b) => a.nextOn.localeCompare(b.nextOn) || lifo(a, b));
  const retry = views
    .filter((l) => isMine(l, phone) && l.stage === 'attempting' && istDate(l.calls[l.calls.length - 1].at) < today)
    .sort(lifo);
  const fresh = views.filter((l) => !l.claim && l.stage === 'new' && on.has(l.priority)).sort(lifo);
  return { due, fresh, retry };
};

export interface BdaStats {
  name: string;
  phone: string;
  dials: number;
  firstAttempts: number;
  followUpCalls: number;
  connectedLeads: number;
  leadsCalled: number;
  connectivity: number | null;
  ordered: number;
}

export const statsByBda = (views: LeadView[], from: string, to: string): BdaStats[] => {
  const by = new Map<string, BdaStats & { called: Set<string>; connected: Set<string> }>();
  for (const l of views) {
    l.calls.forEach((c, i) => {
      const day = istDate(c.at);
      if (day < from || day > to) return;
      const phone = normalisePhone(c.byPhone);
      const row = by.get(phone) ?? {
        name: c.by, phone, dials: 0, firstAttempts: 0, followUpCalls: 0, connectedLeads: 0,
        leadsCalled: 0, connectivity: null, ordered: 0, called: new Set<string>(), connected: new Set<string>(),
      };
      row.dials += 1;
      if (i === 0) row.firstAttempts += 1;
      else row.followUpCalls += 1;
      row.called.add(l.key);
      if (isConnected(c)) row.connected.add(l.key);
      if (c.outcome === 'ordered') row.ordered += 1;
      by.set(phone, row);
    });
  }
  return [...by.values()]
    .map(({ called, connected, ...r }) => ({
      ...r,
      leadsCalled: called.size,
      connectedLeads: connected.size,
      connectivity: called.size ? connected.size / called.size : null,
    }))
    .sort((a, b) => b.dials - a.dials);
};

export const rupees = (n: number): string => {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(2)} L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
};

export const plausible = (n: number): number => (n > 0 && n <= MAX_PLAUSIBLE_VALUE ? n : 0);

export const COHORT_GROUPS = [...new Set(COHORTS.map((c) => c.group))];

export type BankLens = 'all' | `group:${string}` | CohortKey;

export const bankLensMatches = (lens: BankLens, l: LeadView): boolean =>
  lens === 'all'
  || (lens.startsWith('group:') ? COHORT_BY_KEY[l.cohort].group === lens.slice(6) : l.cohort === lens);

export type QueueLens = 'due' | 'retry' | 'fresh' | 'today';

const mineOn = (c: CallLog, phone: string, day: string) => c.byPhone === normalisePhone(phone) && istDate(c.at) === day;

export const calledToday = (views: LeadView[], phone: string, today: string): LeadView[] =>
  views.filter((l) => l.calls.some((c) => mineOn(c, phone, today)));

export const dialsOn = (views: LeadView[], phone: string, day: string): number =>
  views.reduce((n, l) => n + l.calls.filter((c) => mineOn(c, phone, day)).length, 0);

export const bankIsStale = (imports: { at: string }[], now: number): boolean =>
  !imports.length || now - Date.parse(imports[0].at) > AUTO_REFRESH_HOURS * 3_600_000;
