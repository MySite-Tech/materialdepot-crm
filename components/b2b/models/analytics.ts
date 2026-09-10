import type { B2BData } from '@/lib/b2b';
import {
  INBOUND_STAGES, REP_TARGETS, B2B_ADMINS,
  type InboundLead, type OutreachLead,
  type InboundStage, type RepRole, type TargetStore,
} from './mock-data';
import {
  clientStatus, istToday,
  type ClientEntity, type ClientOrderMetrics, type ClientStatus,
} from './client';
import {
  KAM_OPEN_STATUSES, KAM_PIPELINE_STATUSES,
  kamPipeline, kamPipelineToday, kamFunnel, clientCohort, kamAccountSplit,
  assignedClientRows, callCompliance, lostReasonBreakdown, segmentRevenue,
  newVsRepeat, isAtRisk, temperatureMismatch, DAILY_CALL_TARGET,
  type KamOrder, type CallCompliance, type CohortMonth, type KamAccountSplit,
  type KamFunnel, type KamPipelineSplit, type NewVsRepeat,
} from './kam';

const isInboundDead = (l: InboundLead) => l.stage === 'Lost';

const inboundOpen = (l: InboundLead) => l.stage !== 'Closed' && !isInboundDead(l);
const outreachOpen = (l: OutreachLead) => l.status !== 'Closed' && l.status !== 'Lost';
const kamOpen = (o: KamOrder) => KAM_OPEN_STATUSES.includes(o.status);

const sum = (ns: (number | undefined)[]) => ns.reduce((a: number, b) => a + (Number(b) || 0), 0);

export type ClientMetricsMap = Record<string, ClientOrderMetrics>;

function repUniverse(data: B2BData): string[] {
  const seen = new Set<string>(REP_TARGETS.map((r) => r.rep));
  data.inbound.forEach((l) => l.owner && seen.add(l.owner));
  data.outreach.forEach((l) => l.bm && seen.add(l.bm));
  data.kam.forEach((o) => o.kam && seen.add(o.kam));
  data.clients.forEach((c) => c.kam && seen.add(c.kam));
  return [...seen].filter((r) => !B2B_ADMINS.includes(r));
}

function kamUniverse(data: B2BData): string[] {
  const seen = new Set<string>();
  data.kam.forEach((o) => o.kam && seen.add(o.kam));
  data.clients.forEach((c) => c.kam && seen.add(c.kam));
  return [...seen].sort();
}

export interface DashboardMetrics {
  revenueGenerated: number;
  pipelineByStage: { label: string; count: number }[];
  pipelineByVertical: { inbound: number; outreach: number; kam: number };

  clients: Record<ClientStatus, number>;

  clientMasterEmpty: boolean;
  revenueBySource: { source: string; value: number }[];
}

export function computeDashboard(
  data: B2BData,
  clientMetrics: ClientMetricsMap = {},
  today: string = istToday(),
): DashboardMetrics {
  const { inbound, outreach, kam, clients } = data;

  const wonInbound = inbound.filter((l) => l.stage === 'Closed');
  const wonOutreach = outreach.filter((l) => l.status === 'Closed');
  const wonKam = kam.filter((o) => o.status === 'Closed');

  const revInbound = sum(wonInbound.map((l) => l.value));

  const revOutreach = sum(wonOutreach.map((l) => l.value));

  const revKam = sum(wonKam.map((o) => o.value));

  const newCount =
    data.inboundTotal +
    outreach.filter((l) => l.status === 'Yet to Meet').length;
  const inProgressCount =
    inbound.filter((l) => l.stage === 'Follow up').length +
    outreach.filter((l) => l.status === 'Follow up' || l.status === 'Quote Share').length +
    kam.filter((o) => o.status === 'Requirement Logged' || o.status === 'Quote Shared').length;
  const piCount =
    inbound.filter((l) => l.stage === 'PI Shared').length +
    outreach.filter((l) => l.status === 'PI Shared').length +
    kam.filter((o) => o.status === 'PI Shared').length;
  const wonCount = wonInbound.length + wonOutreach.length + wonKam.length;

  const clientCounts: Record<ClientStatus, number> = { Active: 0, Inactive: 0, Unknown: 0 };
  for (const c of clients) {
    clientCounts[clientStatus(clientMetrics[c.id] || { dateState: 'pending' }, today)]++;
  }

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

      outreach: sum(outreach.filter(outreachOpen).map((l) => l.orderValue || l.expectedOrderValue || 0)),

      kam: sum(kam.filter(kamOpen).map((o) => o.orderValue || o.estimatedValue || 0)),
    },
    clients: clientCounts,
    clientMasterEmpty: clients.length === 0,
    revenueBySource: [
      { source: 'Inbound', value: revInbound },
      { source: 'Outreach', value: revOutreach },
      { source: 'KAM Direct', value: revKam },
    ],
  };
}

interface VerticalPipeline {
  label: string;

  pipeline: number;

  estimatedPipeline: number;
  count: number;

  statuses: string[];
}

interface TemperatureDistribution {
  bands: { label: string; key: string; count: number; color: string }[];
  unscored: number;

