
export type DimKey = 'channel' | 'source' | 'branch' | 'rep' | 'category' | 'team' | 'person' | 'clientType' | 'size' | 'firm';

export type AnalysisFilter = Partial<Record<DimKey, string[]>>;

export interface Totals {
  value: number;
  orders: number;
  firms: number;
  aov: number;
}

export interface ChangeRow {
  key: string;
  focus: Totals;
  compare: Totals;
  delta: number;
}

export interface HeatRow {
  key: string;
  cells: (number | null)[];
  total: number;
}

export interface Option {
  key: string;
  value: number;
}

export type ChangeSort = 'change' | 'value';


export interface Bridge {
  volume: number;
  ticket: number;
}
