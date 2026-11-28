'use client';

import { CRMLeadsStats, FootfallBMRow } from '@/lib/api';

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

export interface TeamQuery {
  dateFrom: string;
  dateTo: string;
  branch: string;
}

export interface FootfallIndex {
  byName: Map<string, FootfallBMRow>;
  ambiguous: Set<string>;
}

export interface TeamFootfall {
  index: FootfallIndex;
  failed: boolean;
  loading: boolean;
}

export interface TeamLeadStats {
  total: CRMLeadsStats | null;
  totalFailed: boolean;
  byPhone: Record<string, CRMLeadsStats>;
  failedPhones: Set<string>;
  loading: boolean;
}
