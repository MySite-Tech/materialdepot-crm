import type { RevenueChannel } from '../types';

export type FlowSide = 'studio' | 'ec';

export type FlowFrom = 'new' | 'revived' | 'studio' | 'ec' | 'retail';

export interface DigestOrder {
  phone: string;
  channel: RevenueChannel;
  value: number;
  name: string;
}

export interface MonthDigest {
  key: string;
  buyers: string[];
  orders: DigestOrder[];
  truncated: boolean;
  generatedAt: string;
}

export interface ClientGroup {
  key: string;
  name: string;
}

export interface FlowClient {
  key: string;
  name: string;
  side: FlowSide;
  from: FlowFrom;
  value: number;
  studioValue: number;
  orders: number;
  lastBefore: string | null;
  firstOrder: string | null;
  gapUnknown: boolean;
}

export interface ChurnedClient {
  key: string;
  name: string;
  side: FlowSide;
  lastMonth: string;
  value: number;
}

export interface FlowMonth {
  key: string;
  label: string;
  partial: boolean;
  truncated: boolean;
  clients: FlowClient[];
  churned: ChurnedClient[];
  phones: string[];
}

export interface ClientFlowReport {
  months: FlowMonth[];
  historyFrom: string;
  historyOk: boolean;
  studioOk: boolean;
  redirectsOk: boolean;
  teamOk: boolean;
  generatedAt: string;
}
