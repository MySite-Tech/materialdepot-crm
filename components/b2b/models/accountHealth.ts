export interface HealthSubject {
  id: string;
  company: string;
  kam?: string;
  escalations?: Escalation[];
}

export const ESCALATION_CATEGORIES = [
  'Delivery Delay',
  'Material Defect',
  'Pricing/Billing Discrepancy',
  'Sample Misplacement',
] as const;

export type EscalationCategory = typeof ESCALATION_CATEGORIES[number];

export const ESCALATION_TIERS = [1, 2, 3] as const;
export type EscalationTier = typeof ESCALATION_TIERS[number];

export interface Escalation {
  id: string;
  raisedAt: string;
  category: EscalationCategory;
  tier: EscalationTier;
  resolvedAt?: string;
  note?: string;
  loggedBy?: string;
}

export type HealthStatus = 'green' | 'amber' | 'red';

export const HEALTH_WINDOW_DAYS = 60;
export const HEALTH_DECAY_DAYS = 30;

export const HEALTH_META: Record<HealthStatus, { label: string; color: string; description: string }> = {
  green: { label: 'Healthy',  color: '#22C55E', description: `No escalations in the last ${HEALTH_WINDOW_DAYS} days` },
  amber: { label: 'At Risk',  color: '#F59E0B', description: '1–2 recent escalations — KAM should intervene' },
  red:   { label: 'Critical', color: '#EF4444', description: '3+ recent escalations, or an unresolved tier-1 issue' },
};

const DAY_MS = 86_400_000;

function toUtcMs(day: string): number | null {
  const ms = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms;
}

export function daysBetween(from: string, to: string): number | null {
  const a = toUtcMs(from);
  const b = toUtcMs(to);
  if (a === null || b === null) return null;
  return Math.floor((b - a) / DAY_MS);
}

export const isResolved = (e: Escalation): boolean => !!e.resolvedAt;

export function countsTowardScore(e: Escalation, today: string): boolean {
  const age = daysBetween(e.raisedAt, today);
  if (age === null || age < 0) return false;
  if (age > HEALTH_WINDOW_DAYS) return false;
  if (!e.resolvedAt) return true;
  const sinceResolved = daysBetween(e.resolvedAt, today);
  if (sinceResolved === null) return true;
  return sinceResolved < HEALTH_DECAY_DAYS;
}

export const hasOpenTier1 = (escalations: Escalation[]): boolean =>
  escalations.some((e) => e.tier === 1 && !isResolved(e));

export interface AccountHealth {
  status: HealthStatus;
  activeCount: number;
  escalationCount: number;
  openCount: number;
  openTier1: boolean;
  byCategory: Record<EscalationCategory, number>;
  lastEscalatedAt?: string;

  daysToRecovery: number | null;
  reason: string;
}

export function scoreAccount(escalations: Escalation[] | undefined, today: string): AccountHealth {
  const list = escalations || [];
  const counting = list.filter((e) => countsTowardScore(e, today));
  const open = list.filter((e) => !isResolved(e));
  const openTier1 = hasOpenTier1(list);

  const byCategory = ESCALATION_CATEGORIES.reduce((acc, c) => {
    acc[c] = list.filter((e) => e.category === c).length;
    return acc;
  }, {} as Record<EscalationCategory, number>);

  let status: HealthStatus;
  let reason: string;
  if (openTier1) {
    status = 'red';
    reason = 'Unresolved tier-1 issue';
  } else if (counting.length >= 3) {
    status = 'red';
    reason = `${counting.length} escalations in the last ${HEALTH_WINDOW_DAYS} days`;
  } else if (counting.length >= 1) {
    status = 'amber';
    reason = `${counting.length} escalation${counting.length === 1 ? '' : 's'} in the last ${HEALTH_WINDOW_DAYS} days`;
  } else {
    status = 'green';
    reason = list.length
      ? `No escalations in the last ${HEALTH_WINDOW_DAYS} days`
      : 'No escalations logged';
  }

  const lastEscalatedAt = list
    .map((e) => e.raisedAt)
    .filter(Boolean)
    .sort()
    .pop();

  let daysToRecovery: number | null = null;
  if (status !== 'green') {
    if (counting.some((e) => !isResolved(e)) || openTier1) {
      daysToRecovery = null;
    } else {
      const waits = counting.map((e) => {
        const byWindow = HEALTH_WINDOW_DAYS - (daysBetween(e.raisedAt, today) ?? 0);
        const byDecay = HEALTH_DECAY_DAYS - (daysBetween(e.resolvedAt!, today) ?? 0);
        return Math.max(0, Math.min(byWindow, byDecay));
      });
      daysToRecovery = waits.length ? Math.max(...waits) : 0;
    }
  }

  return {
    status,
    activeCount: counting.length,
    escalationCount: list.length,
    openCount: open.length,
    openTier1,
    byCategory,
    lastEscalatedAt,
    daysToRecovery,
    reason,
  };
}

export interface AccountHealthRow<T extends HealthSubject = HealthSubject> {
  client: T;
  health: AccountHealth;
  activePipeline: number;
}

export interface HealthOverview<T extends HealthSubject = HealthSubject> {
  rows: AccountHealthRow<T>[];
  attention: AccountHealthRow<T>[];
  counts: Record<HealthStatus, number>;
  pipelineAtRisk: Record<HealthStatus, number>;
  escalationCount: number;
  openCount: number;
  byCategory: Record<EscalationCategory, number>;
}

const STATUS_RANK: Record<HealthStatus, number> = { red: 0, amber: 1, green: 2 };

export function buildHealthOverview<T extends HealthSubject>(
  clients: T[],
  today: string,
  activePipelineFor: (client: T) => number = () => 0,
): HealthOverview<T> {
  const rows: AccountHealthRow<T>[] = clients.map((client) => ({
    client,
    health: scoreAccount(client.escalations, today),
    activePipeline: activePipelineFor(client),
  }));

  rows.sort((a, b) =>
    STATUS_RANK[a.health.status] - STATUS_RANK[b.health.status]
    || b.activePipeline - a.activePipeline
    || b.health.activeCount - a.health.activeCount);

  const counts: Record<HealthStatus, number> = { green: 0, amber: 0, red: 0 };
  const pipelineAtRisk: Record<HealthStatus, number> = { green: 0, amber: 0, red: 0 };
  const byCategory = ESCALATION_CATEGORIES.reduce((acc, c) => {
    acc[c] = 0;
    return acc;
  }, {} as Record<EscalationCategory, number>);
  let escalationCount = 0;
  let openCount = 0;

  for (const row of rows) {
    counts[row.health.status]++;
    pipelineAtRisk[row.health.status] += row.activePipeline;
    escalationCount += row.health.escalationCount;
    openCount += row.health.openCount;
    for (const c of ESCALATION_CATEGORIES) byCategory[c] += row.health.byCategory[c];
  }

  return {
    rows,
    attention: rows.filter((r) => r.health.status !== 'green'),
    counts,
    pipelineAtRisk,
    escalationCount,
    openCount,
    byCategory,
  };
}
