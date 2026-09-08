// ── B2B analytics — derive Dashboard / Leadership / Targets from live leads ────
// Pure functions over the pipelines fetched by fetchB2BData(). No mock numbers.

import type { B2BData } from '@/lib/b2bLeads';
import {
  INBOUND_STAGES, REP_TARGETS, B2B_ADMINS,
  type InboundLead, type OutreachLead, type KamClient,
  type InboundStage, type KamStage, type RepRole, type TargetStore,
} from './mockData';

// ── Stage semantics ───────────────────────────────────────────────────────────
// 'Enquiry Invalid' was retired as a stage by the Inbound PRD rollout — it is
// now a lost reason, so 'Lost' alone covers both.
const isInboundDead = (l: InboundLead) => l.stage === 'Lost';
// An account with a live cart counts as active, same as one with a PI out.
const KAM_ACTIVE_STAGES: KamStage[] = [
  'Quote Approval Pending', 'PI Shared', 'Awaiting Payment', 'Order Placed', 'Closed',
];
const isKamActive = (c: KamClient) => KAM_ACTIVE_STAGES.includes(c.stage);

const inboundOpen = (l: InboundLead) => l.stage !== 'Closed' && !isInboundDead(l);
const outreachOpen = (l: OutreachLead) => l.status !== 'Closed' && l.status !== 'Lost';
const kamOpen = (c: KamClient) => c.stage !== 'Closed' && c.stage !== 'Lost';

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

// ── Rep universe (configured reps ∪ reps seen in data, minus admins) ──────────
export function repUniverse(data: B2BData): string[] {
  const seen = new Set<string>(REP_TARGETS.map((r) => r.rep));
  data.inbound.forEach((l) => l.owner && seen.add(l.owner));
  data.outreach.forEach((l) => l.bm && seen.add(l.bm));
  data.kam.forEach((c) => c.kam && seen.add(c.kam));
  return [...seen].filter((r) => !B2B_ADMINS.includes(r));
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export interface DashboardMetrics {
  revenueGenerated: number;
  pipelineByStage: { label: string; count: number }[];
  pipelineByVertical: { inbound: number; outreach: number; kam: number };
  clients: { active: number; inactive: number };
  revenueBySource: { source: string; value: number }[];
}

export function computeDashboard(data: B2BData): DashboardMetrics {
  const { inbound, outreach, kam } = data;

  const wonInbound = inbound.filter((l) => l.stage === 'Closed');
  const wonOutreach = outreach.filter((l) => l.status === 'Closed');
  const wonKam = kam.filter((c) => c.stage === 'Closed');
  // Counted in the funnel's Won column but NOT in revenue: revenue stays keyed on
  // 'Closed' so auto-advance can't silently inflate the reported figure.
  const orderPlacedKam = kam.filter((c) => c.stage === 'Order Placed');

  const revInbound = sum(wonInbound.map((l) => l.value));
  // `value` on an outreach lead is the deal ticket's order value or nothing —
  // never the BM's `expectedOrderValue`. See the field's doc comment.
  const revOutreach = sum(wonOutreach.map((l) => l.value));
  const revKam = sum(wonKam.map((c) => c.value));

  const newCount =
    data.inboundTotal +
    outreach.filter((l) => l.status === 'Yet to Meet').length;
  const inProgressCount =
    inbound.filter((l) => l.stage === 'Follow up').length +
    outreach.filter((l) => l.status === 'Follow up' || l.status === 'Quote Share').length +
    kam.filter((c) => ['No Active Enquiry', 'Quote Approval Pending', 'Awaiting Payment'].includes(c.stage)).length;
  const piCount =
    inbound.filter((l) => l.stage === 'PI Shared').length +
    outreach.filter((l) => l.status === 'PI Shared').length +
    kam.filter((c) => c.stage === 'PI Shared').length;
  const wonCount = wonInbound.length + wonOutreach.length + wonKam.length + orderPlacedKam.length;

  return {
    revenueGenerated: revInbound + revOutreach + revKam,
    pipelineByStage: [
      { label: 'New', count: newCount },
      { label: 'In Progress', count: inProgressCount },
      { label: 'PI Shared', count: piCount },
      { label: 'Won', count: wonCount },
    ],
    pipelineByVertical: {
      inbound: sum(inbound.filter(inboundOpen).map((l) => l.value)),
      // Open outreach pipeline is the BM's own estimate — no deal ticket exists
      // before PI Shared, so `value` is 0 on most of these rows. Labelled as an
      // estimate wherever it is rendered.
      outreach: sum(outreach.filter(outreachOpen).map((l) => l.orderValue || l.expectedOrderValue || 0)),
      kam: sum(kam.filter(kamOpen).map((c) => c.value)),
    },
    clients: {
      active: kam.filter(isKamActive).length,
      inactive: kam.filter((c) => !isKamActive(c)).length,
    },
    revenueBySource: [
      { source: 'Inbound', value: revInbound },
      { source: 'Outreach', value: revOutreach },
      { source: 'KAM Direct', value: revKam },
    ],
  };
}

// ── Leadership ────────────────────────────────────────────────────────────────
export interface RepLeaderboardRow {
  rep: string;
  inbound: number;
  outreach: number;
  clients: number;
  revenue: number;
}

export interface LeadershipData {
  leaderboard: RepLeaderboardRow[];
  closingThisWeek: { company: string; expected: string; value: number }[];
  inboundFunnel: { label: InboundStage; count: number }[];
  orderWonFunnel: { label: string; count: number }[];
  topClientsByRevenue: { client: string; kam: string; value: number }[];
  topClientsByOrders: { client: string; orders: number }[];
}

function withinDays(dateStr: string | undefined, from: Date, days: number): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  return d >= start && d <= end;
}

