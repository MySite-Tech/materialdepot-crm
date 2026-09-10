'use client';

import { DashboardLostReason } from '@/lib/api';

export interface WeekDay { day: string; amount: number; count: number }

export interface BranchPieTooltipProps {
  active?: boolean;
  payload?: { payload: { status: string; count: number; value: number } }[];
  total: number;
}

export interface LostPieTooltipProps {
  active?: boolean;
  payload?: { payload: DashboardLostReason }[];
}

export type DashboardView = 'overview' | 'orderLost' | 'categoryRevenue';

export interface DashboardProps {
  branches: string[];
  allowedBranches?: string[];
  orderLostOnly?: boolean;
  canEditTargets?: boolean;
}