  dropped: number;
  mismatches: { company: string; kam?: string; message: string }[];
}

export interface KamDashboard {
  todayPipeline: KamPipelineSplit;
  monthPipeline: KamPipelineSplit;
  verticals: VerticalPipeline[];
  revenue: { inbound: number; outreach: number; kam: number; total: number };
  funnels: { inbound: { label: string; count: number }[]; outreach: { label: string; count: number }[]; kam: KamFunnel };
  cohort: CohortMonth[];
  spocSplit: KamAccountSplit[];
  compliance: CallCompliance[];
  complianceTotals: { logged: number; target: number; overdue: number; dueToday: number };
  temperature: TemperatureDistribution;
  atRisk: { company: string; kam?: string; daysLeft: number; lastContact?: string }[];
  lostReasons: { reason: string; count: number; estimatedValue: number }[];
  segments: { segment: string; revenue: number; clients: number }[];
  newVsRepeat: NewVsRepeat;

  unreadableClients: number;
}

interface KamDashboardOptions {
  clientMetrics?: ClientMetricsMap;

  firstOrderValueFor?: (c: ClientEntity) => number | undefined;
  today?: string;

  range?: { from?: string; to?: string };

  month?: { from: string; to: string };
}

export function computeKamDashboard(data: B2BData, opts: KamDashboardOptions = {}): KamDashboard {
  const today = opts.today || istToday();
  const clientMetrics = opts.clientMetrics || {};
  const { inbound, outreach, kam, clients } = data;
  const kams = kamUniverse(data);

  const rows = assignedClientRows(clients, (c) => clientMetrics[c.id] || { dateState: 'pending' }, today);

  const inboundLive = inbound.filter((l) => l.stage === 'Follow up' || l.stage === 'PI Shared');
  const outreachLive = outreach.filter((l) => l.status === 'Quote Share' || l.status === 'PI Shared');
  const kamLive = kamPipeline(kam);

  const verticals: VerticalPipeline[] = [
    {
      label: 'Inbound',
      pipeline: sum(inboundLive.map((l) => l.orderValue)),
      estimatedPipeline: sum(inboundLive.map((l) => l.expectedOrderValue)),
      count: inboundLive.length,
      statuses: ['Follow up', 'PI Shared'],
    },
    {
      label: 'Outreach',
      pipeline: sum(outreachLive.map((l) => l.orderValue)),
      estimatedPipeline: sum(outreachLive.map((l) => l.expectedOrderValue)),
      count: outreachLive.length,
      statuses: ['Quote Share', 'PI Shared'],
    },
    {
      label: 'KAM',
      pipeline: kamLive.pipeline,
      estimatedPipeline: kamLive.estimatedPipeline,
      count: kamLive.count,
      statuses: [...KAM_PIPELINE_STATUSES],
    },
  ];

  const revInbound = sum(inbound.filter((l) => l.stage === 'Closed').map((l) => l.value));
  const revOutreach = sum(outreach.filter((l) => l.status === 'Closed').map((l) => l.value));
  const revKam = sum(kam.filter((o) => o.status === 'Closed').map((o) => o.value));

  const inRange = (day: string | undefined): boolean => {
    const d = String(day || '').slice(0, 10);
    if (!d) return !opts.range?.from && !opts.range?.to;
    if (opts.range?.from && d < opts.range.from) return false;
    if (opts.range?.to && d > opts.range.to) return false;
    return true;
  };

  const inboundRanged = inbound.filter((l) => inRange(l.statusChangedAt || l.leadCreatedAt));
  const outreachRanged = outreach.filter((l) => inRange(l.statusChangedAt || l.createdAt));

  const compliance = callCompliance(clients, kams, today);
  const complianceTotals = {
    logged: sum(compliance.map((c) => c.logged)),
    target: kams.length * DAILY_CALL_TARGET,
    overdue: sum(compliance.map((c) => c.overdueFollowUps)),
    dueToday: sum(compliance.map((c) => c.dueToday)),
  };

  const bandDefs = [
    { key: 'cold', label: '0–3 · at risk', color: '#EF4444', test: (t: number) => t <= 3 },
    { key: 'warm', label: '4–6 · watch',   color: '#F59E0B', test: (t: number) => t >= 4 && t <= 6 },
    { key: 'hot',  label: '7–10 · healthy',color: '#22C55E', test: (t: number) => t >= 7 },
  ];
  const scored = rows.filter((r) => typeof r.temperature === 'number');
  const temperature: TemperatureDistribution = {
    bands: bandDefs.map((b) => ({
      key: b.key, label: b.label, color: b.color,
      count: scored.filter((r) => b.test(r.temperature as number)).length,
    })),
    unscored: rows.length - scored.length,
    dropped: scored.filter((r) =>
      typeof r.previousTemperature === 'number' && (r.temperature as number) < r.previousTemperature).length,
    mismatches: rows
      .map((r) => ({ r, m: temperatureMismatch(r) }))
      .filter((x) => x.m)
      .map((x) => ({ company: x.r.company, kam: x.r.client.kam, message: x.m!.message })),
  };

  type AtRiskRow = { company: string; kam?: string; daysLeft: number; lastContact?: string };
  const atRisk: AtRiskRow[] = rows
    .map((r): AtRiskRow | null => {
      const metrics = r.metrics;
      const last = String(metrics.lastOrderPlaced || '').slice(0, 10);
      if (!last) return null;
      const [ly, lm, ld] = last.split('-').map(Number);
      const expiry = new Date(Date.UTC(ly, lm - 1 + 3, ld)).getTime();
      const now = Date.parse(`${today}T00:00:00Z`);
      const daysLeft = Number.isNaN(expiry) || Number.isNaN(now)
        ? undefined
        : Math.max(0, Math.round((expiry - now) / 86_400_000));
      return isAtRisk(r, daysLeft)
        ? { company: r.company, kam: r.client.kam, daysLeft: daysLeft as number, lastContact: r.lastInteraction?.date }
        : null;
    })
    .filter((x): x is AtRiskRow => x !== null)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  return {
    todayPipeline: kamPipelineToday(kam, today),
    monthPipeline: kamPipeline(
      opts.month
        ? kam.filter((o) => {
          const d = String(o.statusChangedAt || o.createdAt || '').slice(0, 10);
          return !!d && d >= opts.month!.from && d <= opts.month!.to;
        })
        : kam,
    ),
    verticals,
    revenue: { inbound: revInbound, outreach: revOutreach, kam: revKam, total: revInbound + revOutreach + revKam },
    funnels: {
      inbound: INBOUND_STAGES.map((label) => ({
        label,
        count: label === 'New' ? data.inboundTotal : inboundRanged.filter((l) => l.stage === label).length,
      })),
      outreach: (['Yet to Meet', 'Follow up', 'Quote Share', 'PI Shared', 'Closed', 'Lost'] as const)
        .map((label) => ({ label, count: outreachRanged.filter((l) => l.status === label).length })),
      kam: kamFunnel(kam, opts.range),
    },
    cohort: clientCohort(clients, opts.range),
    spocSplit: kamAccountSplit(rows, kam, kams),
    compliance,
    complianceTotals,
    temperature,
    atRisk,
    lostReasons: lostReasonBreakdown(kam),
    segments: segmentRevenue(rows),
    newVsRepeat: newVsRepeat(rows, opts.firstOrderValueFor || (() => undefined)),
    unreadableClients: rows.filter((r) => r.status === 'Unknown').length,
  };
}

