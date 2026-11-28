import type { B2BTeam } from '../../team/types';
import type { FlowFrom } from '../clients/types';

export type JourneyLens = 'studio' | 'all';

export type JourneySide = 'studio' | 'ec' | 'none';

export type JourneyPath =
  | 'stayedStudio' | 'stayedEc' | 'ecToStudio' | 'studioToEc'
  | 'lostStudio' | 'lostEc'
  | 'new' | 'revived' | 'returning' | 'storeBuyer';

export interface FirmMonth {
  value: number;
  studioValue: number;
  orders: number;
  studioOrders: number;
  categories: Record<string, number>;
  sources: Record<string, number>;
  owner: string;
  team: B2BTeam | null;
}

export interface JourneyFirm {
  key: string;
  name: string;
  months: Record<string, FirmMonth>;
}

export interface FirmSide {
  value: number;
  orders: number;
  aov: number;
  categories: string[];
}

export interface FirmRow {
  key: string;
  name: string;
  path: JourneyPath;
  sideA: JourneySide;
  sideB: JourneySide;
  source: string;
  owner: string;
  a: FirmSide;
  b: FirmSide;
  delta: number;
  spark: number[];
  stopped: string[];
  started: string[];
}

export type BridgeKey = JourneyPath | 'stayedStudioUp' | 'stayedStudioDown' | 'stayedEcUp' | 'stayedEcDown';

export interface BridgeStep {
  key: BridgeKey;
  value: number;
  firms: number;
}

export interface FlowLink {
  from: JourneySide;
  to: JourneySide;
  firms: number;
  valueA: number;
  valueB: number;
  path: JourneyPath;
}

export interface CategoryShift {
  name: string;
  a: number;
  b: number;
  firmsA: number;
  firmsB: number;
}

export interface MonthStat {
  key: string;
  value: number;
  orders: number;
  firms: number;
  aov: number;
}

export interface RetentionCell {
  from: string;
  to: string;
  base: number;
  kept: number;
  baseValue: number;
  keptValue: number;
}

export interface SourceSplit {
  source: string;
  firms: number;
  value: number;
}

export interface Journey {
  a: string;
  b: string;
  lens: JourneyLens;
  startValue: number;
  endValue: number;
  bridge: BridgeStep[];
  links: FlowLink[];
  firms: FirmRow[];
  categories: CategoryShift[];
  months: MonthStat[];
  retention: RetentionCell[];
  sources: SourceSplit[];
}

export type Lifecycle = Map<string, Map<string, FlowFrom>>;
