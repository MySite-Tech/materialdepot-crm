import type { PointerPatternKey, RemarksDictName } from '@/lib/api';

export type Dicts = Record<RemarksDictName, string[]>;

export interface Remark {
  id: number;
  day: string;
  mins: number;
  len: number;
  author: number;
  owner: number;
  branch: number;
  type: number;
  lead: string;
  created: string;
  followup: string;
  closure: string;
  prio: number;
  cats: number;
  value: number | null;
  status: number;
  auto: boolean;
  th: number;
  pt: number;
  rk: number;
  copies: number;
}

export interface Walkin {
  day: string;
  lead: string;
  src: number;
  owner: number;
  branch: number;
}

export interface Dataset {
  generated: string;
  days: number;
  dicts: Dicts;
  remarks: Remark[];
  walkins: Walkin[];
  rx: Record<PointerPatternKey, string>;
  minDay: string;
}

export type DateRange = [string, string];

export type MultiKey = 'branch' | 'rk' | 'bm' | 'owner' | 'status' | 'prio' | 'type' | 'cats';
export type DateKey = 'date' | 'created' | 'followup' | 'closure';
export type FilterKey = MultiKey | DateKey;

export interface Filters {
  date: DateRange;
  created: DateRange;
  followup: DateRange;
  closure: DateRange;
  branch: Array<number>;
  rk: Array<number>;
  bm: Array<number>;
  owner: Array<number>;
  status: Array<number>;
  prio: Array<number>;
  type: Array<number>;
  cats: Array<string>;
  minVal: string;
  auto: boolean;
  lost: boolean;
  walk: boolean;
  copyNothing: boolean;
}

export type ScoreMode = 'pt' | 'len';
export type LeadMode = 'best' | 'union';
export type Thresholds = [number, number, number];

export interface ScoreCtx {
  copyNothing: boolean;
  leadMode: LeadMode;
  thresholds: Thresholds;
}

export interface LeadStats {
  n: number;
  sum: number;
  d: [number, number, number, number, number];
  cov: [number, number, number, number];
  avg: number;
}

export interface Group<K = number | string> {
  k: K;
  n: number;
  b: [number, number, number, number];
  cp: number;
  len: number;
  leads: Set<string>;
  br: Map<number, number>;
  lm: Map<string, number>;
  L: LeadStats;
}

export type DrillGroup = 'none' | 'bm' | 'date' | 'lead';

export interface DrillRequest {
  title: string;
  match: (r: Remark) => boolean;
  tab?: number;
  group?: DrillGroup;
}

export interface ViewProps {
  ds: Dataset;
  filters: Filters;
  ctx: ScoreCtx;
  cur: Remark[];
  onDrill: (d: DrillRequest) => void;
}

export type View = 'dash' | 'cards' | 'bm';