export function computeLeadership(data: B2BData, now: Date): LeadershipData {
  const { inbound, outreach, kam } = data;

  const leaderboard: RepLeaderboardRow[] = repUniverse(data)
    .map((rep) => ({
      rep,
      // New-stage leads from the Kylas per-owner total + promoted (non-New) loaded rows.
      inbound: (data.inboundOwnerTotals[rep] || 0) + inbound.filter((l) => l.owner === rep && l.stage !== 'New').length,
      outreach: outreach.filter((l) => l.bm === rep).length,
      clients: kam.filter((c) => c.kam === rep && c.stage !== 'Lost').length,
      revenue:
        sum(inbound.filter((l) => l.owner === rep && l.stage === 'Closed').map((l) => l.value)) +
        sum(outreach.filter((l) => l.bm === rep && l.status === 'Closed').map((l) => l.value)) +
        sum(kam.filter((c) => c.kam === rep && c.stage === 'Closed').map((c) => c.value)),
    }))
    .sort((a, b) => b.revenue - a.revenue || b.clients - a.clients || b.inbound + b.outreach - (a.inbound + a.outreach));

  // Found by Expected date of closure within this week.
  //
  // Inbound contributes its **next follow-up date**, not an expected-closure
  // date. Kylas's `expectedClosureOn` is auto-stamped ~14 minutes after the
  // lead is created, so every inbound lead used to land in this list with a
  // meaningless date; the PRD defines no expected-closure field for inbound and
  // `followUpDate` is the only forward date the team actually sets.
  const closing = [
    ...inbound.filter((l) => inboundOpen(l) && withinDays(l.followUpDate, now, 7)).map((l) => ({ company: l.company, expected: l.followUpDate!, value: l.value })),
    ...outreach.filter((l) => outreachOpen(l) && withinDays(l.expectedClosure, now, 7)).map((l) => ({ company: l.company, expected: l.expectedClosure!, value: l.orderValue || l.expectedOrderValue || 0 })),
    ...kam.filter((c) => kamOpen(c) && withinDays(c.expectedClosure, now, 7)).map((c) => ({ company: c.company, expected: c.expectedClosure!, value: c.value })),
  ].sort((a, b) => a.expected.localeCompare(b.expected));

  const inboundFunnel = INBOUND_STAGES.map((label) => ({
    label,
    count: label === 'New' ? data.inboundTotal : inbound.filter((l) => l.stage === label).length,
  }));

  const nonNewLoaded = inbound.filter((l) => l.stage !== 'New').length;
  const orderWonFunnel = [
    { label: 'Total Leads', count: data.inboundTotal + nonNewLoaded },
    { label: 'Follow-up', count: inbound.filter((l) => l.stage === 'Follow up').length },
    { label: 'PI Shared', count: inbound.filter((l) => l.stage === 'PI Shared').length },
    { label: 'Order Won', count: inbound.filter((l) => l.stage === 'Closed').length },
  ];

  // Per-company rollup across every pipeline.
  type Agg = { value: number; orders: number; owner: string };
  const byCompany = new Map<string, Agg>();
  const bump = (company: string, value: number, won: boolean, owner: string) => {
    if (!company) return;
    const a = byCompany.get(company) || { value: 0, orders: 0, owner };
    a.value += value;
    if (won) a.orders += 1;
    if (!a.owner) a.owner = owner;
    byCompany.set(company, a);
  };
  inbound.filter((l) => !isInboundDead(l)).forEach((l) => bump(l.company, l.value, l.stage === 'Closed', l.owner));
  outreach.filter((l) => l.status !== 'Lost').forEach((l) => bump(l.company, l.value, l.status === 'Closed', l.bm));
  kam.filter((c) => c.stage !== 'Lost').forEach((c) => bump(c.company, c.value, c.stage === 'Closed', c.kam));

  const topClientsByRevenue = [...byCompany.entries()]
    .filter(([, a]) => a.value > 0)
    .map(([client, a]) => ({ client, kam: a.owner || '—', value: a.value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const topClientsByOrders = [...byCompany.entries()]
    .filter(([, a]) => a.orders > 0)
    .map(([client, a]) => ({ client, orders: a.orders }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 6);

  return { leaderboard, closingThisWeek: closing, inboundFunnel, orderWonFunnel, topClientsByRevenue, topClientsByOrders };
}

// ── Targets (actuals merged with editable goals) ──────────────────────────────
export interface RepTargetRow {
  rep: string;
  role: RepRole;
  revenue: number;          // achieved (₹)
  activeClients: number;    // KAM actual
  newOnboardings: number;   // Inbound / Outreach actual (converted)
  revenueTargetL: number;
  clientsTarget: number;
  onboardingsTarget: number;
}

export function computeTargets(data: B2BData, store: TargetStore): RepTargetRow[] {
  const { inbound, outreach, kam } = data;
  return REP_TARGETS.map((cfg) => {
    const goal = store.reps[cfg.rep] || cfg;
    const revenue =
      sum(inbound.filter((l) => l.owner === cfg.rep && l.stage === 'Closed').map((l) => l.value)) +
      sum(outreach.filter((l) => l.bm === cfg.rep && l.status === 'Closed').map((l) => l.value)) +
      sum(kam.filter((c) => c.kam === cfg.rep && c.stage === 'Closed').map((c) => c.value));
    const activeClients = kam.filter((c) => c.kam === cfg.rep && c.stage !== 'Lost').length;
    const newOnboardings =
      inbound.filter((l) => l.owner === cfg.rep && l.stage === 'Closed').length +
      outreach.filter((l) => l.bm === cfg.rep && l.status === 'Closed').length;
    return {
      rep: cfg.rep,
      role: cfg.role,
      revenue,
      activeClients,
      newOnboardings,
      revenueTargetL: goal.revenueTargetL,
      clientsTarget: goal.clientsTarget,
      onboardingsTarget: goal.onboardingsTarget,
    };
  });
}
