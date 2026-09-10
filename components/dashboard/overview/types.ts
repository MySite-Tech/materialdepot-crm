'use client';

import { DashboardLostReason } from '@/lib/api';

export interface WeekDay { day: string; amount: number; count: number }

export interface DateRange { from: string; to: string }

export interface BranchPieTooltipProps {
  active?: boolean;
  payload?: { payload: { status: string; count: number; value: number } }[];
  total: number;
}

export interface LostPieTooltipProps {
  active?: boolean;
  payload?: { payload: DashboardLostReason }[];
}

export interface FilterChipProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  color?: { active: string };
}

export interface DateChipProps {
  label: string;
  value: DateRange;
  onChange: (v: DateRange) => void;
  color?: { active: string };
}

export interface DashboardProps {
  branches: string[];
  allowedBranches?: string[];
  orderLostOnly?: boolean;
}
