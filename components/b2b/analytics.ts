// ── B2B analytics — derive Dashboard / Leadership / Targets from live leads ────
// Pure functions over the pipelines fetched by fetchB2BData(). No mock numbers.

import type { B2BData } from '@/lib/b2bLeads';
import {
  INBOUND_STAGES, REP_TARGETS, B2B_ADMINS,
  type InboundLead, type OutboundLead, type KamClient,
  type InboundStage, type KamStage, type RepRole, type TargetStore,
} from './mockData';

// ── Stage semantics ───────────────────────────────────────────────────────────
const isInboundDead = (l: InboundLead) => l.stage === 'Lost' || l.stage === 'Enquiry Invalid';
// An account with a live cart counts as active, same as one with a PI out.
const KAM_ACTIVE_STAGES: KamStage[] = [
  'Quote Approval Pending', 'PI Shared', 'Awaiting Payment', 'Order Placed', 'Closed',
];
const isKamActive = (c: KamClient) => KAM_ACTIVE_STAGES.includes(c.stage);

const inboundOpen = (l: InboundLead) => l.stage !== 'Closed' && !isInboundDead(l);
const outboundOpen = (l: OutboundLead) => l.stage !== 'Closed' && l.stage !== 'Lost';
const kamOpen = (c: KamClient) => c.stage !== 'Closed' && c.stage !== 'Lost';

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

