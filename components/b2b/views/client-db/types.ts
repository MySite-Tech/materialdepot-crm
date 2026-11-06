import { ClientEntity, ClientOrderMetrics, ClientStatus } from '../../models/client';

export type ClientLens = 'all' | 'active' | 'm1to3' | 'm3to6' | 'm6to12' | 'm12plus' | 'never' | 'unknown' | 'nokam' | 'pending';

export interface ClientLensMeta {
  title: string;
  heading: string;
  rule: string;
  empty: string;
  accent: string;
}

export interface ClientListRow {
  client: ClientEntity;
  metrics: ClientOrderMetrics;
  status: ClientStatus;
  days?: number;
}

export interface ClientFilters {
  segment: string;
  type: string;
  kam: string;
}

export type ClientColumn = 'contact' | 'gst' | 'orders' | 'enquiries' | 'revenue' | 'avgOrder' | 'openCarts' | 'lastOrder' | 'status' | 'studio' | 'kam' | 'inboundSpoc' | 'outreachSpoc' | 'ecSpoc' | 'clientType' | 'segment' | 'source';

export type SortKey = 'company' | 'orders' | 'revenue' | 'lastOrder';

export interface SortState {
  key: SortKey;
  dir: 'asc' | 'desc';
}
