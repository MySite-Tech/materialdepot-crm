'use client';

type DrillHit = 'yes' | 'no' | 'na';

export type DrillRow = {
  pi: string;
  customer: string;
  phone: string;
  bm: string;
  person: string;
  slot: string;
  date: string;
  result: string;
  hit: DrillHit;
};

export type Drill = { title: string; note: string; rows: DrillRow[]; summary?: string };

export interface AnalyticsData {
  installs: any[];
  audits: any[];
  ratings: any[];

  auditSignOk: boolean;
}

export interface AnalyticsState {
  loading: boolean;
  error: boolean;
  data: AnalyticsData | null;
}
