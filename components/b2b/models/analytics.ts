import type { B2BData } from '@/lib/b2b';
import {
  INBOUND_STAGES, REP_TARGETS,
  type InboundLead, type OutreachLead,
  type RepRole, type TargetStore,
} from './mock-data';
import {
  clientStatus, istToday,
  type ClientEntity, type ClientOrderMetrics, type ClientStatus,
} from './client';
import { INBOUND_FOLLOW_UP_STATUSES, INBOUND_NURTURE_STATUS, isFollowUpStatus } from './inbound';
import {
  KAM_OPEN_STATUSES, KAM_PIPELINE_STATUSES,
  kamPipeline, kamPipelineToday, kamFunnel, clientCohort, kamAccountSplit,
  assignedClientRows, callCompliance, lostReasonBreakdown, segmentRevenue,
  newVsRepeat, isAtRisk, kamDaysToLapse, temperatureMismatch, DAILY_CALL_TARGET,
  type KamOrder, type CallCompliance, type CohortMonth, type KamAccountSplit,
  type KamFunnel, type KamPipelineSplit, type NewVsRepeat,
} from './kam';

const isInboundDead = (l: InboundLead) => l.stage === 'Lost' || l.stage === 'Invalid';

const inboundOpen = (l: InboundLead) => l.stage !== 'Closed' && !isInboundDead(l);
const outreachOpen = (l: OutreachLead) => l.status !== 'Closed' && l.status !== 'Lost';
const kamOpen = (o: KamOrder) => KAM_OPEN_STATUSES.includes(o.status);

const sum = (ns: (number | undefined)[]) => ns.reduce((a: number, b) => a + (Number(b) || 0), 0);

export type ClientMetricsMap = Record<string, ClientOrderMetrics>;

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
    inbound.filter((l) => l.stage === 'Follow up' || l.stage === INBOUND_NURTURE_STATUS).length +
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

  const inboundLive = inbound.filter((l) => isFollowUpStatus(l.stage));
  const outreachLive = outreach.filter((l) => l.status === 'Quote Share' || l.status === 'PI Shared');
  const kamLive = kamPipeline(kam);

  const verticals: VerticalPipeline[] = [
    {
      label: 'Inbound',
      pipeline: sum(inboundLive.map((l) => l.orderValue)),
      estimatedPipeline: sum(inboundLive.map((l) => l.expectedOrderValue)),
      count: inboundLive.length,
      statuses: [...INBOUND_FOLLOW_UP_STATUSES],
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
    .filter(isAtRisk)
    .map((r) => ({ company: r.company, kam: r.client.kam, daysLeft: kamDaysToLapse(r.metrics, today) ?? 0, lastContact: r.lastInteraction?.date }))
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

export function computeTargets(
  data: B2BData,
  store: TargetStore,
  range?: { from: string; to: string },
): RepTargetRow[] {
  const { inbound, outreach, kam, clients } = data;

  const inRange = (day: string | undefined): boolean => {
    if (!range) return true;
    const d = String(day || '').slice(0, 10);
    if (!d) return false;
    return d >= range.from && d <= range.to;
  };
  const closedInbound = inbound.filter((l) =>
    l.stage === 'Closed' && inRange(l.statusChangedAt || l.leadCreatedAt));
  const closedOutreach = outreach.filter((l) =>
    l.status === 'Closed' && inRange(l.statusChangedAt || l.createdAt));
  const closedKam = kam.filter((o) =>
    o.status === 'Closed' && inRange(o.statusChangedAt || o.createdAt));

  return REP_TARGETS.map((cfg) => {
    const goal = store.reps[cfg.rep] || cfg;
    const revenue =
      sum(closedInbound.filter((l) => l.owner === cfg.rep).map((l) => l.value)) +
      sum(closedOutreach.filter((l) => l.bm === cfg.rep).map((l) => l.value)) +
      sum(closedKam.filter((o) => o.kam === cfg.rep).map((o) => o.value));

    const activeClients = clients.filter((c) => c.kam === cfg.rep).length;
    const newOnboardings =
      closedInbound.filter((l) => l.owner === cfg.rep).length +
      closedOutreach.filter((l) => l.bm === cfg.rep).length;
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
