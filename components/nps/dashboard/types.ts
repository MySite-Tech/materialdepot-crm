'use client';

export type Bucket = 'Promoter' | 'Passive' | 'Detractor';

export type Cat = 'promoter' | 'passive' | 'detractor';

export type Understood = 'all' | 'yes' | 'no';

export type CatFilter = 'all' | Cat;

export interface Metrics {
  nps: number | null; total: number; responseRate: number | null;
  promoterPct: number | null; detractorPct: number | null; avg: number | null;
}

export interface KpiTileProps { label: string; value: string; accent: string; valueClass?: string; delta?: React.ReactNode }

export interface NPSDashboardProps {
  branches?: string[];
  allowedBranches?: string[];
}

export type SortKey = 'name' | 'contact' | 'store' | 'bm' | 'visit' | 'waiting' | 'score' | 'understood';
