'use client';

import type { HealthOverview } from '../../models/account-health';
import type { DashboardMetrics, KamDashboard } from '../../models/analytics';
import type { ClientEntity } from '../../models/client';
import type { TargetStore } from '../../models/performance/types';
import type { B2BData, B2BPipelineStats } from '@/lib/b2b';

export type RangeKey = 'month' | 'lastMonth' | 'all';

export type OverviewTarget = 'inbound' | 'outreach' | 'kams' | 'clients';

export interface BaseData {
  dashboard: DashboardMetrics;
  kam: KamDashboard;
  health: HealthOverview<ClientEntity>;
  failed: B2BData['failed'];
  clientCount: number;
  unresolvedOrders: number;
  targetStore: TargetStore;
  targetsOk: boolean;
}

export interface RangeData {
  stats: B2BPipelineStats;
  statsOk: boolean;
  basisApplied: boolean;
  open: { count: number; value: number };
}

export interface MonthPace {
  target: number;
  revenue: number;
  achievedPct: number;
  expectedPct: number;
  projection: number;
  perDayNeeded: number;
  daysLeft: number;
  monthLabel: string;
}

export interface KamDeskRow {
  kam: string;
  clients: number;
  active: number;
  unknown: number;
  openOrders: number;
  pipeline: number;
  revenue: number;
  logged: number;
  callTarget: number;
  overdue: number;
}
