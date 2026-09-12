'use client';

import { OrgPerson, StakeholderRole } from '@/lib/org';

export interface TeamMetrics {
  footfall: number | null;
  carts: number | null;
  cartPct: number | null;
  orders: number;
  salesValue: number;
  aov: number | null;
  convPct: number | null;
  pipelineCount: number;
  pipelineValue: number;
  lostCount: number;
}

export interface TeamRow {
  person: OrgPerson;
  metrics: TeamMetrics | null;
  footfallMatched: boolean;
}

export interface TeamPerformance {
  rows: TeamRow[];
  leadsFailed: boolean;
  footfallFailed: boolean;
  footfallAmbiguous: number;
  loading: boolean;
}

export interface TeamFilters {
  positions: StakeholderRole[];
  query: string;
}