interface RepLeaderboardRow {
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
  const { inbound, outreach, kam, clients } = data;

  const leaderboard: RepLeaderboardRow[] = repUniverse(data)
    .map((rep) => ({
      rep,

      inbound: (data.inboundOwnerTotals[rep] || 0) + inbound.filter((l) => l.owner === rep && l.stage !== 'New').length,
      outreach: outreach.filter((l) => l.bm === rep).length,

      clients: clients.filter((c) => c.kam === rep).length,
      revenue:
        sum(inbound.filter((l) => l.owner === rep && l.stage === 'Closed').map((l) => l.value)) +
        sum(outreach.filter((l) => l.bm === rep && l.status === 'Closed').map((l) => l.value)) +
        sum(kam.filter((o) => o.kam === rep && o.status === 'Closed').map((o) => o.value)),
    }))
    .sort((a, b) => b.revenue - a.revenue || b.clients - a.clients || b.inbound + b.outreach - (a.inbound + a.outreach));

  const closing = [
    ...inbound.filter((l) => inboundOpen(l) && withinDays(l.followUpDate, now, 7)).map((l) => ({ company: l.company, expected: l.followUpDate!, value: l.value })),
    ...outreach.filter((l) => outreachOpen(l) && withinDays(l.expectedClosure, now, 7)).map((l) => ({ company: l.company, expected: l.expectedClosure!, value: l.orderValue || l.expectedOrderValue || 0 })),
    ...kam.filter((o) => kamOpen(o) && withinDays(o.expectedClosure, now, 7)).map((o) => ({ company: o.company, expected: o.expectedClosure!, value: o.orderValue || o.estimatedValue || 0 })),
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
  kam.filter((o) => o.status !== 'Lost').forEach((o) => bump(o.company, o.value, o.status === 'Closed', o.kam));

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

export interface RepTargetRow {
  rep: string;
  role: RepRole;
  revenue: number;
  activeClients: number;
  newOnboardings: number;
  revenueTargetL: number;
  clientsTarget: number;
  onboardingsTarget: number;
}

export function computeTargets(data: B2BData, store: TargetStore): RepTargetRow[] {
  const { inbound, outreach, kam, clients } = data;
  return REP_TARGETS.map((cfg) => {
    const goal = store.reps[cfg.rep] || cfg;
    const revenue =
      sum(inbound.filter((l) => l.owner === cfg.rep && l.stage === 'Closed').map((l) => l.value)) +
      sum(outreach.filter((l) => l.bm === cfg.rep && l.status === 'Closed').map((l) => l.value)) +
      sum(kam.filter((o) => o.kam === cfg.rep && o.status === 'Closed').map((o) => o.value));

    const activeClients = clients.filter((c) => c.kam === cfg.rep).length;
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
