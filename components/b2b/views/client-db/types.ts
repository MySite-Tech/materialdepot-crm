import { ClientEntity, ClientOrderMetrics, ClientStatus, FirmSpoc, StudioAccess } from '../../models/client';

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

export type ClientColumn = 'contact' | 'gst' | 'orders' | 'enquiries' | 'revenue' | 'avgOrder' | 'openCarts' | 'lastOrder' | 'status' | 'studio' | 'kam' | 'inboundSpoc' | 'outreachSpoc' | 'ecSpoc' | 'clientType' | 'segment' | 'source';

export type FilterKey = 'firm' | ClientColumn;

export type ClientFilters = Partial<Record<FilterKey, string>>;

export type FilterOption = [value: string, label: string];

export interface FilterContext {
  today: string;
  studio: (c: ClientEntity) => StudioAccess | 'none' | null;
  spocs: (c: ClientEntity) => FirmSpoc[];
}

export type SortKey = 'company' | 'orders' | 'revenue' | 'lastOrder';

export interface SortState {
  key: SortKey;
  dir: 'asc' | 'desc';
}
