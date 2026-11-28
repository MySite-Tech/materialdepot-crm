import type { FlowClient, FlowSide } from '@/lib/b2b/revenue';

export interface FlowRowDef {
  key: string;
  group: 'ordering' | 'moved';
  label: string;
  hint: string;
  split: boolean;
  pick: (c: FlowClient) => boolean;
}

export interface FlowCell {
  count: number;
  value: number;
  bySide: Record<FlowSide, number>;
  gapUnknown: number;
}

export interface Picked {
  row: string;
  month: string;
}

export interface ListRow {
  key: string;
  name: string;
  now: string;
  before: string;
  value: number;
  orders: number | null;
}

export interface UnregisteredCell {
  count: number;
  value: number;
  business: number;
  proprietor: number;
}
