export type Segregation = 'Core' | 'Non-Core' | 'Special' | 'Unclassified';

export type BucketKey = 'total' | 'core' | 'nonCore' | 'special';

export interface CategoryRow {
  name: string;
  segregation: Segregation;
  unmatched: boolean;
}

export interface SegregationTable {
  segregation: Segregation;
  rows: CategoryRow[];
  queryNames: string[];
}

export interface Metrics {
  carts: number;
  orders: number;
  revenue: number;
}

export interface BucketResult {
  byStore: Record<string, Metrics>;
  overall: Metrics;
}

export interface StoreTarget {
  total: number;
  core: number;
  nonCore: number;
  special: number;
}

export type CategoryTargets = Record<string, Record<string, StoreTarget>>;

export type StoreActuals = Record<BucketKey, number | null>;

export interface CategoryRevenueProps {
  branches: string[];
  allowedBranches: string[];
  canEditTargets: boolean;
}
