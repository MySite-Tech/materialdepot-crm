'use client';

import type { HealthOverview } from '../../models/account-health';
import type { DashboardMetrics, KamDashboard } from '../../models/analytics';
import type { ClientEntity } from '../../models/client';
import type { TargetStore } from '../../models/performance/types';
import type { B2BData } from '@/lib/b2b';
import type { RevenueReport } from '@/lib/b2b/revenue';

export type OverviewTarget = 'inbound' | 'outreach' | 'kams' | 'clients';

export interface BaseData {
  dashboard: DashboardMetrics;
  kam: KamDashboard;
  health: HealthOverview<ClientEntity>;
  failed: B2BData['failed'];
  clientCount: number;
  targetStore: TargetStore;
  targetsOk: boolean;
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

export interface MonthState {
  report: RevenueReport | null;
  error: string | null;
  loading: boolean;
}
