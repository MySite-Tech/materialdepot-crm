// ── Account health meter ──────────────────────────────────────────────────────
// Escalation-driven RAG score per KAM account. Pure functions over an escalation
// list plus a reference date, so the rules are testable and the same scoring runs
// on the KAM board and the Dashboard widget.
//
// Escalations live in b2b_lead.meta_data.escalations. The Django side does log
// escalation *events* (CRMLog sync_type raise_escalation / create_escalation_deal,
// keyed by Kylas deal id), but carries no category, tier or resolution date, so
// the classification the health meter needs is CRM-owned.

import type { KamClient } from './mockData';

export const ESCALATION_CATEGORIES = [
  'Delivery Delay',
  'Material Defect',
  'Pricing/Billing Discrepancy',
  'Sample Misplacement',
] as const;

export type EscalationCategory = typeof ESCALATION_CATEGORIES[number];

// Tier 1 is the most severe. An unresolved tier-1 pins the account to Red on its
// own, no matter how few escalations there are or how old they are.
export const ESCALATION_TIERS = [1, 2, 3] as const;
export type EscalationTier = typeof ESCALATION_TIERS[number];

export interface Escalation {
  id: string;
  raisedAt: string;           // YYYY-MM-DD
  category: EscalationCategory;
  tier: EscalationTier;
  resolvedAt?: string;        // YYYY-MM-DD; absent means still open
  note?: string;
  loggedBy?: string;
}

export type HealthStatus = 'green' | 'amber' | 'red';

// Scoring window and decay period. The brief said "last 30–60 days" for the
// window and "e.g. 30 days post-resolution" for the decay, so both are named
// constants rather than inline numbers.
export const HEALTH_WINDOW_DAYS = 60;
export const HEALTH_DECAY_DAYS = 30;

export const HEALTH_META: Record<HealthStatus, { label: string; color: string; description: string }> = {
  green: { label: 'Healthy',  color: '#22C55E', description: `No escalations in the last ${HEALTH_WINDOW_DAYS} days` },
  amber: { label: 'At Risk',  color: '#F59E0B', description: '1–2 recent escalations — KAM should intervene' },
  red:   { label: 'Critical', color: '#EF4444', description: '3+ recent escalations, or an unresolved tier-1 issue' },
};

// ── Date helpers (plain YYYY-MM-DD, no timezone games) ────────────────────────

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

// ── Which escalations still weigh on the score ────────────────────────────────

// An escalation counts when it was raised inside the rolling window AND has not
// decayed. Decay is what makes the score recover on its own: a resolved issue
// stops counting HEALTH_DECAY_DAYS after it was resolved, and everything drops
// out once it ages past the window. Nothing has to be reset by hand.
export function countsTowardScore(e: Escalation, today: string): boolean {
  const age = daysBetween(e.raisedAt, today);
  if (age === null || age < 0) return false;      // unparseable or dated in the future
  if (age > HEALTH_WINDOW_DAYS) return false;     // aged out of the window
  if (!e.resolvedAt) return true;                 // still open — always counts
  const sinceResolved = daysBetween(e.resolvedAt, today);
  if (sinceResolved === null) return true;
  return sinceResolved < HEALTH_DECAY_DAYS;       // decays 30 days post-resolution
}

// An unresolved tier-1 is deliberately not window-bound: an open critical issue
// does not become acceptable just because it has been open a long time.
export const hasOpenTier1 = (escalations: Escalation[]): boolean =>
  escalations.some((e) => e.tier === 1 && !isResolved(e));

export interface AccountHealth {
  status: HealthStatus;
  activeCount: number;          // escalations currently weighing on the score
  escalationCount: number;      // Escalation_Count — every escalation ever logged
  openCount: number;
  openTier1: boolean;
  byCategory: Record<EscalationCategory, number>;
  lastEscalatedAt?: string;
  // Days until this account would drop back to green if nothing new is logged.
  // null when already green, or when an open escalation blocks recovery.
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

  // Recovery is the soonest day every counting escalation has decayed. An open
  // one has no decay clock, so recovery is genuinely unknown until it's closed.
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

// ── Board / dashboard aggregation ─────────────────────────────────────────────

export interface AccountHealthRow {
  client: KamClient;
  health: AccountHealth;
  activePipeline: number;    // open cart value for this account, from the deal tickets
}

export interface HealthOverview {
  rows: AccountHealthRow[];               // every account, worst first
  attention: AccountHealthRow[];          // amber + red only, worst first
  counts: Record<HealthStatus, number>;
  pipelineAtRisk: Record<HealthStatus, number>;
  escalationCount: number;                // Escalation_Count across all accounts
  openCount: number;
  byCategory: Record<EscalationCategory, number>;
}

const STATUS_RANK: Record<HealthStatus, number> = { red: 0, amber: 1, green: 2 };

export function buildHealthOverview(
  clients: KamClient[],
  today: string,
  activePipelineFor: (client: KamClient) => number = () => 0,
): HealthOverview {
  const rows: AccountHealthRow[] = clients.map((client) => ({
    client,
    health: scoreAccount(client.escalations, today),
    activePipeline: activePipelineFor(client),
  }));

  // Worst status first, then by the pipeline at stake — the most expensive
  // critical account is the one a manager needs to see at the top.
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