// ── Rep universe (configured reps ∪ reps seen in data, minus admins) ──────────
export function repUniverse(data: B2BData): string[] {
  const seen = new Set<string>(REP_TARGETS.map((r) => r.rep));
  data.inbound.forEach((l) => l.owner && seen.add(l.owner));
  data.outbound.forEach((l) => l.bda && seen.add(l.bda));
  data.kam.forEach((c) => c.kam && seen.add(c.kam));
  return [...seen].filter((r) => !B2B_ADMINS.includes(r));
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export interface DashboardMetrics {
  revenueGenerated: number;
  pipelineByStage: { label: string; count: number }[];
  pipelineByVertical: { inbound: number; outbound: number; kam: number };
  clients: { active: number; inactive: number };
  revenueBySource: { source: string; value: number }[];
}

export function computeDashboard(data: B2BData): DashboardMetrics {
  const { inbound, outbound, kam } = data;

  const wonInbound = inbound.filter((l) => l.stage === 'Closed');
  const wonOutbound = outbound.filter((l) => l.stage === 'Closed');
  const wonKam = kam.filter((c) => c.stage === 'Closed');
  // Counted in the funnel's Won column but NOT in revenue: revenue stays keyed on
  // 'Closed' so auto-advance can't silently inflate the reported figure.
  const orderPlacedKam = kam.filter((c) => c.stage === 'Order Placed');

  const revInbound = sum(wonInbound.map((l) => l.value));
  const revOutbound = sum(wonOutbound.map((l) => l.value));
  const revKam = sum(wonKam.map((c) => c.value));

  const newCount =
    data.inboundTotal +
    outbound.filter((l) => l.stage === 'Yet to Meet').length;
  const inProgressCount =
    inbound.filter((l) => ['RNR', 'Followup Required', 'Quote'].includes(l.stage)).length +
    outbound.filter((l) => ['In Progress', 'Samples/Catalogues Shared'].includes(l.stage)).length +
    kam.filter((c) => ['No Active Enquiry', 'Quote Approval Pending', 'Awaiting Payment'].includes(c.stage)).length;
  const piCount =
    inbound.filter((l) => l.stage === 'PI Shared').length +
    outbound.filter((l) => l.stage === 'PI Shared').length +
    kam.filter((c) => c.stage === 'PI Shared').length;
  const wonCount = wonInbound.length + wonOutbound.length + wonKam.length + orderPlacedKam.length;

  return {
    revenueGenerated: revInbound + revOutbound + revKam,
    pipelineByStage: [
      { label: 'New', count: newCount },
      { label: 'In Progress', count: inProgressCount },
      { label: 'PI Shared', count: piCount },
      { label: 'Won', count: wonCount },
    ],
    pipelineByVertical: {
      inbound: sum(inbound.filter(inboundOpen).map((l) => l.value)),
      outbound: sum(outbound.filter(outboundOpen).map((l) => l.value)),
      kam: sum(kam.filter(kamOpen).map((c) => c.value)),
    },
    clients: {
      active: kam.filter(isKamActive).length,
      inactive: kam.filter((c) => !isKamActive(c)).length,
    },
    revenueBySource: [
      { source: 'Inbound', value: revInbound },
      { source: 'Outbound', value: revOutbound },
      { source: 'KAM Direct', value: revKam },
    ],
  };
}

// ── Leadership ────────────────────────────────────────────────────────────────
export interface RepLeaderboardRow {
  rep: string;
  inbound: number;
  outbound: number;
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
  const { inbound, outbound, kam } = data;

  const leaderboard: RepLeaderboardRow[] = repUniverse(data)
    .map((rep) => ({
      rep,
      // New-stage leads from the Kylas per-owner total + promoted (non-New) loaded rows.
      inbound: (data.inboundOwnerTotals[rep] || 0) + inbound.filter((l) => l.owner === rep && l.stage !== 'New').length,
      outbound: outbound.filter((l) => l.bda === rep).length,
      clients: kam.filter((c) => c.kam === rep && c.stage !== 'Lost').length,
      revenue:
        sum(inbound.filter((l) => l.owner === rep && l.stage === 'Closed').map((l) => l.value)) +
        sum(outbound.filter((l) => l.bda === rep && l.stage === 'Closed').map((l) => l.value)) +
        sum(kam.filter((c) => c.kam === rep && c.stage === 'Closed').map((c) => c.value)),
    }))
    .sort((a, b) => b.revenue - a.revenue || b.clients - a.clients || b.inbound + b.outbound - (a.inbound + a.outbound));

  // Found by Expected date of closure within this week. Skip raw New inbound leads
  // (Kylas auto-populates their closure date) — outbound/KAM are rep-managed.
  const closing = [
    ...inbound.filter((l) => l.stage !== 'New' && inboundOpen(l) && withinDays(l.expectedClosure, now, 7)).map((l) => ({ company: l.company, expected: l.expectedClosure!, value: l.value })),
    ...outbound.filter((l) => outboundOpen(l) && withinDays(l.expectedClosure, now, 7)).map((l) => ({ company: l.company, expected: l.expectedClosure!, value: l.value })),
    ...kam.filter((c) => kamOpen(c) && withinDays(c.expectedClosure, now, 7)).map((c) => ({ company: c.company, expected: c.expectedClosure!, value: c.value })),
  ].sort((a, b) => a.expected.localeCompare(b.expected));

  const inboundFunnel = INBOUND_STAGES.map((label) => ({
    label,
    count: label === 'New' ? data.inboundTotal : inbound.filter((l) => l.stage === label).length,
  }));

  const nonNewLoaded = inbound.filter((l) => l.stage !== 'New').length;
  const orderWonFunnel = [
    { label: 'Total Leads', count: data.inboundTotal + nonNewLoaded },
    { label: 'Follow-up', count: inbound.filter((l) => ['RNR', 'Followup Required'].includes(l.stage)).length },
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
  outbound.filter((l) => l.stage !== 'Lost').forEach((l) => bump(l.company, l.value, l.stage === 'Closed', l.bda));
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
  newOnboardings: number;   // Inbound / Outbound actual (converted)
  revenueTargetL: number;
  clientsTarget: number;
  onboardingsTarget: number;
}

export function computeTargets(data: B2BData, store: TargetStore): RepTargetRow[] {
  const { inbound, outbound, kam } = data;
  return REP_TARGETS.map((cfg) => {
    const goal = store.reps[cfg.rep] || cfg;
    const revenue =
      sum(inbound.filter((l) => l.owner === cfg.rep && l.stage === 'Closed').map((l) => l.value)) +
      sum(outbound.filter((l) => l.bda === cfg.rep && l.stage === 'Closed').map((l) => l.value)) +
      sum(kam.filter((c) => c.kam === cfg.rep && c.stage === 'Closed').map((c) => c.value));
    const activeClients = kam.filter((c) => c.kam === cfg.rep && c.stage !== 'Lost').length;
    const newOnboardings =
      inbound.filter((l) => l.owner === cfg.rep && l.stage === 'Closed').length +
      outbound.filter((l) => l.bda === cfg.rep && l.stage === 'Closed').length;
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
